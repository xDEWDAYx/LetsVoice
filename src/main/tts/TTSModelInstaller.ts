import fs from 'fs/promises';
import path from 'path';
import ArchiveExtractor from '../runtime/ArchiveExtractor';
import FileDownloadService from '../runtime/FileDownloadService';
import LocalProcessRunner from '../runtime/LocalProcessRunner';
import { ManagedPaths } from '../runtime/ManagedPaths';
import TTSModelStorage from './TTSModelStorage';
import TTSRuntimeArchive from './TTSRuntimeArchive';
import { TTSInstallProgress } from './TTSInstallSupport';
import { TTSModelCatalogItem } from './TTSModelCatalog';

/** 只将固定目录里的官方、已校验资产原子安装到 userData。 */
export default class TTSModelInstaller {
  private readonly paths: ManagedPaths;

  private readonly storage: TTSModelStorage;

  private readonly downloader: FileDownloadService;

  private readonly runner: LocalProcessRunner;

  public constructor(
    paths: ManagedPaths,
    storage: TTSModelStorage,
    downloader = new FileDownloadService(),
    runner = new LocalProcessRunner(),
  ) {
    this.paths = paths;
    this.storage = storage;
    this.downloader = downloader;
    this.runner = runner;
  }

  public async install(
    item: TTSModelCatalogItem,
    onProgress?: (progress: TTSInstallProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const runtimePaths = this.paths.ensureRuntimeDirectories('tts');
    const modelDir = this.storage.getInstallPath(item);
    const stagingDir = path.join(
      runtimePaths.modelsRoot,
      `${item.id}-installing`,
    );
    if (
      !this.paths.isManagedPath(modelDir) ||
      !this.paths.isManagedPath(stagingDir)
    ) {
      throw new Error('TTS 安装路径不在应用受管目录中');
    }

    await fs.rm(stagingDir, { recursive: true, force: true });
    try {
      if (item.installation.kind === 'archive') {
        await this.installArchive(item, stagingDir, onProgress, signal);
      } else {
        await this.installFiles(item, stagingDir, onProgress, signal);
      }

      const missingChecks = item.requiredFiles.map((relativePath) =>
        fs
          .access(path.join(stagingDir, relativePath))
          .then(() => false)
          .catch(() => true),
      );
      const missingFlags = await Promise.all(missingChecks);
      const missingPaths = item.requiredFiles.filter(
        (_relativePath, index) => missingFlags[index],
      );
      if (missingPaths.length > 0) {
        throw new Error(`TTS 安装文件不完整: ${missingPaths.join(', ')}`);
      }

      // 只覆盖同一目录项的残缺安装，不会触碰其他模型。
      await fs.rm(modelDir, { recursive: true, force: true });
      await fs.rename(stagingDir, modelDir);
      onProgress?.({ phase: 'completed', message: `${item.name} 安装完成` });
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
  }

  private async installArchive(
    item: TTSModelCatalogItem,
    stagingDir: string,
    onProgress?: (progress: TTSInstallProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (item.installation.kind !== 'archive') return;
    const runtimePaths = this.paths.getRuntimePaths('tts');
    const archivePath = path.join(runtimePaths.cacheRoot, `${item.id}.tar.bz2`);
    const extractRoot = path.join(runtimePaths.cacheRoot, `${item.id}-extract`);
    try {
      await fs.rm(extractRoot, { recursive: true, force: true });
      await fs.mkdir(extractRoot, { recursive: true });
      onProgress?.({ phase: 'downloading', message: `正在下载 ${item.name}` });
      await this.downloader.download(item.installation.url, archivePath, {
        expectedSha256: item.installation.sha256,
        signal,
        onProgress: (progress) =>
          onProgress?.({
            phase: 'downloading',
            message: `正在下载 ${item.name}`,
            receivedBytes: progress.receivedBytes,
            totalBytes: progress.totalBytes,
          }),
      });
      onProgress?.({ phase: 'extracting', message: `正在解压 ${item.name}` });
      await ArchiveExtractor.extract(archivePath, extractRoot, this.runner, {
        signal,
      });
      const source = await TTSRuntimeArchive.findModelRoot(
        extractRoot,
        item.requiredFiles,
      );
      if (!source) throw new Error(`${item.name} 压缩包缺少必需文件`);
      onProgress?.({ phase: 'installing', message: `正在安装 ${item.name}` });
      await TTSRuntimeArchive.copyModel(source, stagingDir);
    } finally {
      await Promise.all([
        fs.rm(archivePath, { force: true }),
        fs.rm(extractRoot, { recursive: true, force: true }),
      ]);
    }
  }

  private async installFiles(
    item: TTSModelCatalogItem,
    stagingDir: string,
    onProgress?: (progress: TTSInstallProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (item.installation.kind !== 'files') return;
    const totalBytes = item.installation.assets.reduce(
      (total, asset) => total + asset.sizeBytes,
      0,
    );
    let completedBytes = 0;
    await fs.mkdir(stagingDir, { recursive: true });

    // 同一模型的外部数据文件按顺序落盘，进度按总字节累计。
    // eslint-disable-next-line no-restricted-syntax
    for (const asset of item.installation.assets) {
      const destination = path.join(stagingDir, asset.relativePath);
      const previouslyCompletedBytes = completedBytes;
      // eslint-disable-next-line no-await-in-loop
      await this.downloader.download(asset.url, destination, {
        expectedSha256: asset.sha256,
        signal,
        onProgress: (progress) =>
          onProgress?.({
            phase: 'downloading',
            message: `正在下载 ${item.name}`,
            receivedBytes: previouslyCompletedBytes + progress.receivedBytes,
            totalBytes,
          }),
      });
      completedBytes += asset.sizeBytes;
    }
    onProgress?.({ phase: 'installing', message: `正在验证 ${item.name}` });
  }
}
