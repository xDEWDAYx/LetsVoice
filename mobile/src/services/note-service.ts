import type { NoteCategory } from "@/constants/note-categories";
import { Note } from "@/domain/note/note";
import { NoteNotFoundError } from "@/errors/note-not-found-error";
import { ValidationError } from "@/errors/validation-error";
import { NoteRepository, type NoteSearchCorpus } from "@/repositories/note-repository";
import { WorkspaceRepository } from "@/repositories/workspace-repository";
import { NoteClassificationService, type NoteCategoryChange } from "@/services/note-classification-service";
import { searchNoteCorpus, searchNoteResourceCorpus, type NoteSearchResult } from "@/services/note-fuzzy-search";

export class NoteService {
  private readonly changeListeners = new Set<() => void>();
  private searchCorpus: NoteSearchCorpus[] | null = null;
  private searchCorpusLoad: Promise<NoteSearchCorpus[]> | null = null;
  private searchCorpusRevision = 0;
  public constructor(
    private readonly noteRepository: NoteRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly classificationService?: NoteClassificationService,
  ) {}

  public async getNotesByWorkspace(workspaceId: string): Promise<Note[]> {
    if (workspaceId.trim().length === 0) {
      throw new ValidationError("Workspace id cannot be empty.");
    }

    return this.noteRepository.findByWorkspaceId(workspaceId);
  }

  public async getAllNotes(): Promise<Note[]> {
    return this.noteRepository.findAll();
  }

  public async getNote(id: string): Promise<Note | null> {
    return this.noteRepository.findById(id);
  }

  public async getTranscriptNotes(): Promise<Note[]> {
    return this.noteRepository.findAllWithTranscript();
  }

  public async searchNotes(query: string): Promise<Note[]> {
    return (await this.searchNoteResults(query)).map((result) => result.note);
  }

  public async searchNoteResults(query: string): Promise<NoteSearchResult[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) return [];
    return searchNoteCorpus(await this.getSearchCorpus(), normalizedQuery);
  }

  public async searchNoteResourceResults(query: string): Promise<NoteSearchResult[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) return [];
    return searchNoteResourceCorpus(await this.getSearchCorpus(), normalizedQuery);
  }

  public invalidateSearchIndex(): void {
    this.searchCorpusRevision += 1;
    this.searchCorpus = null;
    this.searchCorpusLoad = null;
  }

  public notifyExternalContentChange(): void {
    this.publishChange();
  }

  public async renameNote(id: string, name: string): Promise<void> {
    const note = await this.getNoteOrThrow(id);
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      throw new ValidationError("Note title cannot be empty.");
    }
    note.rename(normalizedName);
    await this.noteRepository.update(note);
    this.publishChange();
  }

  public async setNotePinned(id: string, isPinned: boolean): Promise<void> {
    const note = await this.getNoteOrThrow(id);

    if (note.getIsPinned() === isPinned) return;

    if (isPinned) {
      note.pin();
    } else {
      note.unpin();
    }

    await this.noteRepository.update(note);
    this.publishChange();
  }

  public async setNotesPinned(ids: readonly string[], isPinned: boolean): Promise<void> {
    await this.noteRepository.setPinnedMany(ids, isPinned);
    this.publishChange();
  }

  public async moveNote(id: string, workspaceId: string): Promise<void> {
    const note = await this.getNoteOrThrow(id);
    const normalizedWorkspaceId = workspaceId.trim();
    if (normalizedWorkspaceId.length === 0) {
      throw new ValidationError("Target workspace cannot be empty.");
    }
    if (note.getWorkspaceId() === normalizedWorkspaceId) {
      throw new ValidationError("Note is already in this workspace.");
    }
    if ((await this.workspaceRepository.findById(normalizedWorkspaceId)) === null) {
      throw new ValidationError("Target workspace does not exist.");
    }
    note.moveToWorkspace(normalizedWorkspaceId);
    await this.noteRepository.update(note);
    this.publishChange();
  }

  public async moveNotes(ids: readonly string[], workspaceId: string): Promise<void> {
    const normalizedWorkspaceId = workspaceId.trim();
    if (!normalizedWorkspaceId) throw new ValidationError("Target workspace cannot be empty.");
    await this.noteRepository.moveMany(ids, normalizedWorkspaceId);
    this.publishChange();
  }

  public async createNote(
    workspaceId: string,
    name: string | null,
    transcript: string,
    audioRelativePath: string | null = null,
  ): Promise<Note> {
    const normalizedWorkspaceId = workspaceId.trim();
    const normalizedTranscript = transcript.trim();

    if (normalizedWorkspaceId.length === 0) {
      throw new ValidationError("Workspace id cannot be empty.");
    }

    if (normalizedTranscript.length === 0) {
      throw new ValidationError("Note transcript cannot be empty.");
    }

    const normalizedName = name?.trim() || null;
    const now = new Date().toISOString();
    const note = new Note(
      this.createId(),
      normalizedWorkspaceId,
      normalizedName,
      audioRelativePath,
      normalizedTranscript,
      false,
      null,
      now,
      now,
    );

    await this.noteRepository.create(note);
    this.publishChange();
    void this.classificationService?.classifyNote(note.getId());
    return note;
  }

  public async updateNote(note: Note): Promise<void> {
    if (note.getTranscript().trim().length === 0) {
      throw new ValidationError("Note transcript cannot be empty.");
    }

    await this.noteRepository.update(note);
    this.publishChange();
    void this.classificationService?.classifyNote(note.getId());
  }

  public async deleteNote(id: string): Promise<void> {
    await this.getNoteOrThrow(id);
    await this.noteRepository.trashMany([id]);
    this.publishChange();
  }

  public async trashNotes(ids: readonly string[]): Promise<void> {
    await this.noteRepository.trashMany(ids);
    this.publishChange();
  }

  public async restoreNotes(ids: readonly string[]): Promise<void> {
    await this.noteRepository.restoreMany(ids);
    this.publishChange();
  }

  public async setCategory(id: string, category: NoteCategory): Promise<void> {
    await this.getNoteOrThrow(id);
    await this.noteRepository.updateCategory(id, category);
    this.publishChange();
  }

  public async classifyNote(id: string): Promise<NoteCategory | null> {
    await this.getNoteOrThrow(id);
    return (await this.classificationService?.classifyNote(id)) ?? null;
  }

  public subscribeToCategoryChanges(listener: (change: NoteCategoryChange) => void): () => void {
    return this.classificationService?.subscribe(listener) ?? (() => undefined);
  }

  public subscribeToChanges(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private publishChange(): void {
    this.invalidateSearchIndex();
    this.changeListeners.forEach((listener) => listener());
  }

  private getSearchCorpus(): Promise<NoteSearchCorpus[]> {
    if (this.searchCorpus) return Promise.resolve(this.searchCorpus);
    if (this.searchCorpusLoad) return this.searchCorpusLoad;
    const revision = this.searchCorpusRevision;
    const load = this.noteRepository.getSearchCorpus().then((corpus) => {
      if (revision === this.searchCorpusRevision) this.searchCorpus = corpus;
      return corpus;
    }).finally(() => {
      if (this.searchCorpusLoad === load) this.searchCorpusLoad = null;
    });
    this.searchCorpusLoad = load;
    return load;
  }

  private async getNoteOrThrow(id: string): Promise<Note> {
    const note = await this.noteRepository.findById(id);
    if (note === null) throw new NoteNotFoundError(id);
    return note;
  }

  private createId(): string {
    return `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
