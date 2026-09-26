import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  isWhisperLanguage,
  LanguageDetectionResult,
  TranscriptSegment,
  TranscriptionProgress,
  TranscriptionResult,
} from '@shared/types/TranscriptionTypes';
import LocalProcessRunner from '../runtime/LocalProcessRunner';
import { ManagedPaths } from '../runtime/ManagedPaths';
import AudioConversionService, {
  PreparedAudio,
} from './AudioConversionService';
import TranscriptionSourceResolver from './TranscriptionSourceResolver';
import WhisperOutputParser from './WhisperOutputParser';
import WhisperRuntimeService from './WhisperRuntimeService';

export type TranscriptionOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: TranscriptionProgress) => void;
  onPartial?: (segment: TranscriptSegment) => void;
};

/** 执行单次 whisper-cli 转写，不负责任务队列或数据库持久化。 */
export default class WhisperTranscriptionService {
  private readonly managedPaths: ManagedPaths;

  private readonly runtimeService: WhisperRuntimeService;

  private readonly sourceResolver: TranscriptionSourceResolver;

  private readonly audioConversion: AudioConversionService;

  private readonly processRunner: LocalProcessRunner;

  public constructor(
    managedPaths = ManagedPaths.getInstance(),
    runtimeService = new WhisperRuntimeService(managedPaths),
    sourceResolver = new TranscriptionSourceResolver(),
    processRunner = new LocalProcessRunner(),
    audioConversion = new AudioConversionService(managedPaths, processRunner),
  ) {
    this.managedPaths = managedPaths;
    this.runtimeService = runtimeService;
    this.sourceResolver = sourceResolver;
    this.processRunner = processRunner;
    this.audioConversion = audioConversion;
  }

  public async detectLanguage(
    source: unknown,
    signal?: AbortSignal,
  ): Promise<LanguageDetectionResult> {
    const normalizedSource =
      TranscriptionSourceResolver.normalizeSource(source);
    const inputPath = await this.sourceResolver.resolve(normalizedSource);
    const runtime = this.runtimeService.requireReady();
    const outputBasePath = await this.createOutputBasePath(inputPath);
    let preparedAudio: PreparedAudio | null = null;

    try {
      preparedAudio = await this.audioConversion.prepare(
        inputPath,
        outputBasePath,
        runtime.ffmpegPath,
        signal,
      );
      const threadCount = Math.max(1, Math.min(os.cpus().length - 1, 8));
      const processResult = await this.processRunner.run(
        runtime.whisperCliPath,
        [
          '-m',
          runtime.activeModelPath as string,
          '-f',
          preparedAudio.wavePath,
          '-l',
          'auto',
          '-dl',
          '-t',
          String(threadCount),
        ],
        {
          cwd:
            runtime.runtimeLocation === 'portable'
              ? path.dirname(runtime.whisperCliPath)
              : undefined,
          signal,
        },
      );
      const combinedOutput = `${processResult.stderr}\n${processResult.stdout}`;
      const match = combinedOutput.match(
        /auto-detected language:\s*([a-z]{2,3})\s*\(p\s*=\s*([0-9.]+)\)/iu,
      );
      const detectedCode = match?.[1]?.toLowerCase();
      if (!isWhisperLanguage(detectedCode)) {
        throw new Error(
          '无法从 Whisper 输出中读取语言检测结果 / Could not read detected language',
        );
      }

      const confidence = Number(match?.[2]);
      return {
        language: detectedCode,
        confidence: Number.isFinite(confidence) ? confidence : null,
        source: 'whisper',
      };
    } finally {
      await this.cleanupOutput([
        preparedAudio?.temporary ? preparedAudio.wavePath : null,
      ]);
    }
  }

  public async transcribe(
    source: unknown,
    options: TranscriptionOptions = {},
  ): Promise<TranscriptionResult> {
    const startedAt = Date.now();
    options.onProgress?.({
      phase: 'preparing',
      message: '正在准备本地音频 / Preparing local audio',
    });

    const normalizedSource =
      TranscriptionSourceResolver.normalizeSource(source);
    const inputPath = await this.sourceResolver.resolve(normalizedSource);
    const language = normalizedSource.language ?? 'auto';
    const runtime = this.runtimeService.requireReady();
    const outputBasePath = await this.createOutputBasePath(inputPath);
    const outputTextPath = `${outputBasePath}.txt`;
    const outputJsonPath = `${outputBasePath}.json`;
    let preparedAudio: PreparedAudio | null = null;

    try {
      preparedAudio = await this.audioConversion.prepare(
        inputPath,
        outputBasePath,
        runtime.ffmpegPath,
        options.signal,
      );
      options.onProgress?.({
        phase: 'transcribing',
        message: '本地 Whisper 正在转写 / Whisper is transcribing locally',
      });

      const threadCount = Math.max(1, Math.min(os.cpus().length - 1, 8));
      const partialParser = WhisperTranscriptionService.createPartialParser(
        options.onPartial,
      );
      const processResult = await this.processRunner.run(
        runtime.whisperCliPath,
        [
          '-m',
          runtime.activeModelPath as string,
          '-f',
          preparedAudio.wavePath,
          '-l',
          language,
          '-sns',
          '-t',
          String(threadCount),
          '-otxt',
          '-oj',
          '-of',
          outputBasePath,
        ],
        {
          cwd:
            runtime.runtimeLocation === 'portable'
              ? path.dirname(runtime.whisperCliPath)
              : undefined,
          signal: options.signal,
          onStdout: partialParser.consumeStdout,
          onStderr: partialParser.consumeStderr,
        },
      );
      partialParser.flush();
      const segments =
        await WhisperTranscriptionService.readSegments(outputJsonPath);
      const text = await WhisperTranscriptionService.readText(
        outputTextPath,
        processResult.stdout,
        segments,
      );

      options.onProgress?.({
        phase: 'completed',
        message: '转写完成 / Transcription completed',
      });
      return {
        text,
        segments,
        engine: 'whisper',
        modelId: runtime.activeModelId as string,
        modelName: runtime.activeModelName as string,
        elapsedMs: Date.now() - startedAt,
      };
    } finally {
      await this.cleanupOutput([
        outputTextPath,
        outputJsonPath,
        preparedAudio?.temporary ? preparedAudio.wavePath : null,
      ]);
    }
  }

  private static createPartialParser(
    onPartial?: (segment: TranscriptSegment) => void,
  ): {
    consumeStdout: (chunk: string) => void;
    consumeStderr: (chunk: string) => void;
    flush: () => void;
  } {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let sequence = 0;
    const emitted = new Set<string>();

    const parseLine = (rawLine: string) => {
      if (!onPartial) return;
      const line = WhisperTranscriptionService.stripAnsi(rawLine).trim();
      const match = line.match(
        /^\[(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)\s*-->\s*(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)\]\s*(.+)$/u,
      );
      if (!match) return;

      const text = match[7].trim();
      if (!text) return;
      const startMs = WhisperTranscriptionService.timestampToMs(
        match[1],
        match[2],
        match[3],
      );
      const endMs = WhisperTranscriptionService.timestampToMs(
        match[4],
        match[5],
        match[6],
      );
      const fingerprint = `${startMs}:${endMs}:${text}`;
      if (emitted.has(fingerprint)) return;
      emitted.add(fingerprint);

      sequence += 1;
      onPartial({
        id: `partial-${sequence}`,
        startMs,
        endMs,
        text,
      });
    };

    const consume = (buffer: string, chunk: string): string => {
      if (!onPartial || !chunk) return buffer;
      const next = `${buffer}${chunk}`;
      const lines = next.split(/\r?\n/u);
      const remainder = lines.pop() ?? '';
      lines.forEach(parseLine);
      return remainder;
    };

    return {
      consumeStdout(chunk: string) {
        stdoutBuffer = consume(stdoutBuffer, chunk);
      },
      consumeStderr(chunk: string) {
        stderrBuffer = consume(stderrBuffer, chunk);
      },
      flush() {
        if (stdoutBuffer) parseLine(stdoutBuffer);
        if (stderrBuffer) parseLine(stderrBuffer);
        stdoutBuffer = '';
        stderrBuffer = '';
      },
    };
  }

  private static timestampToMs(
    hours: string,
    minutes: string,
    seconds: string,
  ): number {
    return Math.round(
      (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000,
    );
  }

  private static stripAnsi(value: string): string {
    const escape = String.fromCharCode(27);
    return value.replace(new RegExp(`${escape}\\[[0-9;]*m`, 'g'), '');
  }

  private async createOutputBasePath(inputPath: string): Promise<string> {
    const { outputRoot } = this.managedPaths.ensureRuntimeDirectories('stt');
    const baseName =
      path
        .basename(inputPath, path.extname(inputPath))
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 80) || 'audio';

    return path.join(outputRoot, `${baseName}-${Date.now()}`);
  }

  private async cleanupOutput(paths: Array<string | null>): Promise<void> {
    const managedOutput = paths.filter(
      (candidate): candidate is string =>
        candidate !== null && this.managedPaths.isManagedPath(candidate),
    );
    await Promise.all(
      managedOutput.map((candidate) => fs.rm(candidate, { force: true })),
    );
  }

  private static async readSegments(
    outputJsonPath: string,
  ): Promise<ReturnType<typeof WhisperOutputParser.parse>> {
    try {
      const payload = JSON.parse(await fs.readFile(outputJsonPath, 'utf8'));
      return WhisperOutputParser.parse(payload);
    } catch {
      return [];
    }
  }

  private static async readText(
    outputTextPath: string,
    stdout: string,
    segments: ReturnType<typeof WhisperOutputParser.parse>,
  ): Promise<string> {
    let text = '';
    try {
      text = (await fs.readFile(outputTextPath, 'utf8')).trim();
    } catch {
      text = stdout.trim();
    }
    if (!text && segments.length > 0) {
      text = segments
        .map((segment) => segment.text)
        .join(' ')
        .trim();
    }
    if (!text) {
      throw new Error('转写结果为空 / Transcription result is empty');
    }
    return text;
  }
}
