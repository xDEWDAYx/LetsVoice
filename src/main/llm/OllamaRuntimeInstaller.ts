import fs from 'fs/promises';
import path from 'path';
import ArchiveExtractor from '../runtime/ArchiveExtractor';
import FileDownloadService, {
  DownloadProgress,
} from '../runtime/FileDownloadService';
import LocalProcessRunner from '../runtime/LocalProcessRunner';
import { ManagedPaths } from '../runtime/ManagedPaths';
import OllamaReleaseClient from './OllamaReleaseClient';
import OllamaRuntimeArchive from './OllamaRuntimeArchive';
import OllamaRuntimeService, {
  OllamaRuntimeStatus,
} from './OllamaRuntimeService';

export type OllamaInstallProgress = {
  phase: 'checking' | 'downloading' | 'extracting' | 'installing' | 'completed';
  message: string;
  receivedBytes?: number;
  totalBytes?: number | null;
};

/** 安装官方 Windows Ollama 便携包，不包含任何语言模型。 */
export default class OllamaRuntimeInstaller {
  private readonly managedPaths: ManagedPaths;

  private readonly runtimeService: OllamaRuntimeService;

  private readonly downloader: FileDownloadService;

  private readonly processRunner: LocalProcessRunner;

  private installPromise: Promise<OllamaRuntimeStatus> | null = null;

  public constructor(
    managedPaths = ManagedPaths.getInstance(),
    runtimeService = new OllamaRuntimeService(),
    downloader = new FileDownloadService(),
    processRunner = new LocalProcessRunner(),
  ) {
    this.managedPaths = managedPaths;
    this.runtimeService = runtimeService;
    this.downloader = downloader;
    this.processRunner = processRunner;
  }

  public install(
    onProgress?: (progress: OllamaInstallProgress) => void,
    signal?: AbortSignal,
  ): Promise<OllamaRuntimeStatus> {
    if (this.installPromise) return this.installPromise;
    this.installPromise = this.installRuntime(onProgress, signal).finally(
      () => {
        this.installPromise = null;
      },
    );
    return this.installPromise;
  }

  private async installRuntime(
    onProgress?: (progress: OllamaInstallProgress) => void,
    signal?: AbortSignal,
  ): Promise<OllamaRuntimeStatus> {
    const currentStatus = await this.runtimeService.getStatus();
    if (currentStatus.binaryPresent) return currentStatus;

    onProgress?.({
      phase: 'checking',
      message: '正在查询官方 Ollama release / Checking official release',
    });
    const release = await OllamaReleaseClient.getLatest(signal);
    const paths = this.managedPaths.ensureRuntimeDirectories('llm');
    const archivePath = path.join(paths.cacheRoot, release.assetName);
    const extractRoot = path.join(paths.cacheRoot, 'ollama-runtime-extract');
    const stagingBin = path.join(paths.runtimeRoot, 'bin-installing');
    const installedBin = path.join(paths.runtimeRoot, 'bin');

    try {
      await Promise.all([
        fs.rm(extractRoot, { recursive: true, force: true }),
        fs.rm(stagingBin, { recursive: true, force: true }),
      ]);
      await fs.mkdir(extractRoot, { recursive: true });
      onProgress?.({
        phase: 'downloading',
        message: '正在下载 Ollama 运行时 / Downloading Ollama runtime',
      });
      await this.downloader.download(release.downloadUrl, archivePath, {
        expectedSha256: release.sha256,
        signal,
        onProgress: (progress) =>
          onProgress?.(OllamaRuntimeInstaller.toProgress(progress)),
      });

      onProgress?.({
        phase: 'extracting',
        message: '正在解压 Ollama 运行时 / Extracting Ollama runtime',
      });
      await ArchiveExtractor.extract(
        archivePath,
        extractRoot,
        this.processRunner,
        { signal },
      );

      const executable = await OllamaRuntimeArchive.findExecutable(extractRoot);
      if (!executable) throw new Error('压缩包中没有 ollama.exe');
      onProgress?.({
        phase: 'installing',
        message: '正在安装 Ollama 运行时 / Installing Ollama runtime',
      });
      await OllamaRuntimeArchive.copyRuntime(executable, stagingBin);
      await fs.rm(installedBin, { recursive: true, force: true });
      await fs.rename(stagingBin, installedBin);
      await fs.writeFile(
        paths.manifestPath,
        `${JSON.stringify(
          {
            installedAt: new Date().toISOString(),
            source: release.source,
            release: release.tag,
            asset: release.assetName,
            digest: release.digest,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );

      const installedStatus = await this.runtimeService.getStatus();
      if (!installedStatus.binaryPresent) {
        throw new Error('Ollama 运行时安装后仍不可用');
      }
      onProgress?.({
        phase: 'completed',
        message: 'Ollama 运行时安装完成 / Runtime installed',
      });
      return installedStatus;
    } finally {
      await Promise.all([
        fs.rm(archivePath, { force: true }),
        fs.rm(extractRoot, { recursive: true, force: true }),
        fs.rm(stagingBin, { recursive: true, force: true }),
      ]);
    }
  }

  private static toProgress(progress: DownloadProgress): OllamaInstallProgress {
    return {
      phase: 'downloading',
      message: '正在下载 Ollama 运行时 / Downloading Ollama runtime',
      receivedBytes: progress.receivedBytes,
      totalBytes: progress.totalBytes,
    };
  }
}
