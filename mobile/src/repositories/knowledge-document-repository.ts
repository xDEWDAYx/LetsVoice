import { DatabaseManager } from "@/database";
import { KnowledgeDocument, type KnowledgeScenario, type KnowledgeSection } from "@/domain/knowledge/knowledge-document";
import { DatabaseError } from "@/errors/database-error";

type KnowledgeRow = {
  id: string;
  note_id: string;
  template_id: string | null;
  template_name: string;
  scenario: string | null;
  summary: string;
  sections_json: string;
  model_id: string;
  template_deleted: number;
  created_at: string;
  updated_at: string;
};

export class KnowledgeDocumentRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findByNoteId(noteId: string): Promise<KnowledgeDocument | null> {
    const history = await this.findAllByNoteId(noteId);
    return history[0] ?? null;
  }

  public async findAllByNoteId(noteId: string): Promise<KnowledgeDocument[]> {
    try {
      const rows = await this.databaseManager.getDatabase().getAllAsync<KnowledgeRow>(
        `SELECT id, note_id, template_id, template_name, scenario, summary,
          sections_json, model_id, template_deleted, created_at, updated_at
         FROM knowledge_results WHERE note_id = ?
         ORDER BY created_at DESC, id DESC`,
        noteId,
      );
      return rows.map((row) => this.map(row));
    } catch (error) {
      throw new DatabaseError("Unable to load Knowledge history.", { cause: error instanceof Error ? error : undefined });
    }
  }

  public async save(document: KnowledgeDocument): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO knowledge_results
          (id, note_id, template_id, template_name, scenario, summary,
           sections_json, model_id, template_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        document.getId(), document.getNoteId(), document.getTemplateId(),
        document.getTemplateName(), document.getScenario(), document.getSummary(),
        JSON.stringify(document.getSections()), document.getModelId(),
        document.getTemplateDeleted() ? 1 : 0, document.getCreatedAt(), document.getUpdatedAt(),
      );
    } catch (error) {
      throw new DatabaseError("Unable to save Knowledge result.", { cause: error instanceof Error ? error : undefined });
    }
  }

  public async deleteResult(id: string, noteId: string): Promise<void> {
    try {
      const result = await this.databaseManager.getDatabase().runAsync(
        "DELETE FROM knowledge_results WHERE id = ? AND note_id = ?",
        id,
        noteId,
      );
      if (result.changes === 0) throw new Error("Knowledge result was not found.");
    } catch (error) {
      throw new DatabaseError("Unable to delete this Knowledge result.", { cause: error instanceof Error ? error : undefined });
    }
  }

  private map(row: KnowledgeRow): KnowledgeDocument {
    return new KnowledgeDocument(
      row.id,
      row.note_id,
      (row.scenario ?? "general") as KnowledgeScenario,
      row.summary,
      this.parseSections(row.sections_json),
      row.model_id,
      row.created_at,
      row.updated_at,
      row.template_id,
      row.template_name,
      row.template_deleted === 1,
    );
  }

  private parseSections(value: string): KnowledgeSection[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed as KnowledgeSection[] : [];
    } catch {
      return [];
    }
  }
}
