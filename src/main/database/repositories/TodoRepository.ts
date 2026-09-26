import Database from 'better-sqlite3';
import { DatabaseManager } from '../DatabaseManager';

export interface TodoData {
  id?: number;
  noteId: number;
  title: string;
  dateString: string;
  isCompleted: boolean;
  /** 置顶的排在最前；浮窗里手动置顶用。 */
  isPinned?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class TodoRepository {
  private database: Database.Database;

  constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public createTodo(todo: TodoData): TodoData {
    const now = new Date().toISOString();

    const stmt = this.database.prepare(`
            INSERT INTO todos (note_id, title, date_string, is_completed, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

    const info = stmt.run(
      todo.noteId,
      todo.title,
      todo.dateString,
      todo.isCompleted ? 1 : 0,
      now,
      now,
    );

    return {
      ...todo,
      id: info.lastInsertRowid as number,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  public getTodosByNoteId(noteId: number): TodoData[] {
    const stmt = this.database.prepare(`
            SELECT todos.* FROM todos
            JOIN notes ON notes.id = todos.note_id
            JOIN workspaces ON workspaces.id = notes.workspace_id
            WHERE todos.note_id = ?
              AND notes.trashed_at IS NULL
              AND workspaces.trashed_at IS NULL
            ORDER BY todos.created_at ASC
        `);

    const rows = stmt.all(noteId) as any[];
    return rows.map((row) => TodoRepository.mapRowToTodoData(row));
  }

  public getAllTodos(): TodoData[] {
    const stmt = this.database.prepare(`
            SELECT todos.* FROM todos
            JOIN notes ON notes.id = todos.note_id
            JOIN workspaces ON workspaces.id = notes.workspace_id
            WHERE notes.trashed_at IS NULL
              AND workspaces.trashed_at IS NULL
            ORDER BY todos.created_at DESC
        `);

    const rows = stmt.all() as any[];
    return rows.map((row) => TodoRepository.mapRowToTodoData(row));
  }

  /** 置顶 / 取消置顶。 */
  public updateTodoPinned(id: number, isPinned: boolean): void {
    const stmt = this.database.prepare(`
            UPDATE todos SET is_pinned = ?, updated_at = ? WHERE id = ?
        `);
    stmt.run(isPinned ? 1 : 0, new Date().toISOString(), id);
  }

  public updateTodoStatus(id: number, isCompleted: boolean): void {
    const now = new Date().toISOString();

    const stmt = this.database.prepare(`
            UPDATE todos SET is_completed = ?, updated_at = ? WHERE id = ?
        `);

    stmt.run(isCompleted ? 1 : 0, now, id);
  }

  public deleteTodosByNoteId(noteId: number): void {
    const stmt = this.database.prepare(`
            DELETE FROM todos WHERE note_id = ?
        `);
    stmt.run(noteId);
  }

  private static mapRowToTodoData(row: any): TodoData {
    return {
      id: row.id,
      noteId: row.note_id,
      isPinned: row.is_pinned === 1,
      title: row.title,
      dateString: row.date_string,
      isCompleted: row.is_completed === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
