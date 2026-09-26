import fs from 'fs';
import path from 'path';
import CommandLocator from './CommandLocator';
import { ManagedPaths } from './ManagedPaths';

/**
 * ffmpeg 定位：优先使用应用自己下载到托管目录的绿色版，
 * 找不到再回退系统 PATH。这样不依赖用户手动安装 / 配置环境变量。
 */

function ffmpegExeName(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

export function getManagedFfmpegDir(
  managedPaths: ManagedPaths = ManagedPaths.getInstance(),
): string {
  return path.join(managedPaths.getDataRoot(), 'runtimes', 'ffmpeg', 'bin');
}

export function getManagedFfmpegPath(
  managedPaths: ManagedPaths = ManagedPaths.getInstance(),
): string {
  return path.join(getManagedFfmpegDir(managedPaths), ffmpegExeName());
}

export function resolveFfmpegPath(
  managedPaths: ManagedPaths = ManagedPaths.getInstance(),
): string | null {
  const managed = getManagedFfmpegPath(managedPaths);
  if (fs.existsSync(managed)) return managed;
  return CommandLocator.resolve([ffmpegExeName()]);
}
