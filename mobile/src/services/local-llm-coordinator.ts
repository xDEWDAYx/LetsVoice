export type LocalLlmOperation =
  | "core-insights"
  | "knowledge"
  | "knowledge-template"
  | "note-classification"
  | "note-title"
  | "ask-ai"
  | "translation"
  | "model-management";
export type LocalInferenceOperation = LocalLlmOperation | "live-stt" | "file-stt" | "tts" | "transcription";
type IdleResourceOwner = LocalInferenceOperation | "shared-llm" | "stt-runtime" | "tts-runtime";

export type InferenceTaskStatus = "queued" | "running" | "completed" | "cancelled" | "failed";
export type InferenceTaskSnapshot = {
  id: number;
  operation: LocalInferenceOperation;
  status: InferenceTaskStatus;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};
export type LocalInferenceSnapshot = {
  activeOperation: LocalInferenceOperation | null;
  pendingCount: number;
  tasks: readonly InferenceTaskSnapshot[];
};
export type InferenceTaskContext = {
  signal: AbortSignal;
  throwIfCancelled(): void;
  setInterrupt(interrupt: (() => void | Promise<void>) | null): void;
};
export type InferenceTask<T> = {
  id: number;
  promise: Promise<T>;
  cancel(): Promise<void>;
  getSnapshot(): InferenceTaskSnapshot;
};

type AcquireOptions = { signal?: AbortSignal };
type QueueItem<T> = {
  snapshot: InferenceTaskSnapshot;
  controller: AbortController;
  run: (context: InferenceTaskContext) => Promise<T>;
  interrupt: (() => void | Promise<void>) | null;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export class InferenceCancelledError extends Error {
  public constructor() {
    super("Inference task was cancelled.");
    this.name = "InferenceCancelledError";
  }
}

function cancellationError(): Error {
  const error = new Error("The queued local operation was cancelled.");
  error.name = "AbortError";
  return error;
}

/** Process-wide FIFO lifecycle and scheduling layer for every native inference engine. */
export class LocalLlmCoordinator {
  private readonly queue: QueueItem<unknown>[] = [];
  private active: QueueItem<unknown> | null = null;
  private readonly tasks = new Map<number, InferenceTaskSnapshot>();
  private readonly idleCleanups = new Map<IdleResourceOwner, {
    cleanup: () => Promise<void>;
    compatibleOperations: ReadonlySet<LocalInferenceOperation>;
  }>();
  private readonly listeners = new Set<(snapshot: LocalInferenceSnapshot) => void>();
  private stopSpeechPlayback: (() => Promise<void>) | null = null;
  private nextJobId = 1;

  public getActiveOperation(): LocalInferenceOperation | null {
    return this.active?.snapshot.operation ?? null;
  }

  public getSnapshot(): LocalInferenceSnapshot {
    const snapshot = {
      activeOperation: this.getActiveOperation(),
      pendingCount: this.queue.length + (this.active ? 1 : 0),
    } as LocalInferenceSnapshot;
    // Keep the original enumerable snapshot contract while exposing jackAndr's
    // task diagnostics to direct consumers.
    Object.defineProperty(snapshot, "tasks", {
      enumerable: false,
      value: [...this.tasks.values()].map((task) => ({ ...task })),
    });
    return snapshot;
  }

  public isBusy(): boolean {
    return this.active !== null || this.queue.length > 0;
  }

  public subscribe(listener: (snapshot: LocalInferenceSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  public registerSpeechPlaybackStopper(stop: () => Promise<void>): () => void {
    this.stopSpeechPlayback = stop;
    return () => {
      if (this.stopSpeechPlayback === stop) this.stopSpeechPlayback = null;
    };
  }

  public registerIdleCleanup(
    owner: IdleResourceOwner,
    cleanup: () => Promise<void>,
    compatibleOperations: readonly LocalInferenceOperation[] = [owner as LocalInferenceOperation],
  ): void {
    this.idleCleanups.set(owner, { cleanup, compatibleOperations: new Set(compatibleOperations) });
  }

  public runExclusive<T>(
    operation: LocalInferenceOperation,
    task: () => Promise<T>,
    options: AcquireOptions = {},
  ): Promise<T> {
    const scheduled = this.schedule(operation, () => task());
    const signal = options.signal;
    if (!signal) return scheduled.promise;

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => {
        finish(() => {
          void scheduled.cancel();
          reject(cancellationError());
        });
      };
      signal.addEventListener("abort", abort, { once: true });
      scheduled.promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(signal.aborted ? cancellationError() : error)),
      );
      if (signal.aborted) abort();
    });
  }

  public schedule<T>(
    operation: LocalInferenceOperation,
    run: (context: InferenceTaskContext) => Promise<T>,
  ): InferenceTask<T> {
    const id = this.nextJobId++;
    const snapshot: InferenceTaskSnapshot = {
      id,
      operation,
      status: "queued",
      queuedAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };
    const controller = new AbortController();
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const item: QueueItem<T> = { snapshot, controller, run, interrupt: null, resolve, reject };
    this.tasks.set(id, snapshot);
    this.queue.push(item as QueueItem<unknown>);
    console.info("[LocalInference] Operation queued", {
      jobId: id,
      operation,
      queuedBehind: this.active?.snapshot.operation ?? this.queue.at(-2)?.snapshot.operation ?? null,
      pendingCount: this.queue.length + (this.active ? 1 : 0),
    });
    this.publish();
    void this.drain();
    return { id, promise, cancel: () => this.cancel(id), getSnapshot: () => ({ ...snapshot }) };
  }

  /** Compatibility API for live STT, whose slot spans start through finish. */
  public async acquire(
    operation: LocalInferenceOperation,
    options: AcquireOptions = {},
  ): Promise<() => void> {
    if (options.signal?.aborted) throw cancellationError();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = this.schedule(operation, async (context) => {
      context.setInterrupt(release);
      await held;
    });
    const abort = () => { void task.cancel(); };
    options.signal?.addEventListener("abort", abort, { once: true });
    void task.promise.catch(() => undefined);

    while (task.getSnapshot().status === "queued") {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (task.getSnapshot().status !== "running") {
      options.signal?.removeEventListener("abort", abort);
      throw options.signal?.aborted ? cancellationError() : new InferenceCancelledError();
    }
    return () => {
      options.signal?.removeEventListener("abort", abort);
      release();
    };
  }

  public async cancel(id: number): Promise<void> {
    const index = this.queue.findIndex((item) => item.snapshot.id === id);
    if (index >= 0) {
      const [item] = this.queue.splice(index, 1);
      item.controller.abort();
      this.finish(item, "cancelled");
      this.tasks.delete(item.snapshot.id);
      item.reject(new InferenceCancelledError());
      this.publish();
      return;
    }
    if (this.active?.snapshot.id !== id) return;
    this.active.controller.abort();
    const interrupt = this.active.interrupt;
    if (interrupt) {
      try {
        await interrupt();
      } catch {
        // Cancellation remains authoritative even when a native interrupt fails.
      }
    }
  }

  private async drain(): Promise<void> {
    if (this.active !== null) return;
    const item = this.queue.shift();
    if (!item) {
      this.publish();
      return;
    }
    this.active = item;
    item.snapshot.status = "running";
    item.snapshot.startedAt = Date.now();
    this.publish();
    const context: InferenceTaskContext = {
      signal: item.controller.signal,
      throwIfCancelled: () => {
        if (item.controller.signal.aborted) throw new InferenceCancelledError();
      },
      setInterrupt: (interrupt) => {
        item.interrupt = interrupt;
      },
    };
    try {
      if (item.snapshot.operation !== "tts") {
        try {
          await this.stopSpeechPlayback?.();
        } catch (error) {
          console.warn("[LocalInference] Speech playback cleanup failed; continuing with queued work.", { error });
        }
      }
      context.throwIfCancelled();
      for (const [owner, resource] of this.idleCleanups) {
        if (resource.compatibleOperations.has(item.snapshot.operation)) continue;
        const cleanupStartedAt = Date.now();
        console.info("[LocalInference] Releasing idle resources", {
          jobId: item.snapshot.id,
          operation: item.snapshot.operation,
          resourceOwner: owner,
        });
        await resource.cleanup();
        console.info("[LocalInference] Idle resources released", {
          jobId: item.snapshot.id,
          operation: item.snapshot.operation,
          resourceOwner: owner,
          durationMs: Date.now() - cleanupStartedAt,
        });
        context.throwIfCancelled();
      }
      const value = await item.run(context);
      context.throwIfCancelled();
      this.finish(item, "completed");
      item.resolve(value);
    } catch (error) {
      const cancelled = item.controller.signal.aborted || error instanceof InferenceCancelledError;
      this.finish(item, cancelled ? "cancelled" : "failed");
      item.reject(cancelled ? new InferenceCancelledError() : error);
    } finally {
      item.interrupt = null;
      this.active = null;
      this.tasks.delete(item.snapshot.id);
      if (item.snapshot.operation === "tts") {
        console.info("[TTS_TIMING]", JSON.stringify({
          event: "scheduler-slot-released",
          taskId: item.snapshot.id,
          timestamp: Date.now(),
        }));
      }
      this.publish();
      void this.drain();
    }
  }

  private finish(
    item: QueueItem<unknown>,
    status: Extract<InferenceTaskStatus, "completed" | "cancelled" | "failed">,
  ): void {
    item.snapshot.status = status;
    item.snapshot.finishedAt = Date.now();
  }

  private publish(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
