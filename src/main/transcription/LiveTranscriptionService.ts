import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { TranscriptionResult } from '@shared/types/TranscriptionTypes';
import { ManagedPaths } from '../runtime/ManagedPaths';
import LocalTranscriptionService, {
  TranscriptionBackend,
} from './LocalTranscriptionService';

const MAX_LIVE_SEGMENT_BYTES = 64 * 1024 * 1024;

const LIVE_EXTENSIONS: Record<string, string> = {
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/x-wav': 'wav',
};

/**
 * 接收 Renderer 生成的短录音片段，写入受管缓存后复用现有 STT 后端。
 * 每个片段都是独立 MediaRecorder 文件，因此 ffmpeg 可以单独解码。
 */
export default class LiveTranscriptionService {
  private readonly managedPaths: ManagedPaths;

  private readonly transcription: TranscriptionBackend;

  public constructor(
    transcription: TranscriptionBackend = new LocalTranscriptionService(),
    managedPaths = ManagedPaths.getInstance(),
  ) {
    this.transcription = transcription;
    this.managedPaths = managedPaths;
  }

  public async transcribe(
    rawData: unknown,
    rawMimeType: unknown,
  ): Promise<TranscriptionResult | null> {
    const bytes = LiveTranscriptionService.normalizeBytes(rawData);
    const mimeType = LiveTranscriptionService.normalizeMimeType(rawMimeType);
    const extension = LIVE_EXTENSIONS[mimeType];
    const { cacheRoot } = this.managedPaths.ensureRuntimeDirectories('stt');
    const inputPath = path.join(
      cacheRoot,
      `live-segment-${Date.now()}-${randomUUID()}.${extension}`,
    );

    await fs.writeFile(inputPath, bytes);

    try {
      return await this.transcription.transcribe({
        kind: 'file',
        filePath: inputPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('Transcription result is empty') ||
        message.includes('转写结果为空')
      ) {
        return null;
      }
      throw error;
    } finally {
      if (this.managedPaths.isManagedPath(inputPath)) {
        await fs.rm(inputPath, { force: true });
      }
    }
  }

  private static normalizeBytes(rawData: unknown): Uint8Array {
    let bytes: Uint8Array;

    if (rawData instanceof ArrayBuffer) {
      bytes = new Uint8Array(rawData);
    } else if (ArrayBuffer.isView(rawData)) {
      bytes = new Uint8Array(
        rawData.buffer,
        rawData.byteOffset,
        rawData.byteLength,
      );
    } else {
      throw new Error('无效的实时录音数据 / Invalid live audio data');
    }

    if (bytes.byteLength === 0 || bytes.byteLength > MAX_LIVE_SEGMENT_BYTES) {
      throw new Error('实时录音片段大小无效 / Invalid live audio segment size');
    }

    return Uint8Array.from(bytes);
  }

  private static normalizeMimeType(rawMimeType: unknown): string {
    if (typeof rawMimeType !== 'string') {
      throw new Error('无效的实时录音格式 / Invalid live audio format');
    }

    const mimeType = rawMimeType.toLowerCase().split(';')[0].trim();
    if (!LIVE_EXTENSIONS[mimeType]) {
      throw new Error('不支持的实时录音格式 / Unsupported live audio format');
    }

    return mimeType;
  }
}
