import Database from 'better-sqlite3';

import { Subnote } from '@shared/entities/Subnote';
import { Repository } from './Repository';
import { DatabaseManager } from '../DatabaseManager';

// 保留命名导出，与其余 Repository 的导入方式一致。
export class SubnoteRepository implements Repository<Subnote> {
  private database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public create(entity: Subnote): number {
    const statement = this.database.prepare(`
            INSERT INTO subnotes (
                note_id,
                content_type,
                content,
                created_at
            )
            VALUES (?, ?, ?, ?)
        `);

    const result = statement.run(
      entity.getNoteId(),
      entity.getContentType(),
      entity.getContent(),
      entity.getCreatedAt().toISOString(),
    );

    return Number(result.lastInsertRowid);
  }

  public findById(id: number): Subnote | null {
    const statement = this.database.prepare(`
            SELECT *
            FROM subnotes
            WHERE id = ?
        `);

    const row = statement.get(id) as any;

    if (row === undefined) {
      return null;
    }

    return SubnoteRepository.toSubnote(row);
  }

  public findAllByNote(noteId: number): Subnote[] {
    const statement = this.database.prepare(`
            SELECT *
            FROM subnotes
            WHERE note_id = ?
            ORDER BY created_at ASC
        `);

    const rows = statement.all(noteId) as any[];

    return rows.map((row) => SubnoteRepository.toSubnote(row));
  }

  public update(entity: Subnote): boolean {
    const statement = this.database.prepare(`
            UPDATE subnotes
            SET
                content_type = ?,
                content = ?
            WHERE id = ?
        `);

    const result = statement.run(
      entity.getContentType(),
      entity.getContent(),
      entity.getId(),
    );

    return result.changes > 0;
  }

  public deleteById(id: number): boolean {
    const statement = this.database.prepare(`
            DELETE
            FROM subnotes
            WHERE id = ?
        `);

    const result = statement.run(id);

    return result.changes > 0;
  }

  public existsById(id: number): boolean {
    const statement = this.database.prepare(`
            SELECT 1
            FROM subnotes
            WHERE id = ?
            LIMIT 1
        `);

    return statement.get(id) !== undefined;
  }

  private static toSubnote(row: any): Subnote {
    return new Subnote(
      row.id,
      row.note_id,
      row.content_type,
      row.content,
      new Date(row.created_at),
    );
  }
}
