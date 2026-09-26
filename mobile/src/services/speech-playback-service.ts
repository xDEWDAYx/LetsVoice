import { setAudioModeAsync } from "expo-audio";
import { createStreamingTTS, type StreamingTtsEngine, type TtsStreamController, type TTSModelType } from "react-native-sherpa-onnx/tts";

import { type InferenceTask, type InferenceTaskContext, LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { pcmPlayback } from "@/services/pcm-playback";
import { TtsModelService } from "@/services/tts-model-service";
import { detectTtsLanguage, type TtsLanguageCode } from "@/services/tts-language";

export type SpeechPlaybackErrorCode = "missing-model" | "unsupported-language" | "busy" | "playback";
export type SpeechPlaybackPhase = "idle" | "preparing" | "playing" | "error";
export type SpeechPlaybackState = { phase: SpeechPlaybackPhase; speechId: string | null; label: string | null; message: string | null; errorCode: SpeechPlaybackErrorCode | null; inferenceBusy: boolean };
export type SpeechRequest = { id: string; label: string; text: string; requestedLanguage?: TtsLanguageCode };

type SpeechSession = {
  playbackId: string;
  id: string;
  label: string;
  text: string;
  requestedLanguage: TtsLanguageCode;
  engine: StreamingTtsEngine | null;
  controller: TtsStreamController | null;
  writeChain: Promise<void>;
  playbackStartedAt: number | null;
  totalSamples: number;
  sampleRate: number | null;
  completionTimer: ReturnType<typeof setTimeout> | null;
  interruptPromise: Promise<void> | null;
  streamStarted: boolean;
  streamEnded: Promise<void>;
  resolveStreamEnded: () => void;
  cancelled: boolean;
  cleaned: boolean;
  task: InferenceTask<void> | null;
  stopRequestedAt: number | null;
};

const initialState: SpeechPlaybackState = { phase: "idle", speechId: null, label: null, message: null, errorCode: null, inferenceBusy: false };
let playbackSessionCounter = 0;

export class SpeechPlaybackService {
  private readonly listeners = new Set<() => void>();
  private state: SpeechPlaybackState = initialState;
  private session: SpeechSession | null = null;
  private lifecycleChain: Promise<void> = Promise.resolve();
  private initialized = false;
  private cachedEngine: StreamingTtsEngine | null = null;
  private cachedEngineKey: string | null = null;
  private readonly uiDetachedTaskIds = new Set<number>();

  public constructor(private readonly ttsModelService: TtsModelService, private readonly coordinator: LocalLlmCoordinator) {
    this.coordinator.registerSpeechPlaybackStopper(() => this.stop());
    this.coordinator.subscribe(() => {
      const snapshot = this.coordinator.getSnapshot();
      for (const taskId of this.uiDetachedTaskIds) {
        const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
        if (!task || task.status === "completed" || task.status === "cancelled" || task.status === "failed") {
          this.uiDetachedTaskIds.delete(taskId);
        }
      }
      const inferenceBusy = snapshot.tasks.some((task) =>
        (task.status === "queued" || task.status === "running") && !this.uiDetachedTaskIds.has(task.id),
      );
      if (inferenceBusy !== this.state.inferenceBusy) this.setState({ ...this.state, inferenceBusy });
    });
  }

  public getSnapshot = (): SpeechPlaybackState => this.state;
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  public initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
  }

  public speak(request: SpeechRequest): Promise<void> {
    const text = request.text.trim();
    if (!text) {
      this.setError(request.id, request.label, "playback", "There is no text to read aloud.");
      return Promise.resolve();
    }
    // An active button is a stop button. The next press starts again from the beginning.
    if (this.session?.id === request.id) return this.stop("user");
    const previous = this.detachSession();
    if (previous?.task) {
      this.uiDetachedTaskIds.add(previous.task.id);
      void previous.task.cancel();
    }
    if (previous) void this.enqueueLifecycle(() => this.cleanupSession(previous));
    let resolveStreamEnded: () => void = () => {};
    const streamEnded = new Promise<void>((resolve) => {
      resolveStreamEnded = resolve;
    });
    const session: SpeechSession = {
      playbackId: `speech-playback-${++playbackSessionCounter}`,
      id: request.id, label: request.label, text, requestedLanguage: request.requestedLanguage ?? detectTtsLanguage(text), engine: null, controller: null,
      writeChain: Promise.resolve(), playbackStartedAt: null, totalSamples: 0,
      sampleRate: null, completionTimer: null, interruptPromise: null,
      streamStarted: false, streamEnded, resolveStreamEnded,
      cancelled: false, cleaned: false, task: null, stopRequestedAt: null,
    };
    this.session = session;
    this.setSessionState(session, "preparing", "Preparing speech…");
    const task = this.coordinator.schedule("tts", async (lifecycle) => {
      try {
        await this.startSession(session, lifecycle);
        if (session.streamStarted) await session.streamEnded;
        lifecycle.throwIfCancelled();
      } finally {
        this.logTiming(session, "tts-service-task-returned");
      }
    });
    session.task = task;
    return task.promise.catch((error) => {
      if (!session.cancelled) throw error;
    });
  }

  public stop(reason: "user" | "system" = "system"): Promise<void> {
    if (this.session) {
      this.session.stopRequestedAt = Date.now();
      this.logTiming(this.session, reason === "user" ? "stop-pressed" : "stop-requested");
    }
    const session = this.detachSession();
    if (session?.task) this.uiDetachedTaskIds.add(session.task.id);
    this.setState({ ...initialState, inferenceBusy: this.isInferenceBlockingSpeechUi() });
    if (!session) return this.lifecycleChain;
    void session.task?.cancel();
    return this.enqueueLifecycle(() => this.cleanupSession(session));
  }

  public stopForBackground(): void { void this.stop(); }

  public async ensureReady(): Promise<void> {
    await this.coordinator.runExclusive("tts", () => this.ensureEngineReady());
  }

  private async ensureEngineReady(): Promise<void> {
    const model = await this.ttsModelService.getActiveModel();
    if (!model) return;
    const language = await this.ttsModelService.resolveLanguage(model, "en");
    if (!language) return;
    const key = `${model.getId()}:${language.lexiconLanguage ?? "single-language"}`;
    if (this.cachedEngine && this.cachedEngineKey === key) return;
    const previous = this.cachedEngine;
    this.cachedEngine = await createStreamingTTS({ modelPath: { type: "file", path: this.ttsModelService.resolveModelPath(model) }, modelType: model.getModelType() as TTSModelType, numThreads: 2 });
    this.cachedEngineKey = key;
    await previous?.destroy().catch(() => undefined);
  }

  private async startSession(session: SpeechSession, lifecycle: InferenceTaskContext): Promise<void> {
    try {
      await setAudioModeAsync({ allowsRecording: false, interruptionMode: "doNotMix", playsInSilentMode: true, shouldPlayInBackground: false });
      const model = await this.ttsModelService.getActiveModel();
      if (!this.isCurrent(session)) return;
      if (model === null) {
        await this.failStartingSession(session, "missing-model", "Download and activate a TTS model first.");
        return;
      }
      const languageConfiguration = await this.ttsModelService.resolveLanguage(model, session.requestedLanguage);
      if (!this.isCurrent(session)) return;
      if (languageConfiguration === null) {
        await this.failStartingSession(session, "unsupported-language", "The current TTS model does not support this language.");
        return;
      }
      const engineKey = `${model.getId()}:${languageConfiguration.lexiconLanguage ?? "single-language"}`;
      let engine = this.cachedEngine;
      if (engine === null || this.cachedEngineKey !== engineKey) {
        this.cachedEngine = null;
        this.cachedEngineKey = null;
        if (engine !== null) await engine.destroy().catch(() => undefined);
        engine = await createStreamingTTS({
          modelPath: { type: "file", path: this.ttsModelService.resolveModelPath(model) },
          modelType: model.getModelType() as TTSModelType,
          numThreads: 2,
        });
        this.cachedEngine = engine;
        this.cachedEngineKey = engineKey;
      }
      session.engine = engine;
      lifecycle.setInterrupt(() => session.interruptPromise ??= this.interruptSession(session));
      if (!this.isCurrent(session)) return;
      const sampleRate = await engine.getSampleRate();
      if (!this.isCurrent(session)) return;
      session.sampleRate = sampleRate;
      await pcmPlayback.start(session.playbackId, sampleRate);
      if (!this.isCurrent(session)) {
        pcmPlayback.stopImmediately();
        return;
      }
      session.streamStarted = true;
      session.controller = await engine.generateSpeechStream(session.text, { sid: 0, speed: 1 }, {
        onChunk: (chunk) => this.handleStreamChunk(session, chunk.samples, chunk.sampleRate),
        onEnd: (event) => {
          this.logTiming(session, "native-onEnd-fired", { cancelled: event.cancelled });
          session.resolveStreamEnded();
          if (!event.cancelled) void this.handleStreamEnd(session);
        },
        onError: (event) => {
          session.resolveStreamEnded();
          void this.failSession(session, "playback", event.message);
        },
      });
      // Stop may land during the library's listener-registration yield, before
      // native generation actually starts. Re-issue cancellation once startup
      // has crossed that boundary so a cancelled session cannot keep inferring.
      if (!this.isCurrent(session)) session.interruptPromise = this.interruptEngine(engine);
    } catch (error) {
      session.resolveStreamEnded();
      if (this.isCurrent(session)) {
        await this.failStartingSession(
          session,
          "playback",
          error instanceof Error ? error.message : "Unable to start speech playback.",
        );
      }
    }
  }

  private handleStreamChunk(session: SpeechSession, samples: number[], sampleRate: number): void {
    if (!this.isCurrent(session) || samples.length === 0 || session.engine === null) return;
    session.sampleRate = sampleRate;
    session.totalSamples += samples.length;
    if (session.playbackStartedAt === null) {
      session.playbackStartedAt = Date.now();
      this.setSessionState(session, "playing", "Playing");
    }
    session.writeChain = session.writeChain.then(async () => {
      if (this.isCurrent(session)) await pcmPlayback.write(session.playbackId, samples);
    }).catch((error) => {
      if (this.isCurrent(session)) void this.failSession(session, "playback", error instanceof Error ? error.message : "Speech playback failed.");
    });
  }

  private async handleStreamEnd(session: SpeechSession): Promise<void> {
    await session.writeChain.catch(() => undefined);
    if (!this.isCurrent(session)) return;
    // iOS queues PCM buffers, so retain the engine until the queued audio has drained.
    const durationMs = session.sampleRate ? (session.totalSamples / session.sampleRate) * 1000 : 0;
    const elapsedMs = session.playbackStartedAt === null ? 0 : Date.now() - session.playbackStartedAt;
    session.completionTimer = setTimeout(() => {
      session.completionTimer = null;
      void this.completeSession(session);
    }, Math.max(0, durationMs - elapsedMs + 100));
  }

  private completeSession(session: SpeechSession): Promise<void> {
    if (!this.isCurrent(session)) return Promise.resolve();
    pcmPlayback.stopImmediately();
    this.session = null;
    session.cancelled = true;
    this.setState({ ...initialState, inferenceBusy: this.coordinator.isBusy() });
    return this.enqueueLifecycle(() => this.cleanupSession(session));
  }

  private failSession(session: SpeechSession, code: SpeechPlaybackErrorCode, message: string): Promise<void> {
    if (!this.isCurrent(session)) return Promise.resolve();
    pcmPlayback.stopImmediately();
    this.session = null;
    session.cancelled = true;
    this.setError(session.id, session.label, code, message);
    return this.enqueueLifecycle(() => this.cleanupSession(session));
  }

  private async failStartingSession(
    session: SpeechSession,
    code: SpeechPlaybackErrorCode,
    message: string,
  ): Promise<void> {
    if (!this.isCurrent(session)) return;
    pcmPlayback.stopImmediately();
    this.session = null;
    session.cancelled = true;
    this.setError(session.id, session.label, code, message);
    await this.cleanupSession(session);
  }

  private detachSession(): SpeechSession | null {
    const session = this.session;
    if (session) {
      this.session = null;
      session.cancelled = true;
      // This synchronous native call is the audible Stop boundary. Synthesis
      // cancellation and lifecycle cleanup continue independently below.
      pcmPlayback.stopImmediately();
      this.logTiming(session, "pcm-playback-stopped");
      if (session.completionTimer !== null) clearTimeout(session.completionTimer);
      session.completionTimer = null;
      // Start one immediate native stop chain. Cleanup awaits this same promise
      // instead of issuing overlapping stop/release calls.
      session.interruptPromise = this.interruptSession(session);
    }
    return session;
  }

  private async cleanupSession(session: SpeechSession): Promise<void> {
    if (session.cleaned) return;
    session.cleaned = true;
    session.cancelled = true;
    if (session.completionTimer !== null) clearTimeout(session.completionTimer);
    session.completionTimer = null;
    const engine = session.engine;
    session.engine = null;
    if (engine !== null) {
      await (session.interruptPromise ?? this.interruptEngine(engine));
      // Native generation owns callbacks into the TTS engine. Destroying before
      // onEnd is a use-after-free even if cancelSpeechStream() has resolved.
      if (session.streamStarted) await session.streamEnded;
      await session.writeChain.catch(() => undefined);
      this.logTiming(session, "queued-pcm-writes-drained");
      session.controller?.unsubscribe();
      session.controller = null;
      if (engine !== this.cachedEngine) await engine.destroy().catch(() => undefined);
    }
  }

  private async interruptSession(session: SpeechSession): Promise<void> {
    const engine = session.engine;
    if (engine === null) return;
    this.logTiming(session, "cancelSpeechStream-called");
    await this.interruptEngine(engine);
    this.logTiming(session, "native-cancellation-received");
  }

  private async interruptEngine(engine: StreamingTtsEngine): Promise<void> {
    // Audible playback is owned and already stopped by pcmPlayback. Sherpa stays
    // responsible only for ending future synthesis callbacks and remains reusable.
    await engine.cancelSpeechStream().catch(() => undefined);
  }

  private enqueueLifecycle(operation: () => Promise<void>): Promise<void> {
    const result = this.lifecycleChain.then(operation, operation);
    this.lifecycleChain = result.catch(() => undefined);
    return result;
  }
  private isCurrent(session: SpeechSession): boolean { return this.session === session && !session.cancelled; }
  private isInferenceBlockingSpeechUi(): boolean {
    return this.coordinator.getSnapshot().tasks.some((task) =>
      (task.status === "queued" || task.status === "running") && !this.uiDetachedTaskIds.has(task.id),
    );
  }
  private logTiming(session: SpeechSession, event: string, details: Record<string, unknown> = {}): void {
    const now = Date.now();
    console.info("[TTS_TIMING]", JSON.stringify({
      event,
      playbackId: session.playbackId,
      taskId: session.task?.id ?? null,
      timestamp: now,
      sinceStopMs: session.stopRequestedAt === null ? null : now - session.stopRequestedAt,
      ...details,
    }));
  }
  private setSessionState(session: SpeechSession, phase: SpeechPlaybackPhase, message: string, errorCode: SpeechPlaybackErrorCode | null = null): void {
    if (!this.isCurrent(session)) return;
    this.setState({ phase, speechId: session.id, label: session.label, message, errorCode, inferenceBusy: this.coordinator.isBusy() });
  }
  private setError(id: string, label: string, code: SpeechPlaybackErrorCode, message: string): void {
    this.setState({ phase: "error", speechId: id, label, message, errorCode: code, inferenceBusy: this.coordinator.isBusy() });
  }
  private setState(state: SpeechPlaybackState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
