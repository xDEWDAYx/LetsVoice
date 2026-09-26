import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

export class SttModelSchemaMigration extends Migration {
  public readonly version = 2;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS stt_models (
        id TEXT PRIMARY KEY,
        engine TEXT NOT NULL,
        name TEXT NOT NULL,
        format TEXT NOT NULL,
        quantization TEXT,
        file_relative_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        downloaded_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
}
