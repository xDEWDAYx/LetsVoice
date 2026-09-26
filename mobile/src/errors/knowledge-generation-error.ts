export type KnowledgeGenerationErrorCode = "empty-transcript" | "model-unavailable" | "model-file-missing" | "invalid-output" | "timeout" | "cancelled" | "generation-failed";

export class KnowledgeGenerationError extends Error {
  public constructor(public readonly code: KnowledgeGenerationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KnowledgeGenerationError";
  }
}
