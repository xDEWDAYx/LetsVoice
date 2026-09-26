import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

export class NoteSearchIndexMigration extends Migration {
  public readonly version = 13;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_core_note_key_points_insight_id
        ON core_note_key_points (insight_id);
      CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id
        ON ai_messages (conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_contexts_note_id
        ON conversation_contexts (note_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_results_note_id
        ON knowledge_results (note_id);
    `);
  }
}
