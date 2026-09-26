export class NoteNotFoundError extends Error {
  public constructor(noteId: string) {
    super(`Note ${noteId} was not found.`);
    this.name = "NoteNotFoundError";
  }
}
