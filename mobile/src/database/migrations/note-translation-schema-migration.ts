import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

export class NoteTranslationSchemaMigration extends Migration {
  public readonly version = 10;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS note_translations (
        note_id TEXT PRIMARY KEY,
        target_language TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
      );
    `);
  }
}
