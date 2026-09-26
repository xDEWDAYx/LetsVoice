import fs from 'fs/promises';
import path from 'path';
import ArchiveExtractor from '../runtime/ArchiveExtractor';
import FileDownloadService, {
  DownloadProgress,
} from '../runtime/FileDownloadService';
import LocalProcessRunner from '../runtime/LocalProcessRunner';
import { ManagedPaths } from '../runtime/ManagedPaths';
import WhisperRuntimeService, {
  WhisperRuntimeStatus,
} from './WhisperRuntimeService';
import WhisperReleaseClient from './WhisperReleaseClient';
import WhisperRuntimeArchive from './WhisperRuntimeArchive';

export type RuntimeInstallProgress = {
  phase: 'checking' | 'downloading' | 'extracting' | 'installing' | 'completed';
  message: string;
  receivedBytes?: number;
  totalBytes?: number | null;
};

/** 在 Windows 上安装官方 whisper.cpp CPU 运行时，不包含模型文件。 */
export default class WhisperRuntimeInstaller {
  private readonly managedPaths: ManagedPaths;

  private readonly runtimeService: WhisperRuntimeService;

  private readonly downloader: FileDownloadService;

  private readonly processRunner: LocalProcessRunner;

  public constructor(
    managedPaths = ManagedPaths.getInstance(),
    runtimeService = new WhisperRuntimeService(managedPaths),
    downloader = new FileDownloadService(),
    processRunner = new LocalProcessRunner(),
  ) {
    this.managedPaths = managedPaths;
    this.runtimeService = runtimeService;
    this.downloader = downloader;
    this.processRunner = processRunner;
  }

  public async install(
    onProgress?: (progress: RuntimeInstallProgress) => void,
    signal?: AbortSignal,
  ): Promise<WhisperRuntimeStatus> {
    const currentStatus = this.runtimeService.getStatus();
    if (currentStatus.whisperCliPresent) return currentStatus;

    onProgress?.({
      phase: 'checking',
      message: '正在查询官方 Whisper release / Checking official release',
    });
    const release = await WhisperReleaseClient.getLatest(signal);

    const { cacheRoot, manifestPath } =
      this.managedPaths.ensureRuntimeDirectories('stt');
    const archivePath = path.join(cacheRoot, `whisper-${release.assetName}`);
    const extractRoot = path.join(cacheRoot, 'whisper-runtime-extract');
    const binDir = this.runtimeService.getPortableBinDir();

    try {
      await fs.rm(extractRoot, { recursive: true, force: true });
      await fs.mkdir(extractRoot, { recursive: true });
      onProgress?.({
        phase: 'downloading',
        message: '正在下载 Whisper 运行时 / Downloading Whisper runtime',
      });
      await this.downloader.download(release.downloadUrl, archivePath, {
        expectedSha256: release.sha256,
        signal,
        onProgress: (progress) =>
          onProgress?.(WhisperRuntimeInstaller.toDownloadProgress(progress)),
      });

      onProgress?.({
        phase: 'extracting',
        message: '正在解压 Whisper 运行时 / Extracting Whisper runtime',
      });
      await ArchiveExtractor.extract(
        archivePath,
        extractRoot,
        this.processRunner,
        {
          signal,
        },
      );

      const cliPath = await WhisperRuntimeArchive.findCli(extractRoot);
      if (!cliPath) {
        throw new Error('运行时压缩包缺少 whisper-cli.exe');
      }

      onProgress?.({
        phase: 'installing',
        message: '正在安装 Whisper 运行时 / Installing Whisper runtime',
      });
      await WhisperRuntimeArchive.copyRuntimeFiles(
        path.dirname(cliPath),
        binDir,
      );
      await fs.writeFile(
        manifestPath,
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

      const installedStatus = this.runtimeService.getStatus();
      if (!installedStatus.whisperCliPresent) {
        throw new Error('Whisper 运行时安装后仍不可用');
      }
      onProgress?.({
        phase: 'completed',
        message: 'Whisper 运行时安装完成 / Runtime installed',
      });
      return installedStatus;
    } finally {
      await Promise.all([
        fs.rm(archivePath, { force: true }),
        fs.rm(extractRoot, { recursive: true, force: true }),
      ]);
    }
  }

  private static toDownloadProgress(
    progress: DownloadProgress,
  ): RuntimeInstallProgress {
    return {
      phase: 'downloading',
      message: '正在下载 Whisper 运行时 / Downloading Whisper runtime',
      receivedBytes: progress.receivedBytes,
      totalBytes: progress.totalBytes,
    };
  }
}
