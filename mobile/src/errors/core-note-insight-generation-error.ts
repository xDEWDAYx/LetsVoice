export type CoreNoteInsightGenerationErrorCode =
  | "empty-transcript"
  | "model-unavailable"
  | "model-file-missing"
  | "invalid-output"
  | "timeout"
  | "cancelled"
  | "generation-failed";

export class CoreNoteInsightGenerationError extends Error {
  public constructor(
    public readonly code: CoreNoteInsightGenerationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CoreNoteInsightGenerationError";
  }
}
