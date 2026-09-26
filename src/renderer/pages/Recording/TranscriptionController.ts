import type {
  LanguageDetectionResult,
  TranscriptSegment,
  TranscriptionJob,
  TranscriptionLanguage,
  TranscriptionResult,
  TranscriptionSource,
} from '@shared/types/TranscriptionTypes';
import type { StructuredNoteDraft } from '@shared/types/KnowledgeGenerationTypes';
import type {
  AudioImportProgress,
  SavedRecording,
} from '@shared/types/AudioTypes';

export type LiveTranscriptSegment = {
  id: number;
  sourceId?: string;
  text: string;
  engine: TranscriptionResult['engine'];
  modelName: string;
  elapsedMs: number;
};

export type TranscriptionInputMode = 'microphone' | 'file' | null;

export type TranscriptionControllerSnapshot = {
  job: TranscriptionJob | null;
  inputMode: TranscriptionInputMode;
  uploadedFileName: string | null;
  uploadedFilePath: string | null;
  uploadedRecording: SavedRecording | null;
  uploadPending: boolean;
  uploadProgress: AudioImportProgress | null;
  uploadLanguage: TranscriptionLanguage;
  detectedLanguage: LanguageDetectionResult | null;
  languageDetectionPending: boolean;
  languageDetectionError: string | null;
  languageConfirmationRequired: boolean;
  requestPending: boolean;
  requestError: string | null;
  liveSegments: LiveTranscriptSegment[];
  livePendingCount: number;
  liveError: string | null;
  structuredNoteDraft: StructuredNoteDraft | null;
  structuredNotePending: boolean;
  structuredNoteError: string | null;
};

/**
 * 上传 / 录音入口的忙碌判定，录音页和工作台共用同一份口径。
 *
 * 语言检测、请求提交、文件转写 job、实时分段转写，任何一项还在跑都不能
 * 再触发一次：controller 是单实例，二次触发会 resetLive() 覆盖当前状态，
 * 旧 job 的事件随后与新状态交错，用户会看到错文件名或被静默丢弃的结果。
 *
 * includeStructuredNote 把结构化提取也算作忙碌。生成途中重置会丢掉尚未
 * 保存的 Structured Note 草稿，所以工作台入口需要把它纳入忙碌状态。
 */
export function isTranscriptionFileBusy(
  snapshot: TranscriptionControllerSnapshot,
  options: { includeStructuredNote?: boolean } = {},
): boolean {
  return (
    snapshot.uploadPending ||
    snapshot.requestPending ||
    snapshot.job?.status === 'processing' ||
    snapshot.livePendingCount > 0 ||
    snapshot.languageDetectionPending ||
    (options.includeStructuredNote === true && snapshot.structuredNotePending)
  );
}

type TranscriptionListener = () => void;

const AUTO_CONTINUE_LANGUAGE_CODES = new Set([
  'en',
  'zh',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'pt',
  'it',
  'ru',
  'ar',
  'hi',
]);
const MIN_AUTO_LANGUAGE_CONFIDENCE = 0.65;

function isBlankTranscript(text: string): boolean {
  const normalized = text.trim();
  return (
    !normalized ||
    /^\[(?:BLANK_AUDIO|SILENCE|MUSIC)\]$/iu.test(normalized) ||
    /^\((?:blank audio|silence|music)\)$/iu.test(normalized)
  );
}

function combinedText(segments: LiveTranscriptSegment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter((text) => !isBlankTranscript(text))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 连接 Renderer 与主进程转写任务，并在完整转写后生成 Structured Note 草稿。 */
export default class TranscriptionController {
  private readonly listeners = new Set<TranscriptionListener>();

  private readonly unsubscribeStatus: () => void;

  private readonly unsubscribePartial: () => void;

  private job: TranscriptionJob | null = null;

  private inputMode: TranscriptionInputMode = null;

  private uploadedFileName: string | null = null;

  private uploadedFilePath: string | null = null;

  private uploadedRecording: SavedRecording | null = null;

  private uploadPending = false;

  private uploadProgress: AudioImportProgress | null = null;

  private uploadLanguage: TranscriptionLanguage = 'auto';

  private detectedLanguage: LanguageDetectionResult | null = null;

  private languageDetectionPending = false;

  private languageDetectionError: string | null = null;

  private languageConfirmationRequired = false;

  private requestPending = false;

  private requestError: string | null = null;

  private liveSegments: LiveTranscriptSegment[] = [];

  private livePendingCount = 0;

  private liveError: string | null = null;

  private structuredNoteDraft: StructuredNoteDraft | null = null;

  private structuredNotePending = false;

  private structuredNoteError: string | null = null;

  private structuredNoteGeneration: Promise<void> | null = null;

  private liveGeneration = 0;

  private liveSequence = 0;

  private liveQueue: Promise<void> = Promise.resolve();

  public constructor() {
    this.unsubscribeStatus = window.electron.transcription.onStatus((rawJob) =>
      this.receiveStatus(rawJob),
    );
    this.unsubscribePartial = window.electron.transcription.onPartial(
      (payload) => this.receivePartial(payload),
    );
  }

  public getSnapshot(): TranscriptionControllerSnapshot {
    return {
      job: this.job,
      inputMode: this.inputMode,
      uploadedFileName: this.uploadedFileName,
      uploadedFilePath: this.uploadedFilePath,
      uploadedRecording: this.uploadedRecording
        ? { ...this.uploadedRecording }
        : null,
      uploadPending: this.uploadPending,
      uploadProgress: this.uploadProgress ? { ...this.uploadProgress } : null,
      uploadLanguage: this.uploadLanguage,
      detectedLanguage: this.detectedLanguage
        ? { ...this.detectedLanguage }
        : null,
      languageDetectionPending: this.languageDetectionPending,
      languageDetectionError: this.languageDetectionError,
      languageConfirmationRequired: this.languageConfirmationRequired,
      requestPending: this.requestPending,
      requestError: this.requestError,
      liveSegments: this.liveSegments.map((segment) => ({ ...segment })),
      livePendingCount: this.livePendingCount,
      liveError: this.liveError,
      structuredNoteDraft: this.structuredNoteDraft,
      structuredNotePending: this.structuredNotePending,
      structuredNoteError: this.structuredNoteError,
    };
  }

  public subscribe(listener: TranscriptionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setUploadLanguage(language: TranscriptionLanguage): void {
    this.uploadLanguage = language;
    this.languageDetectionError = null;
    this.languageConfirmationRequired = false;
    this.notify();
  }

  public dispose(): void {
    this.liveGeneration += 1;
    TranscriptionController.releaseUploadedRecording(this.uploadedRecording);
    this.uploadedRecording = null;
    this.unsubscribeStatus();
    this.unsubscribePartial();
    this.listeners.clear();
  }

  public resetLive(
    inputMode: TranscriptionInputMode = 'microphone',
    uploadedFileName: string | null = null,
    uploadedFilePath: string | null = null,
    uploadedRecording: SavedRecording | null = null,
  ): void {
    if (
      this.uploadedRecording &&
      this.uploadedRecording.relativePath !== uploadedRecording?.relativePath
    ) {
      TranscriptionController.releaseUploadedRecording(this.uploadedRecording);
    }
    this.liveGeneration += 1;
    this.inputMode = inputMode;
    this.uploadedFileName = uploadedFileName;
    this.uploadedFilePath = uploadedFilePath;
    this.uploadedRecording = uploadedRecording;
    this.uploadPending = false;
    this.uploadProgress = null;
    this.detectedLanguage = null;
    this.languageDetectionPending = false;
    this.languageDetectionError = null;
    this.languageConfirmationRequired = false;
    this.job = null;
    this.requestError = null;
    this.liveSequence = 0;
    this.liveSegments = [];
    this.livePendingCount = 0;
    this.liveError = null;
    this.structuredNoteDraft = null;
    this.structuredNotePending = false;
    this.structuredNoteError = null;
    this.structuredNoteGeneration = null;
    this.notify();
  }

  public enqueueLiveChunk(chunk: Blob): void {
    if (chunk.size === 0) return;

    const generation = this.liveGeneration;
    const sequence = this.liveSequence;
    this.liveSequence += 1;
    this.livePendingCount += 1;
    this.liveError = null;
    this.notify();

    this.liveQueue = this.liveQueue
      .catch(() => undefined)
      .then(async () => {
        if (generation === this.liveGeneration) {
          try {
            const result = (await window.electron.transcription.liveRun(
              await chunk.arrayBuffer(),
              chunk.type || 'audio/webm',
            )) as TranscriptionResult | null;

            if (generation === this.liveGeneration && result) {
              const segment = {
                id: sequence,
                text: result.text,
                engine: result.engine,
                modelName: result.modelName,
                elapsedMs: result.elapsedMs,
              };
              this.liveSegments = [...this.liveSegments, segment];
            }
          } catch (error) {
            if (generation === this.liveGeneration) {
              this.liveError =
                error instanceof Error
                  ? error.message
                  : '实时转写失败 / Live transcription failed';
            }
          } finally {
            if (generation === this.liveGeneration) {
              this.livePendingCount = Math.max(0, this.livePendingCount - 1);
              this.notify();
            }
          }
        }

        return undefined;
      });
  }

  /** 等待完整转写，然后只生成一次供复核与保存共同使用的 Structured Note。 */
  public async finalizeStructuredNote(): Promise<void> {
    if (this.structuredNoteDraft) return;
    if (this.structuredNoteGeneration) {
      await this.structuredNoteGeneration;
      return;
    }

    const generation = this.liveGeneration;
    const task = (async () => {
      await this.liveQueue.catch(() => undefined);
      const transcript =
        combinedText(this.liveSegments) || this.job?.result?.text?.trim() || '';
      if (generation !== this.liveGeneration || !transcript) return;

      this.structuredNotePending = true;
      this.structuredNoteError = null;
      this.notify();

      try {
        const draft =
          await window.electron.knowledge.generateStructuredNoteDraft(
            transcript,
          );
        if (generation === this.liveGeneration) {
          this.structuredNoteDraft = draft as StructuredNoteDraft;
        }
      } catch (error: unknown) {
        if (generation === this.liveGeneration) {
          this.structuredNoteError =
            error instanceof Error
              ? error.message
              : '结构化笔记生成失败 / Structured note generation failed';
        }
      } finally {
        if (generation === this.liveGeneration) {
          this.structuredNotePending = false;
          this.notify();
        }
      }
    })();
    this.structuredNoteGeneration = task;
    await task;
    if (this.structuredNoteGeneration === task) {
      this.structuredNoteGeneration = null;
    }
  }

  public async pickFileAndStart(options?: {
    skipConfirmation?: boolean;
  }): Promise<void> {
    const filePath = (await window.electron.audio.pickFile()) as string | null;
    if (!filePath) return;

    const fileName = filePath.split(/[\\/]/u).pop() || 'audio';
    this.resetLive('file', fileName, filePath);
    const generation = this.liveGeneration;
    this.uploadPending = true;
    this.uploadProgress = null;
    this.notify();

    try {
      const recording = (await window.electron.audio.importRecordingFile(
        filePath,
        (progress) => this.receiveUploadProgress(progress, generation),
      )) as SavedRecording;
      if (generation !== this.liveGeneration) {
        TranscriptionController.releaseUploadedRecording(recording);
        return;
      }
      this.uploadedRecording = recording;
      this.uploadProgress = {
        transferredBytes: recording.byteLength,
        totalBytes: recording.byteLength,
        percent: 100,
      };
    } catch (error) {
      if (generation !== this.liveGeneration) return;
      this.requestError =
        error instanceof Error
          ? error.message
          : '音频上传失败 / Audio import failed';
      return;
    } finally {
      if (generation === this.liveGeneration) {
        this.uploadPending = false;
        this.notify();
      }
    }

    await this.startUploadedFile(options?.skipConfirmation);
  }

  public async retranscribeUploadedFile(): Promise<void> {
    if (!this.uploadedFilePath || !this.uploadedFileName) return;

    const filePath = this.uploadedFilePath;
    const fileName = this.uploadedFileName;
    const { uploadedRecording } = this;
    this.resetLive('file', fileName, filePath, uploadedRecording);
    await this.startUploadedFile();
  }

  private async startUploadedFile(
    skipConfirmation: boolean = false,
  ): Promise<void> {
    const filePath = this.uploadedFilePath;
    if (!filePath) return;

    const source: TranscriptionSource = this.uploadedRecording
      ? {
          kind: 'recording',
          relativePath: this.uploadedRecording.relativePath,
        }
      : { kind: 'file', filePath };

    let language = this.uploadLanguage;
    if (language === 'auto') {
      this.languageDetectionPending = true;
      this.languageDetectionError = null;
      this.notify();

      try {
        const result = (await window.electron.transcription.detectLanguage({
          ...source,
          language: 'auto',
        })) as LanguageDetectionResult;
        this.detectedLanguage = result;
        language = result.language;

        const lowConfidence =
          result.confidence !== null &&
          result.confidence < MIN_AUTO_LANGUAGE_CONFIDENCE;
        const uncommonLanguage = !AUTO_CONTINUE_LANGUAGE_CODES.has(
          result.language,
        );
        const modelFixedLanguage = result.source === 'model-fixed';

        if (
          !skipConfirmation &&
          (lowConfidence || uncommonLanguage || modelFixedLanguage)
        ) {
          this.uploadLanguage = result.language;
          this.languageConfirmationRequired = true;
          return;
        }
      } catch (error) {
        this.languageDetectionError =
          error instanceof Error
            ? error.message
            : '语言检测失败 / Language detection failed';
        if (skipConfirmation) {
          this.requestError = this.languageDetectionError;
        }
        return;
      } finally {
        this.languageDetectionPending = false;
        this.notify();
      }
    } else {
      this.detectedLanguage = null;
      this.languageConfirmationRequired = false;
    }

    await this.start({ ...source, language });
  }

  public startRecording(relativePath: string): Promise<void> {
    return this.start({ kind: 'recording', relativePath });
  }

  /**
   * 彻底放弃当前这一轮采集。
   *
   * 关掉复核窗时用：主进程那边的转写任务要真的取消掉，本地在途的实时转写和
   * Structured Note 生成也要作废，否则回来后仍会修改已经放弃的这一轮状态。
   */
  public async abort(): Promise<void> {
    const { job } = this;
    // 先 resetLive：liveGeneration 一变，在途的转写/结构化回调回来就自动丢弃
    this.resetLive(null);
    if (!job || job.status !== 'processing') return;
    try {
      await window.electron.transcription.cancel(job.id);
    } catch {
      // 任务可能已经自己结束了，取消失败不影响本地状态已经清干净
    }
  }

  public async cancel(): Promise<void> {
    if (!this.job || this.job.status !== 'processing') return;
    await this.runRequest(async () => {
      this.job = (await window.electron.transcription.cancel(
        this.job?.id as string,
      )) as TranscriptionJob;
    });
  }

  public async retry(): Promise<void> {
    if (!this.job || this.job.status === 'processing') return;
    await this.runRequest(async () => {
      this.job = (await window.electron.transcription.retry(
        this.job?.id as string,
      )) as TranscriptionJob;
    });
  }

  private async start(source: TranscriptionSource): Promise<void> {
    await this.runRequest(async () => {
      this.job = (await window.electron.transcription.start(
        source,
      )) as TranscriptionJob;
    });
  }

  private async runRequest(operation: () => Promise<void>): Promise<void> {
    this.requestPending = true;
    this.requestError = null;
    this.notify();

    try {
      await operation();
    } catch (error) {
      this.requestError =
        error instanceof Error
          ? error.message
          : '转写请求失败 / Transcription request failed';
    } finally {
      this.requestPending = false;
      this.notify();
    }
  }

  private receiveUploadProgress(
    rawProgress: unknown,
    generation: number,
  ): void {
    if (generation !== this.liveGeneration) return;
    if (typeof rawProgress !== 'object' || rawProgress === null) return;

    const progress = rawProgress as Partial<AudioImportProgress>;
    if (
      typeof progress.transferredBytes !== 'number' ||
      !Number.isFinite(progress.transferredBytes) ||
      typeof progress.totalBytes !== 'number' ||
      !Number.isFinite(progress.totalBytes) ||
      progress.totalBytes <= 0 ||
      typeof progress.percent !== 'number' ||
      !Number.isFinite(progress.percent)
    ) {
      return;
    }

    this.uploadProgress = {
      transferredBytes: Math.max(0, progress.transferredBytes),
      totalBytes: progress.totalBytes,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
    };
    this.notify();
  }

  private static releaseUploadedRecording(
    recording: SavedRecording | null,
  ): void {
    if (!recording) return;
    window.electron.audio
      .discardRecording(recording.relativePath)
      .catch(() => undefined);
  }

  private receivePartial(rawPayload: unknown): void {
    if (this.inputMode !== 'file') return;
    if (typeof rawPayload !== 'object' || rawPayload === null) return;

    const payload = rawPayload as { jobId?: unknown; segment?: unknown };
    if (typeof payload.jobId !== 'string') return;
    if (!this.job || payload.jobId !== this.job.id) return;
    const segment = TranscriptionController.normalizePartialSegment(
      payload.segment,
    );
    if (!segment) return;

    this.appendFileTranscriptSegment(segment);
  }

  private appendFileTranscriptSegment(segment: TranscriptSegment): void {
    if (isBlankTranscript(segment.text)) return;
    const duplicate = this.liveSegments.some(
      (candidate) => candidate.sourceId === segment.id,
    );
    if (duplicate) return;

    const liveSegment: LiveTranscriptSegment = {
      id: this.liveSequence,
      sourceId: segment.id,
      text: segment.text,
      engine: 'whisper',
      modelName: 'Whisper',
      elapsedMs: 0,
    };
    this.liveSequence += 1;
    this.liveSegments = [...this.liveSegments, liveSegment];
    this.notify();
  }

  private hydrateFileTranscriptFromFinalResult(job: TranscriptionJob): void {
    if (this.inputMode !== 'file' || !job.result) return;
    if (this.liveSegments.length > 0) return;

    const sourceSegments =
      job.result.segments.length > 0
        ? job.result.segments
        : [
            {
              id: 'final-text',
              startMs: 0,
              endMs: null,
              text: job.result.text,
            },
          ];

    sourceSegments.forEach((segment) =>
      this.appendFileTranscriptSegment(segment),
    );
  }

  private static normalizePartialSegment(
    rawSegment: unknown,
  ): TranscriptSegment | null {
    if (typeof rawSegment !== 'object' || rawSegment === null) return null;
    const segment = rawSegment as Partial<TranscriptSegment>;
    if (typeof segment.text !== 'string' || !segment.text.trim()) return null;

    return {
      id: typeof segment.id === 'string' ? segment.id : `partial-${Date.now()}`,
      startMs:
        typeof segment.startMs === 'number' && Number.isFinite(segment.startMs)
          ? segment.startMs
          : 0,
      endMs:
        typeof segment.endMs === 'number' && Number.isFinite(segment.endMs)
          ? segment.endMs
          : null,
      text: segment.text.trim(),
    };
  }

  private receiveStatus(rawJob: unknown): void {
    if (typeof rawJob !== 'object' || rawJob === null) return;
    const job = rawJob as TranscriptionJob;
    // 状态事件是全局广播的。只认自己发起的那个任务：
    // 否则新建的 controller（比如关掉复核窗后重建的那个）会把上一轮
    // 还没结束的任务认领过来，界面立刻变成「转写中」，录音和上传都点不动。
    if (!this.job || job.id !== this.job.id) return;

    this.job = job;
    if (this.inputMode === 'file' && job.status === 'completed') {
      this.hydrateFileTranscriptFromFinalResult(job);
      this.finalizeStructuredNote().catch(() => undefined);
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
