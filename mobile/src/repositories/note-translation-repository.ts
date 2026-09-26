import { DatabaseManager } from "@/database";
import { NoteTranslation, type NoteTranslationPayload, type NoteTranslationSection } from "@/domain/note-translation/note-translation";
import { DatabaseError } from "@/errors/database-error";

type Row = { note_id: string; target_language: string; payload_json: string; is_active: number; active_sections_json: string; model_id: string; created_at: string; updated_at: string };

export class NoteTranslationRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findByNoteId(noteId: string): Promise<NoteTranslation | null> {
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<Row>("SELECT * FROM note_translations WHERE note_id = ?", noteId);
      return row ? new NoteTranslation(row.note_id, row.target_language, JSON.parse(row.payload_json) as NoteTranslationPayload, JSON.parse(row.active_sections_json) as NoteTranslationSection[], row.model_id, row.created_at, row.updated_at) : null;
    } catch (error) {
      throw new DatabaseError("Unable to load the saved translation.", { cause: error instanceof Error ? error : undefined });
    }
  }

  public async save(translation: NoteTranslation): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO note_translations (note_id, target_language, payload_json, is_active, active_sections_json, model_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(note_id) DO UPDATE SET target_language = excluded.target_language, payload_json = excluded.payload_json,
           is_active = excluded.is_active, active_sections_json = excluded.active_sections_json, model_id = excluded.model_id, updated_at = excluded.updated_at`,
        translation.getNoteId(), translation.getTargetLanguage(), JSON.stringify(translation.getPayload()), translation.getActiveSections().length ? 1 : 0, JSON.stringify(translation.getActiveSections()),
        translation.getModelId(), translation.getCreatedAt(), translation.getUpdatedAt(),
      );
    } catch (error) {
      throw new DatabaseError("Unable to save the translation.", { cause: error instanceof Error ? error : undefined });
    }
  }

  public async setActiveSections(noteId: string, sections: readonly NoteTranslationSection[]): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync("UPDATE note_translations SET is_active = ?, active_sections_json = ?, updated_at = ? WHERE note_id = ?", sections.length ? 1 : 0, JSON.stringify(sections), new Date().toISOString(), noteId);
    } catch (error) {
      throw new DatabaseError("Unable to update the translation state.", { cause: error instanceof Error ? error : undefined });
    }
  }
}
