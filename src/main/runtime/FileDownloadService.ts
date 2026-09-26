import { createHash, randomUUID } from 'crypto';
import fsPromises from 'fs/promises';
import path from 'path';

export type DownloadProgress = {
  receivedBytes: number;
  totalBytes: number | null;
};

export type DownloadOptions = {
  expectedSha1?: string | null;
  expectedSha256?: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
};

/** 将远程文件流式写入临时文件，校验完成后再原子替换目标文件。 */
export default class FileDownloadService {
  // 下载器保留实例方法，便于模型管理器注入替代实现进行离线验证。
  // eslint-disable-next-line class-methods-use-this
  public async download(
    url: string,
    destinationPath: string,
    options: DownloadOptions = {},
  ): Promise<void> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SpeakSpace-Local-Downloader' },
      redirect: 'follow',
      signal: options.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `下载失败 / Download failed: ${response.status} ${response.statusText}`,
      );
    }

    await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true });
    const temporaryPath = `${destinationPath}.${randomUUID()}.download`;
    const totalBytes = FileDownloadService.parseContentLength(
      response.headers.get('content-length'),
    );
    const hashAlgorithm = options.expectedSha256 ? 'sha256' : 'sha1';
    const hash = createHash(hashAlgorithm);
    const reader = response.body.getReader();
    let output: fsPromises.FileHandle | null = null;
    let receivedBytes = 0;

    try {
      output = await fsPromises.open(temporaryPath, 'wx');

      // 普通循环不会为大模型的每个数据块保留一层 Promise 调用链。
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // 数据流必须按顺序读取和落盘，不能并行写入同一个模型文件。
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = Buffer.from(value);
        // eslint-disable-next-line no-await-in-loop
        await output.write(chunk);
        receivedBytes += chunk.byteLength;
        hash.update(chunk);
        options.onProgress?.({ receivedBytes, totalBytes });
      }

      await output.close();
      output = null;

      FileDownloadService.verifyChecksum(hash.digest('hex'), options);
      await fsPromises.rename(temporaryPath, destinationPath);
    } catch (error) {
      await output?.close().catch(() => undefined);
      await reader.cancel().catch(() => undefined);
      await fsPromises.rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private static verifyChecksum(
    actualSha1: string,
    options: DownloadOptions,
  ): void {
    const expectedChecksum = (options.expectedSha256 ?? options.expectedSha1)
      ?.trim()
      .toLowerCase();
    if (expectedChecksum && actualSha1.toLowerCase() !== expectedChecksum) {
      throw new Error('模型校验失败 / Download checksum mismatch');
    }
  }

  private static parseContentLength(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
}
