import { DatabaseManager } from "@/database";
import { KnowledgeTemplate, type KnowledgeTemplateSection } from "@/domain/knowledge/knowledge-template";
import { DatabaseError } from "@/errors/database-error";

type TemplateRow = {
  id: string;
  name: string;
  prompt: string;
  sections_json: string;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
};

export class KnowledgeTemplateRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findAll(): Promise<KnowledgeTemplate[]> {
    return this.query("WHERE trashed_at IS NULL ORDER BY updated_at DESC");
  }

  public async findById(id: string): Promise<KnowledgeTemplate | null> {
    const templates = await this.query("WHERE id = ? AND trashed_at IS NULL", id);
    return templates[0] ?? null;
  }

  public async save(template: KnowledgeTemplate): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO knowledge_templates (id, name, prompt, sections_json, created_at, updated_at, trashed_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, prompt = excluded.prompt,
           sections_json = excluded.sections_json, updated_at = excluded.updated_at`,
        template.getId(), template.getName(), template.getRequirement(),
        JSON.stringify(template.getSections()), template.getCreatedAt(), template.getUpdatedAt(),
      );
    } catch (error) {
      throw new DatabaseError("Unable to save the Knowledge template.", { cause: error instanceof Error ? error : undefined });
    }
  }

  private async query(suffix: string, ...params: string[]): Promise<KnowledgeTemplate[]> {
    try {
      const rows = await this.databaseManager.getDatabase().getAllAsync<TemplateRow>(
        `SELECT id, name, prompt, sections_json, created_at, updated_at, trashed_at
         FROM knowledge_templates ${suffix}`,
        ...params,
      );
      return rows.map((row) => new KnowledgeTemplate(
        row.id, row.name, row.prompt, this.parseSections(row.sections_json),
        row.created_at, row.updated_at, row.trashed_at,
      ));
    } catch (error) {
      throw new DatabaseError("Unable to load Knowledge templates.", { cause: error instanceof Error ? error : undefined });
    }
  }

  private parseSections(value: string): KnowledgeTemplateSection[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed as KnowledgeTemplateSection[] : [];
    } catch {
      return [];
    }
  }
}
