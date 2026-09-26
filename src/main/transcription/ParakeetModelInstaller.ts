import fs from 'fs/promises';
import path from 'path';
import ArchiveExtractor from '../runtime/ArchiveExtractor';
import FileDownloadService, {
  DownloadProgress,
} from '../runtime/FileDownloadService';
import LocalProcessRunner from '../runtime/LocalProcessRunner';
import { ManagedPaths } from '../runtime/ManagedPaths';
import ParakeetModelArchive from './ParakeetModelArchive';
import { STTCatalogItem } from './STTModelCatalog';

/** 流式下载并原子安装官方 Parakeet tar.bz2 模型包。 */
export default class ParakeetModelInstaller {
  private readonly paths: ManagedPaths;

  private readonly downloader: FileDownloadService;

  private readonly runner: LocalProcessRunner;

  public constructor(
    paths = ManagedPaths.getInstance(),
    downloader = new FileDownloadService(),
    runner = new LocalProcessRunner(),
  ) {
    this.paths = paths;
    this.downloader = downloader;
    this.runner = runner;
  }

  public async install(
    item: STTCatalogItem,
    modelDir: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const paths = this.paths.ensureRuntimeDirectories('stt');
    const archivePath = path.join(paths.cacheRoot, `${item.id}.tar.bz2`);
    const extractRoot = path.join(paths.cacheRoot, `${item.id}-extract`);
    const stagingDir = `${modelDir}-installing`;
    if (!this.paths.isManagedPath(modelDir)) {
      throw new Error('Parakeet 模型目录不在应用受管路径中');
    }

    try {
      await Promise.all([
        fs.rm(extractRoot, { recursive: true, force: true }),
        fs.rm(stagingDir, { recursive: true, force: true }),
      ]);
      await fs.mkdir(extractRoot, { recursive: true });
      await this.downloader.download(item.downloadUrl, archivePath, {
        expectedSha1: item.checksum,
        onProgress,
      });

      await ArchiveExtractor.extract(archivePath, extractRoot, this.runner);
      const source = await ParakeetModelArchive.findModelRoot(extractRoot);
      if (!source) throw new Error('Parakeet 压缩包缺少必需模型文件');

      await fs.cp(source, stagingDir, { recursive: true });
      await fs.rm(modelDir, { recursive: true, force: true });
      await fs.rename(stagingDir, modelDir);
      if (!ParakeetModelArchive.isComplete(modelDir)) {
        throw new Error('Parakeet 模型安装后仍不完整');
      }
    } finally {
      await Promise.all([
        fs.rm(archivePath, { force: true }),
        fs.rm(extractRoot, { recursive: true, force: true }),
        fs.rm(stagingDir, { recursive: true, force: true }),
      ]);
    }
  }
}
