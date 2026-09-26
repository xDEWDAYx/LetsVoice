import fs from 'fs/promises';
import path from 'path';
import type { TranscriptionResult } from '@shared/types/TranscriptionTypes';
import { ManagedPaths } from '../runtime/ManagedPaths';
import AudioConversionService, {
  PreparedAudio,
} from './AudioConversionService';
import ParakeetEngine from './ParakeetEngine';
import ParakeetRuntimeService from './ParakeetRuntimeService';
import TranscriptionSourceResolver from './TranscriptionSourceResolver';
import { TranscriptionOptions } from './WhisperTranscriptionService';

/** 使用 sherpa-onnx Parakeet 处理单次转写，任务管理仍由上层负责。 */
export default class ParakeetTranscriptionService {
  private readonly paths: ManagedPaths;

  private readonly runtime: ParakeetRuntimeService;

  private readonly resolver: TranscriptionSourceResolver;

  private readonly audio: AudioConversionService;

  private readonly engine: ParakeetEngine;

  public constructor(
    paths = ManagedPaths.getInstance(),
    runtime = new ParakeetRuntimeService(),
    resolver = new TranscriptionSourceResolver(),
    audio = new AudioConversionService(paths),
    engine = new ParakeetEngine(runtime),
  ) {
    this.paths = paths;
    this.runtime = runtime;
    this.resolver = resolver;
    this.audio = audio;
    this.engine = engine;
  }

  public async transcribe(
    source: unknown,
    options: TranscriptionOptions = {},
  ): Promise<TranscriptionResult> {
    const startedAt = Date.now();
    options.onProgress?.({
      phase: 'preparing',
      message: '正在准备 Parakeet 音频 / Preparing Parakeet audio',
    });
    const inputPath = await this.resolver.resolve(source);
    const runtime = this.runtime.requireReady();
    const outputBase = this.createOutputBasePath(inputPath);
    let prepared: PreparedAudio | null = null;
    try {
      prepared = await this.audio.prepare(
        inputPath,
        outputBase,
        runtime.ffmpegPath,
        options.signal,
      );
      options.onProgress?.({
        phase: 'transcribing',
        message: '本地 Parakeet 正在转写 / Parakeet is transcribing locally',
      });
      const recognition = await this.engine.recognize(
        prepared.wavePath,
        options.signal,
      );
      options.onProgress?.({
        phase: 'completed',
        message: '转写完成 / Transcription completed',
      });
      return {
        ...recognition,
        engine: 'parakeet',
        elapsedMs: Date.now() - startedAt,
      };
    } finally {
      if (prepared?.temporary && this.paths.isManagedPath(prepared.wavePath)) {
        await fs.rm(prepared.wavePath, { force: true });
      }
    }
  }

  private createOutputBasePath(inputPath: string): string {
    const { outputRoot } = this.paths.ensureRuntimeDirectories('stt');
    const name =
      path
        .basename(inputPath, path.extname(inputPath))
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 80) || 'audio';
    return path.join(outputRoot, `${name}-${Date.now()}-parakeet`);
  }
}
