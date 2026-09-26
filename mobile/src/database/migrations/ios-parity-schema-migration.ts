import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

/**
 * Adds the local-only iOS parity data needed by Trash, categories, immutable
 * Knowledge history, and rolling recurring tasks. Existing development data is
 * deliberately left uncategorized; new saves are classified by the service.
 */
export class IosParitySchemaMigration extends Migration {
  public readonly version = 12;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      ALTER TABLE workspaces ADD COLUMN trashed_at TEXT;
      ALTER TABLE notes ADD COLUMN category TEXT NOT NULL DEFAULT 'uncategorized';
      ALTER TABLE notes ADD COLUMN trashed_at TEXT;
      ALTER TABLE ai_conversations ADD COLUMN trashed_at TEXT;
      ALTER TABLE knowledge_templates ADD COLUMN sections_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE knowledge_templates ADD COLUMN trashed_at TEXT;

      CREATE INDEX IF NOT EXISTS idx_workspaces_trashed_at
        ON workspaces (trashed_at);
      CREATE INDEX IF NOT EXISTS idx_notes_trashed_at
        ON notes (trashed_at);
      CREATE INDEX IF NOT EXISTS idx_notes_category
        ON notes (category);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_trashed_at
        ON ai_conversations (trashed_at);
      CREATE INDEX IF NOT EXISTS idx_knowledge_templates_trashed_at
        ON knowledge_templates (trashed_at);

      CREATE TABLE IF NOT EXISTS knowledge_results (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        template_id TEXT,
        template_name TEXT NOT NULL,
        scenario TEXT,
        summary TEXT NOT NULL,
        sections_json TEXT NOT NULL,
        model_id TEXT NOT NULL,
        template_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_results_note_created
        ON knowledge_results (note_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_knowledge_results_template
        ON knowledge_results (template_id);

      ALTER TABLE core_note_tasks ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE core_note_tasks ADD COLUMN pinned_at TEXT;
      ALTER TABLE core_note_tasks ADD COLUMN recurrence_kind TEXT;
      ALTER TABLE core_note_tasks ADD COLUMN recurrence_value TEXT;
      ALTER TABLE core_note_tasks ADD COLUMN series_key TEXT;
      ALTER TABLE core_note_tasks ADD COLUMN occurrence_index INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE core_note_tasks ADD COLUMN is_current INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE core_note_tasks ADD COLUMN ended_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_core_note_tasks_series
        ON core_note_tasks (series_key, occurrence_index);
      CREATE INDEX IF NOT EXISTS idx_core_note_tasks_dashboard
        ON core_note_tasks (is_current, status, is_pinned);
    `);

    // Preserve the formerly-overwritten Knowledge row as the first immutable
    // result when a development database happens to contain one.
    await database.execAsync(`
      INSERT OR IGNORE INTO knowledge_results (
        id, note_id, template_id, template_name, scenario, summary,
        sections_json, model_id, template_deleted, created_at, updated_at
      )
      SELECT id, note_id, NULL, scenario, scenario, summary,
        sections_json, model_id, 0, created_at, updated_at
      FROM knowledge_documents;
    `);
  }
}
