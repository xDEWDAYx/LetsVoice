import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

export class TtsModelSchemaMigration extends Migration {
  public readonly version = 8;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS tts_models (
        id TEXT PRIMARY KEY,
        engine TEXT NOT NULL,
        name TEXT NOT NULL,
        model_type TEXT NOT NULL,
        languages TEXT NOT NULL,
        file_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        downloaded_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
}
