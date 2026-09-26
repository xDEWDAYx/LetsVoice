import { Entity } from './Entity';

export class AIConversation extends Entity {
  private name: string;

  private createdAt: Date;

  private updatedAt: Date;

  public constructor(
    id: number,
    name: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id);

    this.name = name;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getUpdatedAt(): Date {
    return this.updatedAt;
  }

  public setUpdatedAt(updatedAt: Date): void {
    this.updatedAt = updatedAt;
  }
}
