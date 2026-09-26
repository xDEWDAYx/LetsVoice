import { Entity } from '@shared/entities/Entity';

export class TodoItem extends Entity {
  private title: string;

  private dateString: string; // YYYY-MM-DD format

  private completed: boolean;

  private associatedNoteId?: number;

  private noteTitle?: string;

  public constructor(
    id: number,
    title: string,
    dateString: string,
    completed?: boolean,
    associatedNoteId?: number,
    noteTitle?: string,
  ) {
    super(id); // Follow DRY by leveraging existing Entity superclass for ID management
    this.title = title;
    this.dateString = dateString;
    this.completed = completed ?? false;
    this.associatedNoteId = associatedNoteId;
    this.noteTitle = noteTitle;
  }

  public getTitle(): string {
    return this.title;
  }

  public getDateString(): string {
    return this.dateString;
  }

  public isCompleted(): boolean {
    return this.completed;
  }

  public toggleCompleted(): void {
    this.completed = !this.completed;
  }

  public getAssociatedNoteId(): number | undefined {
    return this.associatedNoteId;
  }

  public getNoteTitle(): string | undefined {
    return this.noteTitle;
  }

  public isOnDate(targetDateString: string): boolean {
    if (!this.dateString) return false;
    const normalize = (d: string) => {
      const parts = d.split('-');
      if (parts.length === 3) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      return d;
    };
    return normalize(this.dateString) === targetDateString;
  }
}
