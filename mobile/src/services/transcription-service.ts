import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import {
  initParakeet,
  initWhisper,
  type ParakeetContext,
  type WhisperContext,
} from "whisper.rn/index";
import AudioConverter from "../../modules/audio-converter";
import {
  AudioPcmStreamAdapter,
} from "whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter";
// whisper.rn 0.7.2 exposes this index through an explicit trailing-slash export.
/* eslint-disable import/no-unresolved */
import {
  RealtimeTranscriber,
  type AudioStreamConfig,
  type AudioStreamData,
  type AudioStreamInterface,
  type RealtimeTranscribeEvent,
  type RealtimeTranscriberDependencies,
  type WavFileWriterFs,
} from "whisper.rn/realtime-transcription/";
/* eslint-enable import/no-unresolved */

import { MAX_IMPORTED_AUDIO_BYTES } from "@/domain/audio-import/audio-import";
import type { SttModel } from "@/domain/stt-model/stt-model";
import { SttModelService } from "@/services/stt-model-service";
import { ensureStorageAvailable } from "@/services/storage-safety-service";
import { type InferenceTask, type InferenceTaskContext, LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { flushCurrentTranscriptionSlice } from "@/services/realtime-transcription-drain";
import type { TranscriptionLanguage } from "@/services/transcription-language";

export const RECORDINGS_DIRECTORY_NAME = "recordings";
export const MAX_AUDIO_DURATION_SECONDS = 2 * 60 * 60;
const LIVE_AUDIO_BYTES_PER_SECOND = 16_000 * 1 * 2;
const MAX_PREPARED_WAV_BYTES =
  MAX_AUDIO_DURATION_SECONDS * LIVE_AUDIO_BYTES_PER_SECOND + 44;
const MAX_AUDIO_DURATION_MS = MAX_AUDIO_DURATION_SECONDS * 1000;
const DURATION_WARNING_MS = 5 * 60 * 1000;
const MAX_COMBINED_FINAL_AUDIO_MS = 45 * 1000;
const MIN_EMPTY_TRANSCRIPT_RETRY_MS = 1_000;
const MIN_AUDIBLE_PEAK = 128;
const MIN_AUDIBLE_AVERAGE = 8;

type SessionCallbacks = {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onDurationWarning?: (remainingSeconds: number) => void;
  onDurationLimitReached?: () => void;
};

type ImportedAudioCallbacks = {
  onPrepared: () => void;
};

type TranscriptionOptions = {
  language?: TranscriptionLanguage;
};

type AudioSignalStats = {
  bytes: number;
  samples: number;
  peakAmplitude: number;
  averageAmplitude: number;
};

class PausableAudioStream implements AudioStreamInterface {
  private stream = new AudioPcmStreamAdapter();
  private config: AudioStreamConfig | null = null;
  private dataCallback: ((data: AudioStreamData) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;
  private statusCallback: ((isRecording: boolean) => void) | null = null;
  private capturedBytes = 0;
  private capturedSamples = 0;
  private amplitudeTotal = 0;
  private peakAmplitude = 0;

  public async initialize(config: AudioStreamConfig): Promise<void> {
    this.config = config;
    await this.stream.initialize(config);
    this.bindCallbacks();
  }

  public start(): Promise<void> {
    return this.stream.start();
  }

  public stop(): Promise<void> {
    return this.stream.stop();
  }

  public isRecording(): boolean {
    return this.stream.isRecording();
  }

  public onData(callback: (data: AudioStreamData) => void): void {
    this.dataCallback = callback;
    this.stream.onData(this.handleData);
  }

  public onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
    this.stream.onError(callback);
  }

  public onStatusChange(callback: (isRecording: boolean) => void): void {
    this.statusCallback = callback;
    this.stream.onStatusChange(callback);
  }

  public async restart(): Promise<void> {
    if (this.config === null) {
      throw new Error("Audio stream has not been initialized.");
    }

    this.stream = new AudioPcmStreamAdapter();
    await this.stream.initialize(this.config);
    this.bindCallbacks();
    await this.stream.start();
  }

  public release(): Promise<void> {
    return this.stream.release();
  }

  public getSignalStats(): AudioSignalStats {
    return {
      bytes: this.capturedBytes,
      samples: this.capturedSamples,
      peakAmplitude: this.peakAmplitude,
      averageAmplitude:
        this.capturedSamples === 0
          ? 0
          : this.amplitudeTotal / this.capturedSamples,
    };
  }

  private bindCallbacks(): void {
    if (this.dataCallback !== null) this.stream.onData(this.handleData);
    if (this.errorCallback !== null) this.stream.onError(this.errorCallback);
    if (this.statusCallback !== null) {
      this.stream.onStatusChange(this.statusCallback);
    }
  }

  private readonly handleData = (streamData: AudioStreamData): void => {
    const { data } = streamData;
    this.capturedBytes += data.length;
    for (let index = 0; index + 1 < data.length; index += 2) {
      let sample = data[index] | (data[index + 1] << 8);
      if (sample >= 0x8000) sample -= 0x10000;
      const amplitude = Math.abs(sample);
      this.amplitudeTotal += amplitude;
      this.peakAmplitude = Math.max(this.peakAmplitude, amplitude);
      this.capturedSamples += 1;
    }
    this.dataCallback?.(streamData);
  };
}

type PendingTranscription = {
  sliceIndex: number;
  audioData: Uint8Array;
  isFinal?: boolean;
};

type RealtimeTranscriberInternals = {
  transcriptionQueue: PendingTranscription[];
  processingPromise: Promise<void> | null;
  activeTranscriptions: Set<{
    promise: Promise<unknown>;
    stop: () => Promise<void>;
  }>;
  sliceManager: {
    getCurrentSliceInfo: () => { currentSliceIndex: number };
    getAudioDataForTranscription: (sliceIndex: number) => Uint8Array | null;
  };
};

const fileSystemAdapter: WavFileWriterFs = {
  writeFile: (path, data, encoding) =>
    LegacyFileSystem.writeAsStringAsync(path, data, {
      encoding: encoding === "base64" ? "base64" : "utf8",
    }),
  appendFile: (path, data, encoding) =>
    LegacyFileSystem.writeAsStringAsync(path, data, {
      encoding: encoding === "base64" ? "base64" : "utf8",
      append: true,
    }),
  readFile: (path, encoding) =>
    LegacyFileSystem.readAsStringAsync(path, {
      encoding: encoding === "base64" ? "base64" : "utf8",
    }),
  exists: async (path) => (await LegacyFileSystem.getInfoAsync(path)).exists,
  unlink: (path) => LegacyFileSystem.deleteAsync(path, { idempotent: true }),
};

export class TranscriptionService {
  private context: ParakeetContext | WhisperContext | null = null;
  private contextModelId: string | null = null;
  private transcriber: RealtimeTranscriber | null = null;
  private audioStream: PausableAudioStream | null = null;
  private recordingRelativePath: string | null = null;
  private results = new Map<number, string>();
  private paused = false;
  private queueMaintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private durationWarningTimer: ReturnType<typeof setTimeout> | null = null;
  private durationLimitTimer: ReturnType<typeof setTimeout> | null = null;
  private recordingStartedAt: number | null = null;
  private accumulatedRecordingMs = 0;
  private durationWarningDelivered = false;
  private sessionCallbacks: SessionCallbacks | null = null;
  private releaseInferenceSlot: (() => void) | null = null;
  private starting = false;
  private activeFileTask: InferenceTask<string> | null = null;
  private readinessTask: InferenceTask<void> | null = null;
  private sessionLanguage: TranscriptionLanguage = "auto";
  private sessionModel: SttModel | null = null;

  public constructor(
    private readonly sttModelService: SttModelService,
    private readonly coordinator: LocalLlmCoordinator,
  ) {
    coordinator.registerIdleCleanup(
      "stt-runtime",
      () => this.releaseContext(),
      ["live-stt", "file-stt"],
    );
  }

  public async start(
    callbacks: SessionCallbacks,
    options: TranscriptionOptions = {},
  ): Promise<void> {
    if (this.starting || this.transcriber !== null || this.releaseInferenceSlot !== null) {
      throw new Error("A transcription session is already active.");
    }

    this.starting = true;
    try {
      await this.startExclusive(callbacks, options);
    } finally {
      this.starting = false;
    }
  }

  private async startExclusive(
    callbacks: SessionCallbacks,
    options: TranscriptionOptions,
  ): Promise<void> {

    const model = await this.sttModelService.getActiveModel();
    if (model === null) {
      throw new Error("Choose an active speech recognition model first.");
    }
    const modelFile = this.sttModelService.resolveModelFile(model);
    if (!modelFile.exists) {
      throw new Error("The active model file is missing.");
    }
    const requestedLanguage = options.language ?? "auto";
    if (
      model.getEngine() === "parakeet" &&
      requestedLanguage !== "auto" &&
      requestedLanguage !== "en"
    ) {
      throw new Error(
        "The active Parakeet model recognizes English only. Choose English or activate a multilingual Whisper model.",
      );
    }

    ensureStorageAvailable(
      MAX_PREPARED_WAV_BYTES,
      "start a two-hour live transcription",
    );

    const recordings = new Directory(Paths.document, RECORDINGS_DIRECTORY_NAME);
    recordings.create({ idempotent: true, intermediates: true });
    this.releaseInferenceSlot = await this.coordinator.acquire("live-stt");
    const fileName = `recording-${Date.now()}.wav`;
    const recording = new File(recordings, fileName);
    this.recordingRelativePath = `${RECORDINGS_DIRECTORY_NAME}/${fileName}`;
    this.results.clear();
    this.paused = false;
    this.accumulatedRecordingMs = 0;
    this.durationWarningDelivered = false;
    this.sessionCallbacks = callbacks;
    this.sessionLanguage = requestedLanguage;
    this.sessionModel = model;

    try {
      await this.ensureContext(model.getId(), model.getEngine(), modelFile.uri);
      this.audioStream = new PausableAudioStream();
      const dependencies: RealtimeTranscriberDependencies =
        model.getEngine() === "parakeet"
          ? {
              parakeetContext: this.context as ParakeetContext,
              audioStream: this.audioStream,
              fs: fileSystemAdapter,
            }
          : {
              whisperContext: this.context as WhisperContext,
              audioStream: this.audioStream,
              fs: fileSystemAdapter,
            };
      const catalogEntry = this.sttModelService.getCatalogEntry(model.getId());
      const isWhisper = model.getEngine() === "whisper";
      const whisperLanguage = this.resolveWhisperLanguage(
        catalogEntry?.transcriptionLanguage,
        requestedLanguage,
      );
      this.transcriber = new RealtimeTranscriber(
        dependencies,
        {
          // Whisper benefits from a longer phrase window for Chinese word
          // boundaries and punctuation. Parakeet keeps the lower-latency
          // English settings.
          audioSliceSec: isWhisper ? 12 : 8,
          audioMinSec: isWhisper ? 1.2 : 0.8,
          maxSlicesInMemory: isWhisper ? 4 : 6,
          realtimeProcessingPauseMs: isWhisper ? 1600 : 1200,
          initRealtimeAfterMs: isWhisper ? 1200 : 800,
          audioOutputPath: recording.uri,
          ...(model.getEngine() === "whisper"
            ? {
                transcribeOptions: {
                  language: whisperLanguage,
                  translate: false,
                },
              }
            : {}),
        },
        {
          onTranscribe: (event: RealtimeTranscribeEvent) => {
            if (event.data?.result !== undefined) {
              this.results.set(event.sliceIndex, event.data.result.trim());
              callbacks.onText(this.getTranscript());
            }
          },
          onError: callbacks.onError,
        },
      );
      await this.transcriber.start();
      this.recordingStartedAt = Date.now();
      this.scheduleDurationTimers();
      this.queueMaintenanceTimer = setInterval(
        () => this.compactPendingTranscriptions(),
        500,
      );
    } catch (error) {
      await this.release(true);
      throw error;
    }
  }

  public async pause(): Promise<void> {
    if (this.audioStream === null || this.transcriber === null || this.paused) {
      return;
    }
    await this.audioStream.stop();
    this.captureActiveRecordingDuration();
    this.clearDurationTimers();
    this.paused = true;
    await flushCurrentTranscriptionSlice(this.transcriber);
  }

  public async resume(): Promise<void> {
    if (this.audioStream === null || !this.paused) return;
    await this.audioStream.restart();
    this.paused = false;
    this.recordingStartedAt = Date.now();
    this.scheduleDurationTimers();
  }

  public async finish(): Promise<{ transcript: string; audioRelativePath: string }> {
    if (this.transcriber === null || this.recordingRelativePath === null) {
      throw new Error("There is no active transcription session.");
    }
    this.captureActiveRecordingDuration();
    this.clearDurationTimers();
    const recordingDurationMs = this.accumulatedRecordingMs;
    const signalStats = this.audioStream?.getSignalStats() ?? {
      bytes: 0,
      samples: 0,
      peakAmplitude: 0,
      averageAmplitude: 0,
    };

    // Stop accepting PCM before finalizing the current slice. whisper.rn's
    // nextSlice() only queues the final inference; stop() marks the transcriber
    // inactive before draining that queue, which makes the completed result get
    // discarded. Wait for the queued final slice while the transcriber is still
    // active, then let stop() finalize the WAV and release its stream state.
    await this.audioStream?.stop();
    this.paused = true;
    // Keep using the model that created this session even if the user changes
    // the globally active model from another screen while recording.
    const activeModel = this.sessionModel;
    const combinedAudio =
      activeModel?.getEngine() === "whisper" &&
      recordingDurationMs <= MAX_COMBINED_FINAL_AUDIO_MS
        ? this.collectRetainedAudio(this.transcriber)
        : null;

    if (combinedAudio !== null && this.context !== null) {
      // Short Whisper sessions can otherwise contain several increasingly long
      // snapshots of the same audio. Abort those redundant jobs and run one
      // authoritative pass over the complete retained PCM instead.
      const finalPassStartedAt = Date.now();
      console.info("[LiveTranscription] Combined final pass started", {
        recordingDurationMs,
        audioBytes: combinedAudio.length,
      });
      try {
        await this.cancelPendingTranscriptions(this.transcriber);
        const catalogEntry = activeModel === null
          ? null
          : this.sttModelService.getCatalogEntry(activeModel.getId());
        const finalRequest = (this.context as WhisperContext).transcribeData(
          combinedAudio.buffer as ArrayBuffer,
          {
            language: this.resolveWhisperLanguage(
              catalogEntry?.transcriptionLanguage,
              this.sessionLanguage,
            ),
            translate: false,
          },
        );
        const finalResult = await finalRequest.promise;
        const finalText = finalResult.result.trim();
        const previewText = this.getTranscript();
        if (finalText.length > 0 || previewText.length === 0) {
          this.results.clear();
          this.results.set(0, finalText);
          this.sessionCallbacks?.onText(this.getTranscript());
        }
        console.info("[LiveTranscription] Combined final pass completed", {
          durationMs: Date.now() - finalPassStartedAt,
          transcriptLength: finalText.length,
          retainedPreview: finalText.length === 0 && previewText.length > 0,
        });
      } catch (error) {
        // A cancelled preview or a transient final-pass failure must not strand
        // the recording. Requeue the retained current slice and finish normally.
        console.warn(
          "[LiveTranscription] Combined final pass failed; using queued final slice",
          { error },
        );
        await this.transcriber.nextSlice();
        await this.waitForPendingTranscriptions(this.transcriber);
      }
    } else {
      await this.transcriber.nextSlice();
      await this.waitForPendingTranscriptions(this.transcriber);
    }
    await this.transcriber.stop();
    await this.retryEmptyTranscript(
      activeModel,
      recordingDurationMs,
      signalStats,
    );
    const result = {
      transcript: this.getTranscript(),
      audioRelativePath: this.recordingRelativePath,
    };
    await this.release(false);
    return result;
  }

  public async discard(): Promise<void> {
    await this.release(true);
  }

  public hasActiveSession(): boolean {
    return this.transcriber !== null && this.recordingRelativePath !== null;
  }

  public transcribeFile(
    inputUri: string,
    callbacks: ImportedAudioCallbacks,
    requestId = `audio-import-${Date.now()}`,
    options: TranscriptionOptions = {},
  ): Promise<string> {
    const task = this.coordinator.schedule("file-stt", (lifecycle) =>
      this.transcribeFileExclusive(
        inputUri,
        callbacks,
        requestId,
        lifecycle,
        options,
      ),
    );
    this.activeFileTask = task;
    return task.promise.finally(() => { if (this.activeFileTask === task) this.activeFileTask = null; });
  }

  public cancelFileTranscription(): Promise<void> { return this.activeFileTask?.cancel() ?? Promise.resolve(); }

  public ensureReady(): Promise<void> {
    if (this.readinessTask !== null) return this.readinessTask.promise;
    const task = this.coordinator.schedule("file-stt", () =>
      this.ensureActiveModelContext(),
    );
    this.readinessTask = task;
    return task.promise.finally(() => {
      if (this.readinessTask === task) this.readinessTask = null;
    });
  }

  private async ensureActiveModelContext(): Promise<void> {
    const model = await this.sttModelService.getActiveModel();
    if (!model) return;
    const file = this.sttModelService.resolveModelFile(model);
    if (!file.exists) return;
    await this.ensureContext(model.getId(), model.getEngine(), file.uri);
  }

  private async ensureContext(modelId: string, engine: "parakeet" | "whisper", uri: string): Promise<void> {
    if (this.context && this.contextModelId === modelId) return;
    const previous = this.context;
    this.context = null;
    this.contextModelId = null;
    await previous?.release().catch(() => undefined);
    this.context = await this.initializeContext(engine, uri);
    this.contextModelId = modelId;
  }

  private async transcribeFileExclusive(
    inputUri: string,
    callbacks: ImportedAudioCallbacks,
    requestId: string,
    lifecycle: InferenceTaskContext,
    options: TranscriptionOptions,
  ): Promise<string> {
    const startedAt = Date.now();
    console.info("[AudioImport] Local transcription service started", { requestId });
    lifecycle.throwIfCancelled();
    if (this.transcriber !== null) {
      throw new Error("A transcription session is already active.");
    }

    const model = await this.sttModelService.getActiveModel();
    lifecycle.throwIfCancelled();
    if (model === null) {
      console.warn("[AudioImport] No active STT model", { requestId });
      throw new Error("Choose an active speech recognition model first.");
    }
    const modelFile = this.sttModelService.resolveModelFile(model);
    if (!modelFile.exists) {
      console.warn("[AudioImport] Active STT model file missing", {
        requestId,
        modelId: model.getId(),
      });
      throw new Error("The active model file is missing.");
    }
    const requestedLanguage = options.language ?? "auto";
    if (
      model.getEngine() === "parakeet" &&
      requestedLanguage !== "auto" &&
      requestedLanguage !== "en"
    ) {
      throw new Error(
        "The active Parakeet model recognizes English only. Choose English or activate a multilingual Whisper model.",
      );
    }

    const inputFile = new File(inputUri);
    if (!inputFile.exists) {
      throw new Error("The selected audio file is missing.");
    }
    if (inputFile.size > MAX_IMPORTED_AUDIO_BYTES) {
      throw new Error("Audio files must be no larger than 2 GB.");
    }
    ensureStorageAvailable(
      MAX_PREPARED_WAV_BYTES,
      "prepare this audio file for transcription",
    );
    lifecycle.throwIfCancelled();

    console.info("[AudioImport] Active STT model resolved", {
      requestId,
      modelId: model.getId(),
      modelName: model.getName(),
      engine: model.getEngine(),
    });

    const preparedFile = new File(
      Paths.cache,
      `prepared-audio-${Date.now()}.wav`,
    );
    let prepared: { uri: string; temporary: boolean } | null = null;
    try {
      const preparationStartedAt = Date.now();
      console.info("[AudioImport] Preparing audio locally", { requestId });
      prepared = await AudioConverter.prepareAudioAsync(
        inputUri,
        preparedFile.uri,
      );
      lifecycle.throwIfCancelled();
      console.info("[AudioImport] Audio preparation completed", {
        requestId,
        converted: prepared.temporary,
        durationMs: Date.now() - preparationStartedAt,
      });
      callbacks.onPrepared();
      const modelLoadStartedAt = Date.now();
      console.info("[AudioImport] Loading local STT model", { requestId });
      await this.ensureContext(model.getId(), model.getEngine(), modelFile.uri);
      lifecycle.throwIfCancelled();
      console.info("[AudioImport] Local STT model loaded", {
        requestId,
        durationMs: Date.now() - modelLoadStartedAt,
      });
      const inferenceStartedAt = Date.now();
      console.info("[AudioImport] Local file inference started", { requestId });
      const catalogEntry = this.sttModelService.getCatalogEntry(model.getId());
      const request = model.getEngine() === "parakeet"
        ? (this.context as ParakeetContext).transcribe(prepared.uri)
        : (this.context as WhisperContext).transcribe(prepared.uri, {
            language: this.resolveWhisperLanguage(
              catalogEntry?.transcriptionLanguage,
              requestedLanguage,
            ),
            translate: false,
          });
      lifecycle.setInterrupt(() => request.stop());
      const result = await request.promise.finally(() => {
        lifecycle.setInterrupt(null);
      });
      lifecycle.throwIfCancelled();
      const transcript = result.result.trim();
      console.info("[AudioImport] Local file inference completed", {
        requestId,
        durationMs: Date.now() - inferenceStartedAt,
        transcriptLength: transcript.length,
        segmentCount: result.segments?.length ?? null,
        totalDurationMs: Date.now() - startedAt,
      });
      return transcript;
    } catch (error) {
      lifecycle.throwIfCancelled();
      console.error("[AudioImport] Local transcription service failed", {
        requestId,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    } finally {
      if (prepared?.temporary && preparedFile.exists) {
        preparedFile.delete();
        console.info("[AudioImport] Prepared temporary WAV deleted", { requestId });
      }
      console.info("[AudioImport] Local transcription service released", {
        requestId,
        totalDurationMs: Date.now() - startedAt,
      });
    }
  }

  public preserveImportedAudio(inputUri: string, originalName: string): string {
    const recordings = new Directory(Paths.document, RECORDINGS_DIRECTORY_NAME);
    recordings.create({ idempotent: true, intermediates: true });
    const extension = originalName.match(/\.[a-z0-9]{1,8}$/i)?.[0].toLowerCase() ?? ".audio";
    const fileName = `imported-${Date.now()}${extension}`;
    const destination = new File(recordings, fileName);
    const inputFile = new File(inputUri);
    if (!inputFile.exists) {
      throw new Error("The selected audio file is missing.");
    }
    ensureStorageAvailable(inputFile.size, "save this audio recording");
    console.info("[AudioImport] Preserving original audio for note", {
      originalName,
      destinationName: fileName,
    });
    try {
      new File(inputUri).copy(destination);
    } catch (error) {
      if (destination.exists) destination.delete();
      throw error;
    }
    console.info("[AudioImport] Original audio preserved", {
      destinationName: fileName,
      sizeBytes: destination.size,
    });
    return `${RECORDINGS_DIRECTORY_NAME}/${fileName}`;
  }

  public deleteTemporaryImport(inputUri: string): void {
    const file = new File(inputUri);
    if (file.exists) {
      const sizeBytes = file.size;
      file.delete();
      console.info("[AudioImport] Picker cache file deleted", { sizeBytes });
    }
  }

  public deleteRecording(audioRelativePath: string): void {
    const file = new File(Paths.document, ...audioRelativePath.split("/"));
    if (file.exists) file.delete();
  }

  private getTranscript(): string {
    return [...this.results.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, text]) => text)
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  private captureActiveRecordingDuration(): void {
    if (this.recordingStartedAt === null) return;
    this.accumulatedRecordingMs += Date.now() - this.recordingStartedAt;
    this.recordingStartedAt = null;
  }

  private scheduleDurationTimers(): void {
    this.clearDurationTimers();
    const elapsedMs = this.accumulatedRecordingMs;
    const warningAtMs = MAX_AUDIO_DURATION_MS - DURATION_WARNING_MS;

    if (!this.durationWarningDelivered) {
      const warningDelayMs = warningAtMs - elapsedMs;
      if (warningDelayMs <= 0) {
        this.durationWarningDelivered = true;
        this.sessionCallbacks?.onDurationWarning?.(DURATION_WARNING_MS / 1000);
      } else {
        this.durationWarningTimer = setTimeout(() => {
          this.durationWarningTimer = null;
          this.durationWarningDelivered = true;
          this.sessionCallbacks?.onDurationWarning?.(DURATION_WARNING_MS / 1000);
        }, warningDelayMs);
      }
    }

    const limitDelayMs = Math.max(0, MAX_AUDIO_DURATION_MS - elapsedMs);
    this.durationLimitTimer = setTimeout(() => {
      this.durationLimitTimer = null;
      void this.pause()
        .then(() => this.sessionCallbacks?.onDurationLimitReached?.())
        .catch((error: unknown) => {
          this.sessionCallbacks?.onError(
            error instanceof Error
              ? error.message
              : "The recording could not be stopped at the two-hour limit.",
          );
        });
    }, limitDelayMs);
  }

  private clearDurationTimers(): void {
    if (this.durationWarningTimer !== null) {
      clearTimeout(this.durationWarningTimer);
      this.durationWarningTimer = null;
    }
    if (this.durationLimitTimer !== null) {
      clearTimeout(this.durationLimitTimer);
      this.durationLimitTimer = null;
    }
  }

  private initializeContext(
    engine: "parakeet" | "whisper",
    modelUri: string,
  ): Promise<ParakeetContext | WhisperContext> {
    if (engine === "parakeet") {
      return initParakeet({ filePath: modelUri, useGpu: true });
    }

    return initWhisper({
      filePath: modelUri,
      useGpu: true,
      useCoreMLIos: false,
    });
  }

  private resolveWhisperLanguage(
    modelLanguage: string | undefined,
    requestedLanguage: TranscriptionLanguage,
  ): string {
    return requestedLanguage === "auto"
      ? (modelLanguage ?? "auto")
      : requestedLanguage;
  }

  private async retryEmptyTranscript(
    model: SttModel | null,
    recordingDurationMs: number,
    signalStats: AudioSignalStats,
  ): Promise<void> {
    if (
      this.getTranscript().length > 0 ||
      model === null ||
      this.context === null ||
      this.recordingRelativePath === null ||
      recordingDurationMs < MIN_EMPTY_TRANSCRIPT_RETRY_MS
    ) {
      return;
    }

    const hasAudibleSignal =
      signalStats.peakAmplitude >= MIN_AUDIBLE_PEAK &&
      signalStats.averageAmplitude >= MIN_AUDIBLE_AVERAGE;
    console.info("[LiveTranscription] Empty transcript signal check", {
      recordingDurationMs,
      ...signalStats,
      hasAudibleSignal,
    });
    if (!hasAudibleSignal) return;

    const recording = new File(
      Paths.document,
      ...this.recordingRelativePath.split("/"),
    );
    if (!recording.exists) return;

    try {
      const retryStartedAt = Date.now();
      const catalogEntry = this.sttModelService.getCatalogEntry(model.getId());
      const request = model.getEngine() === "parakeet"
        ? (this.context as ParakeetContext).transcribe(recording.uri)
        : (this.context as WhisperContext).transcribe(recording.uri, {
            language: this.resolveWhisperLanguage(
              catalogEntry?.transcriptionLanguage,
              this.sessionLanguage,
            ),
            translate: false,
          });
      const retry = await request.promise;
      const text = retry.result.trim();
      if (text.length > 0) {
        this.results.clear();
        this.results.set(0, text);
        this.sessionCallbacks?.onText(text);
      }
      console.info("[LiveTranscription] Empty transcript retry completed", {
        durationMs: Date.now() - retryStartedAt,
        transcriptLength: text.length,
      });
    } catch (error) {
      // The original finalized recording remains available for the user's
      // explicit save/discard decision even if this best-effort retry fails.
      console.warn("[LiveTranscription] Empty transcript retry failed", {
        error,
      });
    }
  }

  /**
   * whisper.rn 0.7.2 can queue repeated full snapshots of the same slice faster
   * than a local model consumes them. Keep only the newest pending snapshot for
   * each slice so long sessions cannot fall permanently behind live audio.
   */
  private compactPendingTranscriptions(): void {
    if (this.transcriber === null) return;

    const internals = this.transcriber as unknown as RealtimeTranscriberInternals;
    const queue = internals.transcriptionQueue;
    if (!Array.isArray(queue) || queue.length < 2) return;

    const latestBySlice = new Map<number, PendingTranscription>();
    queue.forEach((item) => latestBySlice.set(item.sliceIndex, item));
    queue.splice(
      0,
      queue.length,
      ...[...latestBySlice.values()].sort(
        (left, right) => left.sliceIndex - right.sliceIndex,
      ),
    );
  }

  private async waitForPendingTranscriptions(
    transcriber: RealtimeTranscriber,
  ): Promise<void> {
    const internals = transcriber as unknown as RealtimeTranscriberInternals;

    // A completed processingPromise normally means the queue is empty. Loop in
    // case a final audio callback arrived while the current promise was settling.
    while (true) {
      const processingPromise = internals.processingPromise;
      if (processingPromise !== null) {
        await processingPromise;
      }
      if (internals.transcriptionQueue.length === 0) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  private collectRetainedAudio(
    transcriber: RealtimeTranscriber,
  ): Uint8Array | null {
    const internals = transcriber as unknown as RealtimeTranscriberInternals;
    const { currentSliceIndex } = internals.sliceManager.getCurrentSliceInfo();
    const slices: Uint8Array[] = [];

    for (let index = 0; index <= currentSliceIndex; index += 1) {
      const audio = internals.sliceManager.getAudioDataForTranscription(index);
      if (audio !== null && audio.length > 0) slices.push(audio);
    }
    if (slices.length === 0) return null;

    const combined = new Uint8Array(
      slices.reduce((total, audio) => total + audio.length, 0),
    );
    let offset = 0;
    slices.forEach((audio) => {
      combined.set(audio, offset);
      offset += audio.length;
    });
    return combined;
  }

  private async cancelPendingTranscriptions(
    transcriber: RealtimeTranscriber,
  ): Promise<void> {
    const internals = transcriber as unknown as RealtimeTranscriberInternals;
    internals.transcriptionQueue.splice(0);
    await Promise.allSettled(
      [...internals.activeTranscriptions].map((request) => request.stop()),
    );
    if (internals.processingPromise !== null) {
      await internals.processingPromise;
    }
    internals.transcriptionQueue.splice(0);
  }

  private async releaseContext(): Promise<void> {
    const context = this.context;
    const modelId = this.contextModelId;
    this.context = null;
    this.contextModelId = null;
    if (context === null) return;
    await context.release().catch((error) => {
      console.warn("[LiveTranscription] Could not release idle STT context", {
        modelId,
        error,
      });
    });
  }

  private async release(deleteRecording: boolean): Promise<void> {
    const recordingPath = this.recordingRelativePath;
    const transcriber = this.transcriber;
    const releaseInferenceSlot = this.releaseInferenceSlot;
    this.transcriber = null;
    this.audioStream = null;
    this.releaseInferenceSlot = null;
    this.recordingRelativePath = null;
    this.paused = false;
    this.captureActiveRecordingDuration();
    this.clearDurationTimers();
    this.accumulatedRecordingMs = 0;
    this.durationWarningDelivered = false;
    this.sessionCallbacks = null;
    this.sessionLanguage = "auto";
    this.sessionModel = null;
    if (this.queueMaintenanceTimer !== null) {
      clearInterval(this.queueMaintenanceTimer);
      this.queueMaintenanceTimer = null;
    }

    await transcriber?.release().catch(() => undefined);
    releaseInferenceSlot?.();
    if (deleteRecording && recordingPath !== null) {
      const file = new File(Paths.document, ...recordingPath.split("/"));
      if (file.exists) file.delete();
    }
  }
}
