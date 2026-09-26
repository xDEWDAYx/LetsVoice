import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

export class InitialSchemaMigration extends Migration {
  public readonly version = 1;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        name TEXT,
        audio_relative_path TEXT,
        transcript TEXT NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        pinned_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
      );

      CREATE TABLE IF NOT EXISTS subnotes (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id)
      );

      CREATE TABLE IF NOT EXISTS knowledge_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_outputs (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id),
        FOREIGN KEY (template_id) REFERENCES knowledge_templates (id)
      );

      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id)
      );

      CREATE TABLE IF NOT EXISTS conversation_contexts (
        conversation_id TEXT,
        note_id TEXT,
        PRIMARY KEY (conversation_id, note_id),
        FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id),
        FOREIGN KEY (note_id) REFERENCES notes (id)
      );
    `);
  }
}
