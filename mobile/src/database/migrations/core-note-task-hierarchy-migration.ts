import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

export class CoreNoteTaskHierarchyMigration extends Migration {
  public readonly version = 7;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS core_note_tasks (
        id TEXT PRIMARY KEY,
        insight_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        starts_at TEXT,
        due_at TEXT,
        completed_at TEXT,
        source_note_id TEXT NOT NULL,
        external_system TEXT,
        external_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (insight_id) REFERENCES core_note_insights (id) ON DELETE CASCADE,
        FOREIGN KEY (source_note_id) REFERENCES notes (id) ON DELETE CASCADE
      );
      ALTER TABLE core_note_action_items ADD COLUMN task_id TEXT REFERENCES core_note_tasks (id) ON DELETE CASCADE;
      ALTER TABLE core_note_action_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_core_note_tasks_insight_id ON core_note_tasks (insight_id);
      CREATE INDEX IF NOT EXISTS idx_core_note_action_items_task_id ON core_note_action_items (task_id);
    `);
  }
}
