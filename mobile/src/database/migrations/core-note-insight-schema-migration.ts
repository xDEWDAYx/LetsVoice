import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

export class CoreNoteInsightSchemaMigration extends Migration {
  public readonly version = 6;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS core_note_insights (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS core_note_key_points (
        id TEXT PRIMARY KEY,
        insight_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        content TEXT NOT NULL,
        FOREIGN KEY (insight_id) REFERENCES core_note_insights (id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS core_note_action_items (
        id TEXT PRIMARY KEY,
        insight_id TEXT NOT NULL,
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
      CREATE TABLE IF NOT EXISTS core_note_calendar_intents (
        id TEXT PRIMARY KEY,
        insight_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        starts_at TEXT,
        ends_at TEXT,
        due_at TEXT,
        remind_at TEXT,
        all_day INTEGER NOT NULL DEFAULT 0,
        timezone TEXT,
        source_note_id TEXT NOT NULL,
        external_system TEXT,
        external_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (insight_id) REFERENCES core_note_insights (id) ON DELETE CASCADE,
        FOREIGN KEY (source_note_id) REFERENCES notes (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_core_note_insights_note_id ON core_note_insights (note_id);
      CREATE INDEX IF NOT EXISTS idx_core_note_action_items_insight_id ON core_note_action_items (insight_id);
      CREATE INDEX IF NOT EXISTS idx_core_note_calendar_intents_insight_id ON core_note_calendar_intents (insight_id);
    `);
  }
}
