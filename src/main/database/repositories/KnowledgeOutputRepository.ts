import Database from 'better-sqlite3';

import { KnowledgeOutput } from '@shared/entities/KnowledgeOutput';
import { Repository } from './Repository';
import { DatabaseManager } from '../DatabaseManager';

// 保留命名导出，与其余 Repository 的导入方式一致。
export class KnowledgeOutputRepository implements Repository<KnowledgeOutput> {
  private database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public create(entity: KnowledgeOutput): number {
    const statement = this.database.prepare(`
            INSERT INTO knowledge_outputs (
                note_id,
                template_id,
                content_type,
                content,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `);

    const result = statement.run(
      entity.getNoteId(),
      entity.getTemplateId(),
      entity.getContentType(),
      entity.getContent(),
      entity.getCreatedAt().toISOString(),
      entity.getUpdatedAt().toISOString(),
    );

    return Number(result.lastInsertRowid);
  }

  public findById(id: number): KnowledgeOutput | null {
    const statement = this.database.prepare(`
            SELECT *
            FROM knowledge_outputs
            WHERE id = ?
        `);

    const row = statement.get(id) as any;

    if (row === undefined) {
      return null;
    }

    return KnowledgeOutputRepository.toKnowledgeOutput(row);
  }

  public findAllByNote(noteId: number): KnowledgeOutput[] {
    const statement = this.database.prepare(`
            SELECT *
            FROM knowledge_outputs
            WHERE note_id = ?
            ORDER BY updated_at DESC
        `);

    const rows = statement.all(noteId) as any[];

    return rows.map((row) => KnowledgeOutputRepository.toKnowledgeOutput(row));
  }

  public findAllByTemplate(templateId: number): KnowledgeOutput[] {
    const statement = this.database.prepare(`
            SELECT *
            FROM knowledge_outputs
            WHERE template_id = ?
            ORDER BY updated_at DESC
        `);

    const rows = statement.all(templateId) as any[];

    return rows.map((row) => KnowledgeOutputRepository.toKnowledgeOutput(row));
  }

  public update(entity: KnowledgeOutput): boolean {
    const statement = this.database.prepare(`
            UPDATE knowledge_outputs
            SET
                content_type = ?,
                content = ?,
                updated_at = ?
            WHERE id = ?
        `);

    return (
      statement.run(
        entity.getContentType(),
        entity.getContent(),
        entity.getUpdatedAt().toISOString(),
        entity.getId(),
      ).changes > 0
    );
  }

  public deleteById(id: number): boolean {
    return (
      this.database
        .prepare(
          `
            DELETE
            FROM knowledge_outputs
            WHERE id = ?
        `,
        )
        .run(id).changes > 0
    );
  }

  public existsById(id: number): boolean {
    return (
      this.database
        .prepare(
          `
            SELECT 1
            FROM knowledge_outputs
            WHERE id = ?
        `,
        )
        .get(id) !== undefined
    );
  }

  private static toKnowledgeOutput(row: any): KnowledgeOutput {
    return new KnowledgeOutput(
      row.id,
      row.note_id,
      row.template_id,
      row.content_type,
      row.content,
      new Date(row.created_at),
      new Date(row.updated_at),
    );
  }
}
