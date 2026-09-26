export type InferenceAbortReason = "timeout" | "cancelled";

export class InferenceDeadline {
  public readonly durationMs: number;
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private abortReason: InferenceAbortReason | null = null;

  public constructor(durationMs: number) {
    this.durationMs = durationMs;
    this.timer = setTimeout(() => this.abort("timeout"), durationMs);
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public get reason(): InferenceAbortReason | null {
    return this.abortReason;
  }

  public abort(reason: InferenceAbortReason): void {
    if (this.controller.signal.aborted) return;
    this.abortReason = reason;
    this.controller.abort();
  }

  public throwIfAborted(createError: (reason: InferenceAbortReason) => Error): void {
    if (this.abortReason) throw createError(this.abortReason);
  }

  public dispose(): void {
    clearTimeout(this.timer);
  }
}
