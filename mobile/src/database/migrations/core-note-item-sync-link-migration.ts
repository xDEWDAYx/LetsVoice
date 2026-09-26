import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

/**
 * Keeps calendar/export integrations one-to-many without coupling task data
 * to any particular provider. No sync behavior is enabled by this migration.
 */
export class CoreNoteItemSyncLinkMigration extends Migration {
  public readonly version = 9;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS core_note_task_sync_links (
        id TEXT PRIMARY KEY,
        insight_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        target TEXT NOT NULL,
        external_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'not_synced',
        last_synced_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (insight_id) REFERENCES core_note_insights (id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES core_note_tasks (id) ON DELETE CASCADE,
        UNIQUE (task_id, target)
      );
      CREATE INDEX IF NOT EXISTS idx_core_note_task_sync_links_task
        ON core_note_task_sync_links (task_id);
      CREATE INDEX IF NOT EXISTS idx_core_note_task_sync_links_insight
        ON core_note_task_sync_links (insight_id);
    `);
  }
}
