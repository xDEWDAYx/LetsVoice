import fs from 'fs/promises';
import path from 'path';
import {
  isWhisperLanguage,
  TranscriptionLanguage,
  TranscriptionSource,
} from '@shared/types/TranscriptionTypes';
import { BlobStorage } from '../database/BlobStorage';

/** 在主进程验证外部文件或受管录音来源，并返回实际文件路径。 */
export default class TranscriptionSourceResolver {
  private readonly blobStorage: BlobStorage;

  public constructor(blobStorage = BlobStorage.getInstance()) {
    this.blobStorage = blobStorage;
  }

  public async resolve(rawSource: unknown): Promise<string> {
    const source = TranscriptionSourceResolver.normalizeSource(rawSource);
    const inputPath =
      source.kind === 'file'
        ? path.resolve(source.filePath)
        : this.blobStorage.resolveAbsolutePath(source.relativePath);
    const stat = await fs.stat(inputPath);

    if (!stat.isFile()) {
      throw new Error('转写来源不是文件 / Transcription source is not a file');
    }

    return inputPath;
  }

  public static normalizeSource(rawSource: unknown): TranscriptionSource {
    if (typeof rawSource !== 'object' || rawSource === null) {
      throw new Error('无效的转写来源 / Invalid transcription source');
    }

    const source = rawSource as Partial<TranscriptionSource>;
    if (
      source.kind === 'file' &&
      typeof source.filePath === 'string' &&
      source.filePath.length > 0 &&
      source.filePath.length <= 4096
    ) {
      return {
        kind: 'file',
        filePath: source.filePath,
        language: TranscriptionSourceResolver.normalizeLanguage(
          source.language,
        ),
      };
    }
    if (
      source.kind === 'recording' &&
      typeof source.relativePath === 'string' &&
      source.relativePath.length > 0 &&
      source.relativePath.length <= 1024
    ) {
      return {
        kind: 'recording',
        relativePath: source.relativePath,
        language: TranscriptionSourceResolver.normalizeLanguage(
          source.language,
        ),
      };
    }

    throw new Error('无效的转写来源 / Invalid transcription source');
  }

  private static normalizeLanguage(
    rawLanguage: unknown,
  ): TranscriptionLanguage | undefined {
    if (rawLanguage === undefined) return undefined;
    if (rawLanguage === 'auto' || isWhisperLanguage(rawLanguage)) {
      return rawLanguage;
    }
    throw new Error('不支持的转写语言 / Unsupported transcription language');
  }
}
