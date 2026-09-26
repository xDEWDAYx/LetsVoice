import { DashboardNoteItem } from './DashboardNoteItem';
import { TodoItem } from './TodoItem';
import { DashboardTimeUtil } from './DashboardTimeUtil';

export class DashboardStatistics {
  private notes: DashboardNoteItem[];

  private todos: TodoItem[];

  public constructor(notes: DashboardNoteItem[], todos: TodoItem[]) {
    this.notes = notes;
    this.todos = todos;
  }

  public getTotalNotesCount(): number {
    return this.notes.length;
  }

  public getPinnedNotesCount(): number {
    return this.notes.filter((n) => n.isPinned()).length;
  }

  public getTotalTranscribedWordCount(): number {
    return this.notes.reduce((total, n) => {
      const text = n.getTranscript() || '';
      return total + text.length;
    }, 0);
  }

  /**
   * Follows DRY principle by reusing hasTodoForNote to ensure the dashboard card count
   * exactly matches the filtered notes table count.
   */
  public getPendingTodosCount(): number {
    return this.notes.filter((n) => this.hasTodoForNote(n.getId(), true))
      .length;
  }

  public getFormattedTotalDuration(): string {
    const totalSecs = this.notes.reduce(
      (total, n) => total + n.getDurationSeconds(),
      0,
    );
    return DashboardTimeUtil.formatDuration(totalSecs);
  }

  public hasTodoForNote(noteId: number, onlyPending: boolean = true): boolean {
    return this.todos.some((t) => {
      if (onlyPending && t.isCompleted()) return false;
      return t.getAssociatedNoteId() === noteId;
    });
  }

  public getRecentNotesCount(): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return this.notes.filter((n) => n.getCreatedAt() >= oneWeekAgo).length;
  }

  public getRecentTranscribedWordCount(): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return this.notes
      .filter((n) => n.getCreatedAt() >= oneWeekAgo)
      .reduce((total, n) => total + (n.getTranscript() || '').length, 0);
  }
}
