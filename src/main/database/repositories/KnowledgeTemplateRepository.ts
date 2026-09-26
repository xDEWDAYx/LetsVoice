import Database from 'better-sqlite3';

import { KnowledgeTemplate } from '@shared/entities/KnowledgeTemplate';
import {
  isScenarioTemplateDefinition,
  type ScenarioTemplateDefinition,
} from '@shared/types/KnowledgeGenerationTypes';
import { Repository } from './Repository';
import { DatabaseManager } from '../DatabaseManager';

// 保留命名导出，与其余 Repository 的导入方式一致。
export class KnowledgeTemplateRepository
  implements Repository<KnowledgeTemplate>
{
  private database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public create(
    name: string,
    prompt: string,
    definition: ScenarioTemplateDefinition | null = null,
    normalizedAt: Date | null = null,
  ): number {
    const now = new Date();

    const statement = this.database.prepare(`
            INSERT INTO knowledge_templates (
                name,
                prompt,
                scenario_definition,
                normalized_at,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `);

    const result = statement.run(
      name,
      prompt,
      definition ? JSON.stringify(definition) : null,
      normalizedAt?.toISOString() ?? null,
      now.toISOString(),
      now.toISOString(),
    );

    return Number(result.lastInsertRowid);
  }

  public findById(id: number): KnowledgeTemplate | null {
    const statement = this.database.prepare(`
            SELECT *
            FROM knowledge_templates
            WHERE id = ? AND trashed_at IS NULL
        `);

    const row = statement.get(id) as any;

    if (row === undefined) {
      return null;
    }

    return KnowledgeTemplateRepository.toKnowledgeTemplate(row);
  }

  public findAll(): KnowledgeTemplate[] {
    const statement = this.database.prepare(`
            SELECT *
            FROM knowledge_templates
            WHERE trashed_at IS NULL
            ORDER BY created_at ASC
        `);

    const rows = statement.all() as any[];

    return rows.map((row) =>
      KnowledgeTemplateRepository.toKnowledgeTemplate(row),
    );
  }

  public update(
    id: number,
    name: string,
    prompt: string,
    definition: ScenarioTemplateDefinition | null = null,
    normalizedAt: Date | null = null,
  ): boolean {
    const now = new Date();

    const statement = this.database.prepare(`
            UPDATE knowledge_templates
            SET
                name = ?,
                prompt = ?,
                scenario_definition = ?,
                normalized_at = ?,
                updated_at = ?
            WHERE id = ? AND trashed_at IS NULL
        `);

    const result = statement.run(
      name,
      prompt,
      definition ? JSON.stringify(definition) : null,
      normalizedAt?.toISOString() ?? null,
      now.toISOString(),
      id,
    );

    return result.changes > 0;
  }

  public deleteById(id: number): boolean {
    // Repository-level callers must remain recoverable. Only TrashService may
    // physically delete a template after an explicit permanent-delete action.
    const statement = this.database.prepare(`
            UPDATE knowledge_templates
            SET trashed_at = ?
            WHERE id = ? AND trashed_at IS NULL
        `);

    return statement.run(new Date().toISOString(), id).changes > 0;
  }

  public existsById(id: number): boolean {
    const statement = this.database.prepare(`
            SELECT 1
            FROM knowledge_templates
            WHERE id = ? AND trashed_at IS NULL
            LIMIT 1
        `);

    return statement.get(id) !== undefined;
  }

  private static toKnowledgeTemplate(row: any): KnowledgeTemplate {
    let definition: ScenarioTemplateDefinition | null = null;
    try {
      const parsed = row.scenario_definition
        ? (JSON.parse(row.scenario_definition) as unknown)
        : null;
      definition = isScenarioTemplateDefinition(parsed) ? parsed : null;
    } catch {
      definition = null;
    }
    return new KnowledgeTemplate(
      row.id,
      row.name,
      row.prompt,
      new Date(row.created_at),
      new Date(row.updated_at),
      definition,
      row.normalized_at ? new Date(row.normalized_at) : null,
    );
  }
}
