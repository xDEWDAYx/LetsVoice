import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const WAV_HEADER_READ_SIZE = 256 * 1024;
const FFPROBE_TIMEOUT_MS = 10_000;

/**
 * 读取本地媒体时长。WAV 使用文件头计算，其他格式可回退到系统 ffprobe。
 */
export default class AudioDurationService {
  public static async getMediaDurationMs(
    rawFilePath: unknown,
  ): Promise<number | null> {
    const filePath = await AudioDurationService.normalizeFilePath(rawFilePath);

    try {
      const fileHandle = await fs.open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(WAV_HEADER_READ_SIZE);
        const { bytesRead } = await fileHandle.read(
          buffer,
          0,
          buffer.length,
          0,
        );
        const wavDuration = AudioDurationService.readWavDurationMs(
          buffer.subarray(0, bytesRead),
        );

        if (wavDuration !== null) return wavDuration;
      } finally {
        await fileHandle.close();
      }
    } catch {
      return null;
    }

    return AudioDurationService.probeWithFfprobe(filePath);
  }

  public static readWavDurationMs(buffer: Buffer): number | null {
    if (buffer.length < 12) return null;
    if (
      buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      return null;
    }

    let byteRate = 0;
    let dataBytes = 0;

    for (let offset = 12; offset + 8 <= buffer.length; ) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ' && offset + 20 <= buffer.length) {
        byteRate = buffer.readUInt32LE(offset + 16);
      }
      if (chunkId === 'data') {
        dataBytes = chunkSize;
        break;
      }

      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (byteRate <= 0 || dataBytes <= 0) return null;
    return Math.round((dataBytes / byteRate) * 1000);
  }

  private static async normalizeFilePath(
    rawFilePath: unknown,
  ): Promise<string> {
    if (
      typeof rawFilePath !== 'string' ||
      rawFilePath.length === 0 ||
      rawFilePath.length > 4096
    ) {
      throw new Error('无效的媒体文件路径 / Invalid media file path');
    }

    const filePath = path.resolve(rawFilePath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error('媒体路径不是文件 / Media path is not a file');
    }

    return filePath;
  }

  private static probeWithFfprobe(filePath: string): Promise<number | null> {
    return new Promise((resolve) => {
      execFile(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          filePath,
        ],
        { timeout: FFPROBE_TIMEOUT_MS },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }

          const seconds = Number.parseFloat(String(stdout).trim());
          resolve(
            Number.isFinite(seconds) && seconds >= 0
              ? Math.round(seconds * 1000)
              : null,
          );
        },
      );
    });
  }
}
