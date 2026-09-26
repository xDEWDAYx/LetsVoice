import type { NoteCategory } from "@/constants/note-categories";

export class Note {
  private readonly id: string;
  private workspaceId: string;
  private name: string | null;
  private readonly audioRelativePath: string | null;
  private transcript: string;
  private isPinned: boolean;
  private pinnedAt: string | null;
  private readonly createdAt: string;
  private updatedAt: string;
  private category: NoteCategory;
  private readonly trashedAt: string | null;

  public constructor(
    id: string,
    workspaceId: string,
    name: string | null,
    audioRelativePath: string | null,
    transcript: string,
    isPinned: boolean,
    pinnedAt: string | null,
    createdAt: string,
    updatedAt: string,
    category: NoteCategory = "uncategorized",
    trashedAt: string | null = null,
  ) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.name = name;
    this.audioRelativePath = audioRelativePath;
    this.transcript = transcript;
    this.isPinned = isPinned;
    this.pinnedAt = pinnedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.category = category;
    this.trashedAt = trashedAt;
  }

  public getId(): string {
    return this.id;
  }

  public getWorkspaceId(): string {
    return this.workspaceId;
  }

  public getName(): string | null {
    return this.name;
  }

  public getAudioRelativePath(): string | null {
    return this.audioRelativePath;
  }

  public getTranscript(): string {
    return this.transcript;
  }

  public getIsPinned(): boolean {
    return this.isPinned;
  }

  public getPinnedAt(): string | null {
    return this.pinnedAt;
  }

  public getCreatedAt(): string {
    return this.createdAt;
  }

  public getUpdatedAt(): string {
    return this.updatedAt;
  }

  public getCategory(): NoteCategory {
    return this.category;
  }

  public getTrashedAt(): string | null {
    return this.trashedAt;
  }

  public rename(name: string | null): void {
    this.name = name;
    this.updatedAt = new Date().toISOString();
  }

  public moveToWorkspace(workspaceId: string): void {
    this.workspaceId = workspaceId;
    this.updatedAt = new Date().toISOString();
  }

  public updateTranscript(transcript: string): void {
    this.transcript = transcript;
    this.updatedAt = new Date().toISOString();
  }

  public setCategory(category: NoteCategory): void {
    this.category = category;
    this.updatedAt = new Date().toISOString();
  }

  public pin(): void {
    this.isPinned = true;
    this.pinnedAt = new Date().toISOString();
    this.updatedAt = this.pinnedAt;
  }

  public unpin(): void {
    this.isPinned = false;
    this.pinnedAt = null;
    this.updatedAt = new Date().toISOString();
  }
}
