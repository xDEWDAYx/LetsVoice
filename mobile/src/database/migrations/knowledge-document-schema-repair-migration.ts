import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

/**
 * Repairs databases that reached schema version 4 before the knowledge table
 * was included in the installed build. This is intentionally idempotent.
 */
export class KnowledgeDocumentSchemaRepairMigration extends Migration {
  public readonly version = 5;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL UNIQUE,
        scenario TEXT NOT NULL,
        summary TEXT NOT NULL,
        sections_json TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_documents_note_id
        ON knowledge_documents (note_id);
    `);
  }
}
