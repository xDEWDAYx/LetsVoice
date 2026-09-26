import { Entity } from './Entity';

export class AIMessage extends Entity {
  private conversationId: number;

  private role: string;

  private content: string;

  private createdAt: Date;

  public constructor(
    id: number,
    conversationId: number,
    role: string,
    content: string,
    createdAt: Date,
  ) {
    super(id);

    this.conversationId = conversationId;
    this.role = role;
    this.content = content;
    this.createdAt = createdAt;
  }

  public getConversationId(): number {
    return this.conversationId;
  }

  public setConversationId(conversationId: number): void {
    this.conversationId = conversationId;
  }

  public getRole(): string {
    return this.role;
  }

  public setRole(role: string): void {
    this.role = role;
  }

  public getContent(): string {
    return this.content;
  }

  public setContent(content: string): void {
    this.content = content;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }
}
