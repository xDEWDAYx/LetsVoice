export type AiMessageRole = "user" | "assistant";

export class AiMessage {
  private readonly id: string;
  private readonly conversationId: string;
  private readonly role: AiMessageRole;
  private readonly content: string;
  private readonly createdAt: string;

  public constructor(
    id: string,
    conversationId: string,
    role: AiMessageRole,
    content: string,
    createdAt: string,
  ) {
    this.id = id;
    this.conversationId = conversationId;
    this.role = role;
    this.content = content;
    this.createdAt = createdAt;
  }

  public getId(): string {
    return this.id;
  }

  public getConversationId(): string {
    return this.conversationId;
  }

  public getRole(): AiMessageRole {
    return this.role;
  }

  public getContent(): string {
    return this.content;
  }

  public getCreatedAt(): string {
    return this.createdAt;
  }
}
