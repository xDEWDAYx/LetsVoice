import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "../core/migration";

export class NoteTranslationSectionsMigration extends Migration {
  public readonly version = 11;

  public async migrate(database: SQLiteDatabase): Promise<void> {
    const columns = await database.getAllAsync<{ name: string }>("PRAGMA table_info(note_translations)");
    if (!columns.some((column) => column.name === "active_sections_json")) {
      await database.execAsync("ALTER TABLE note_translations ADD COLUMN active_sections_json TEXT NOT NULL DEFAULT '[]'");
      await database.execAsync("UPDATE note_translations SET active_sections_json = CASE WHEN is_active = 1 THEN '[\"transcript\",\"insights\",\"knowledge\"]' ELSE '[]' END");
    }
  }
}
