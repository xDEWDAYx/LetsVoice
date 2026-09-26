export class LlmModelNotFoundError extends Error {
  public constructor(id: string) {
    super(`LLM model not found: ${id}`);
    this.name = "LlmModelNotFoundError";
  }
}
