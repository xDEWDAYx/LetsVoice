import Database from 'better-sqlite3';

import { Note } from '@shared/entities/Note';
import { Repository } from './Repository';
import { DatabaseManager } from '../DatabaseManager';

// 保留命名导出，与其余 Repository 的导入方式一致。
export class NoteRepository implements Repository<Note> {
  private database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public create(entity: Note): number {
    const statement = this.database.prepare(`
            INSERT INTO notes (
                workspace_id,
                name,
                audio_relative_path,
                transcript,
                is_pinned,
                pinned_at,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

    const result = statement.run(
      entity.getWorkspaceId(),
      entity.getName(),
      entity.getAudioRelativePath(),
      entity.getTranscript(),
      entity.isPinned() ? 1 : 0,
      entity.getPinnedAt() ? entity.getPinnedAt()?.toISOString() : null,
      entity.getCreatedAt().toISOString(),
      entity.getUpdatedAt().toISOString(),
    );

    // notes.id 由 SQLite 生成，调用方使用返回值继续读取或关联笔记。
    return Number(result.lastInsertRowid);
  }

  public findById(id: number): Note | null {
    const statement = this.database.prepare(`
            SELECT *
            FROM notes
            WHERE id = ? AND trashed_at IS NULL
        `);

    const row = statement.get(id) as any;

    if (row === undefined) {
      return null;
    }

    return NoteRepository.toNote(row);
  }

  public findAllByWorkspace(workspaceId: number): Note[] {
    const statement = this.database.prepare(`
            SELECT *
            FROM notes
            WHERE workspace_id = ? AND trashed_at IS NULL
            ORDER BY updated_at DESC
        `);

    const rows = statement.all(workspaceId) as any[];

    return rows.map((row) => NoteRepository.toNote(row));
  }

  public findAll(): Note[] {
    const statement = this.database.prepare(`
            SELECT notes.*
            FROM notes
            JOIN workspaces ON workspaces.id = notes.workspace_id
            WHERE notes.trashed_at IS NULL
              AND workspaces.trashed_at IS NULL
            ORDER BY notes.updated_at DESC
        `);
    const rows = statement.all() as any[];

    return rows.map((row) => NoteRepository.toNote(row));
  }

  public update(entity: Note): boolean {
    const statement = this.database.prepare(`
            UPDATE notes
            SET
                workspace_id = ?,
                name = ?,
                audio_relative_path = ?,
                transcript = ?,
                is_pinned = ?,
                pinned_at = ?,
                updated_at = ?
            WHERE id = ? AND trashed_at IS NULL
        `);

    const result = statement.run(
      entity.getWorkspaceId(),
      entity.getName(),
      entity.getAudioRelativePath(),
      entity.getTranscript(),
      entity.isPinned() ? 1 : 0,
      entity.getPinnedAt() ? entity.getPinnedAt()?.toISOString() : null,
      entity.getUpdatedAt().toISOString(),
      entity.getId(),
    );

    return result.changes > 0;
  }

  public deleteById(id: number): boolean {
    const statement = this.database.prepare(`
            UPDATE notes
            SET trashed_at = ?
            WHERE id = ? AND trashed_at IS NULL
        `);

    const result = statement.run(new Date().toISOString(), id);

    return result.changes > 0;
  }

  public existsById(id: number): boolean {
    const statement = this.database.prepare(`
            SELECT 1
            FROM notes
            JOIN workspaces ON workspaces.id = notes.workspace_id
            WHERE notes.id = ?
              AND notes.trashed_at IS NULL
              AND workspaces.trashed_at IS NULL
            LIMIT 1
        `);

    return statement.get(id) !== undefined;
  }

  /**
   * 写入笔记类型。分类由模型在提取待办之后产出，和笔记内容分开更新，
   * 不走 update()——那会把整行一起覆盖，可能盖掉并发的编辑。
   * updated_at 也刻意不动：分类不是用户改动，不该让笔记跳到列表最前面。
   */
  public updateTypeCategory(noteId: number, category: string): boolean {
    const statement = this.database.prepare(`
            UPDATE notes
            SET type_category = ?
            WHERE id = ? AND trashed_at IS NULL
        `);

    return statement.run(category, noteId).changes > 0;
  }

  /** 还没分过类的笔记 id，用于给历史数据补分类。 */
  public findIdsWithoutCategory(limit: number = 200): number[] {
    const statement = this.database.prepare(`
            SELECT notes.id
            FROM notes
            JOIN workspaces ON workspaces.id = notes.workspace_id
            WHERE notes.trashed_at IS NULL
              AND workspaces.trashed_at IS NULL
              AND (notes.type_category IS NULL OR notes.type_category = '')
            ORDER BY notes.updated_at DESC
            LIMIT ?
        `);

    return (statement.all(limit) as Array<{ id: number }>).map((row) => row.id);
  }

  private static toNote(row: any): Note {
    return new Note(
      row.id,
      row.workspace_id,
      row.name,
      row.audio_relative_path,
      row.transcript,
      row.is_pinned === 1,
      row.pinned_at === null ? null : new Date(row.pinned_at),
      new Date(row.created_at),
      new Date(row.updated_at),
    );
  }
}
