import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import ArchiveExtractor from './ArchiveExtractor';
import FileDownloadService, { DownloadProgress } from './FileDownloadService';
import LocalProcessRunner from './LocalProcessRunner';
import { ManagedPaths } from './ManagedPaths';
import { getManagedFfmpegDir, getManagedFfmpegPath } from './FfmpegLocator';
import { assertAutoInstallSupported } from './RuntimeInstallSupport';

export type FfmpegInstallProgress = {
  phase: 'checking' | 'downloading' | 'extracting' | 'installing' | 'completed';
  message: string;
  receivedBytes?: number;
  totalBytes?: number | null;
};

export type FfmpegInstallResult = {
  ffmpegPath: string;
  ffmpegPresent: boolean;
};

// ffmpeg.org 推荐的 Windows 绿色版（gyan.dev essentials，体积较小，含 ffmpeg/ffprobe）。
const FFMPEG_WIN64_URL =
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';

/** 下载官方 Windows ffmpeg 绿色版到应用托管目录，供音频格式转换使用。 */
export default class FfmpegInstaller {
  private readonly managedPaths: ManagedPaths;

  private readonly downloader: FileDownloadService;

  private readonly processRunner: LocalProcessRunner;

  public constructor(
    managedPaths = ManagedPaths.getInstance(),
    downloader = new FileDownloadService(),
    processRunner = new LocalProcessRunner(),
  ) {
    this.managedPaths = managedPaths;
    this.downloader = downloader;
    this.processRunner = processRunner;
  }

  public async install(
    onProgress?: (progress: FfmpegInstallProgress) => void,
    signal?: AbortSignal,
  ): Promise<FfmpegInstallResult> {
    const binDir = getManagedFfmpegDir(this.managedPaths);
    const targetPath = getManagedFfmpegPath(this.managedPaths);

    onProgress?.({
      phase: 'checking',
      message: '正在检查 ffmpeg / Checking ffmpeg',
    });
    if (fsSync.existsSync(targetPath)) {
      onProgress?.({
        phase: 'completed',
        message: 'ffmpeg 已就绪 / ffmpeg ready',
      });
      return { ffmpegPath: targetPath, ffmpegPresent: true };
    }

    assertAutoInstallSupported('ffmpeg');

    const cacheDir = path.join(
      this.managedPaths.getDataRoot(),
      'cache',
      'ffmpeg',
    );
    const archivePath = path.join(cacheDir, 'ffmpeg-release-essentials.zip');
    const extractRoot = path.join(cacheDir, 'extract');

    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.rm(extractRoot, { recursive: true, force: true });
      await fs.mkdir(extractRoot, { recursive: true });

      onProgress?.({
        phase: 'downloading',
        message: '正在下载 ffmpeg / Downloading ffmpeg',
      });
      await this.downloader.download(FFMPEG_WIN64_URL, archivePath, {
        signal,
        onProgress: (progress: DownloadProgress) =>
          onProgress?.({
            phase: 'downloading',
            message: '正在下载 ffmpeg / Downloading ffmpeg',
            receivedBytes: progress.receivedBytes,
            totalBytes: progress.totalBytes,
          }),
      });

      onProgress?.({
        phase: 'extracting',
        message: '正在解压 ffmpeg / Extracting ffmpeg',
      });
      await ArchiveExtractor.extract(
        archivePath,
        extractRoot,
        this.processRunner,
        {
          signal,
        },
      );

      onProgress?.({
        phase: 'installing',
        message: '正在安装 ffmpeg / Installing ffmpeg',
      });
      const ffmpegSource = await FfmpegInstaller.findExecutable(
        extractRoot,
        'ffmpeg.exe',
      );
      if (!ffmpegSource) {
        throw new Error(
          '压缩包缺少 ffmpeg.exe / ffmpeg.exe not found in archive',
        );
      }

      await fs.mkdir(binDir, { recursive: true });
      await fs.copyFile(ffmpegSource, targetPath);

      // ffprobe 可选，一并拷贝方便未来使用。
      const ffprobeSource = await FfmpegInstaller.findExecutable(
        extractRoot,
        'ffprobe.exe',
      );
      if (ffprobeSource) {
        await fs
          .copyFile(ffprobeSource, path.join(binDir, 'ffprobe.exe'))
          .catch(() => undefined);
      }

      onProgress?.({
        phase: 'completed',
        message: 'ffmpeg 安装完成 / ffmpeg ready',
      });
      return { ffmpegPath: targetPath, ffmpegPresent: true };
    } finally {
      await Promise.all([
        fs
          .rm(extractRoot, { recursive: true, force: true })
          .catch(() => undefined),
        fs.rm(archivePath, { force: true }).catch(() => undefined),
      ]);
    }
  }

  /** 在解压目录中递归查找指定可执行文件。 */
  private static async findExecutable(
    root: string,
    fileName: string,
  ): Promise<string | null> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    // 递归查找需要顺序 await，改成数组方法反而要额外并发控制。
    // eslint-disable-next-line no-restricted-syntax
    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        const found = await FfmpegInstaller.findExecutable(entryPath, fileName);
        if (found) return found;
      } else if (entry.name.toLowerCase() === fileName.toLowerCase()) {
        return entryPath;
      }
    }
    return null;
  }
}
