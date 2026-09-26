import { Entity } from './Entity';

export class Note extends Entity {
  private workspaceId: number | null;

  private name: string | null;

  private audioRelativePath: string | null;

  private transcript: string;

  private pinned: boolean;

  private pinnedAt: Date | null;

  private createdAt: Date;

  private updatedAt: Date;

  public constructor(
    id: number,
    workspaceId: number | null,
    name: string | null,
    audioRelativePath: string | null,
    transcript: string,
    pinned: boolean,
    pinnedAt: Date | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id);

    this.workspaceId = workspaceId;
    this.name = name;
    this.audioRelativePath = audioRelativePath;
    this.transcript = transcript;
    this.pinned = pinned;
    this.pinnedAt = pinnedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  public getWorkspaceId(): number | null {
    return this.workspaceId;
  }

  public setWorkspaceId(workspaceId: number | null): void {
    this.workspaceId = workspaceId;
  }

  public getName(): string | null {
    return this.name;
  }

  public setName(name: string | null): void {
    this.name = name;
  }

  public getAudioRelativePath(): string | null {
    return this.audioRelativePath;
  }

  public setAudioRelativePath(audioRelativePath: string | null): void {
    this.audioRelativePath = audioRelativePath;
  }

  public getTranscript(): string {
    return this.transcript;
  }

  public setTranscript(transcript: string): void {
    this.transcript = transcript;
  }

  public isPinned(): boolean {
    return this.pinned;
  }

  public setPinned(pinned: boolean): void {
    this.pinned = pinned;
  }

  public getPinnedAt(): Date | null {
    return this.pinnedAt;
  }

  public setPinnedAt(pinnedAt: Date | null): void {
    this.pinnedAt = pinnedAt;
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
