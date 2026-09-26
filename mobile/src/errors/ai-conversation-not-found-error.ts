export class AiConversationNotFoundError extends Error {
  public constructor(id: string) {
    super(`AI conversation not found: ${id}`);
    this.name = "AiConversationNotFoundError";
  }
}
