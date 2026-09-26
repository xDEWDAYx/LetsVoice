export class AiConversation {
  private readonly id: string;
  private name: string;
  private readonly createdAt: string;
  private updatedAt: string;
  private readonly trashedAt: string | null;

  public constructor(
    id: string,
    name: string,
    createdAt: string,
    updatedAt: string,
    trashedAt: string | null = null,
  ) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.trashedAt = trashedAt;
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getCreatedAt(): string {
    return this.createdAt;
  }

  public getUpdatedAt(): string {
    return this.updatedAt;
  }

  public getTrashedAt(): string | null {
    return this.trashedAt;
  }

  public touch(): void {
    this.updatedAt = new Date().toISOString();
  }
}
