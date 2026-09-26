import { File, Paths } from "expo-file-system";

import { DatabaseManager } from "@/database";
import { DatabaseError } from "@/errors/database-error";
import { ValidationError } from "@/errors/validation-error";

export const TRASH_KINDS = ["note", "workspace", "conversation", "template"] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];
export type TrashFilter = "all" | TrashKind;

export type TrashItem = {
  kind: TrashKind;
  id: string;
  name: string;
  detail: string;
  trashedAt: string;
};

export type PermanentDeleteImpact = {
  noteCount: number;
  conversationCount: number;
};

type TrashRow = {
  kind: TrashKind;
  id: string;
  name: string | null;
  detail: string | null;
  trashed_at: string;
};

export class TrashService {
  public constructor(
    private readonly databaseManager: DatabaseManager,
    private readonly onSearchContentChanged: () => void = () => undefined,
  ) {}

  public async list(filter: TrashFilter = "all", query = ""): Promise<TrashItem[]> {
    try {
      const rows = await this.databaseManager.getDatabase().getAllAsync<TrashRow>(`
        SELECT 'note' AS kind, n.id, COALESCE(n.name, 'Untitled note') AS name,
          COALESCE(w.name, 'Workspace') AS detail, n.trashed_at
        FROM notes n LEFT JOIN workspaces w ON w.id = n.workspace_id
        WHERE n.trashed_at IS NOT NULL
        UNION ALL
        SELECT 'workspace', w.id, w.name,
          CAST((SELECT COUNT(*) FROM notes n WHERE n.workspace_id = w.id) AS TEXT) || ' notes',
          w.trashed_at
        FROM workspaces w WHERE w.trashed_at IS NOT NULL
        UNION ALL
        SELECT 'conversation', c.id, COALESCE(c.name, 'Ask AI'),
          CAST((SELECT COUNT(*) FROM conversation_contexts cc WHERE cc.conversation_id = c.id) AS TEXT) || ' source notes',
          c.trashed_at
        FROM ai_conversations c WHERE c.trashed_at IS NOT NULL
        UNION ALL
        SELECT 'template', t.id, t.name, 'Knowledge template', t.trashed_at
        FROM knowledge_templates t WHERE t.trashed_at IS NOT NULL
        ORDER BY trashed_at DESC
      `);
      const normalized = query.trim().toLocaleLowerCase();
      return rows
        .filter((row) => filter === "all" || row.kind === filter)
        .filter((row) => !normalized || `${row.name ?? ""} ${row.detail ?? ""}`.toLocaleLowerCase().includes(normalized))
        .map((row) => ({
          kind: row.kind,
          id: row.id,
          name: row.name?.trim() || this.defaultName(row.kind),
          detail: row.detail ?? "",
          trashedAt: row.trashed_at,
        }));
    } catch (error) {
      throw new DatabaseError("Unable to load Trash.", { cause: error instanceof Error ? error : undefined });
    }
  }

  public async restore(kind: TrashKind, id: string): Promise<void> {
    const config = this.tableFor(kind);
    try {
      const result = await this.databaseManager.getDatabase().runAsync(
        `UPDATE ${config.table} SET trashed_at = NULL, updated_at = ? WHERE id = ? AND trashed_at IS NOT NULL`,
        new Date().toISOString(),
        id,
      );
      if (result.changes === 0) throw new Error("Trash item was not found.");
      this.onSearchContentChanged();
    } catch (error) {
      throw new DatabaseError("Unable to restore this Trash item.", { cause: error instanceof Error ? error : undefined });
    }
  }

  public async getPermanentDeleteImpact(kind: TrashKind, id: string): Promise<PermanentDeleteImpact> {
    const database = this.databaseManager.getDatabase();
    if (kind === "note") {
      const row = await database.getFirstAsync<{ conversations: number }>(
        `SELECT COUNT(DISTINCT conversation_id) AS conversations
         FROM conversation_contexts WHERE note_id = ?`,
        id,
      );
      return { noteCount: 1, conversationCount: row?.conversations ?? 0 };
    }
    if (kind === "workspace") {
      const row = await database.getFirstAsync<{ notes: number; conversations: number }>(
        `SELECT
          (SELECT COUNT(*) FROM notes WHERE workspace_id = ?) AS notes,
          (SELECT COUNT(DISTINCT cc.conversation_id)
           FROM conversation_contexts cc
           INNER JOIN notes n ON n.id = cc.note_id
           WHERE n.workspace_id = ?) AS conversations`,
        id,
        id,
      );
      return { noteCount: row?.notes ?? 0, conversationCount: row?.conversations ?? 0 };
    }
    return { noteCount: 0, conversationCount: kind === "conversation" ? 1 : 0 };
  }

  public async permanentlyDelete(kind: TrashKind, id: string): Promise<void> {
    const audioPaths: string[] = [];
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(async (database) => {
        if (kind === "conversation") {
          await this.deleteConversation(database, id);
          return;
        }
        if (kind === "template") {
          await database.runAsync(
            "UPDATE knowledge_results SET template_deleted = 1, template_id = NULL WHERE template_id = ?",
            id,
          );
          await database.runAsync("DELETE FROM knowledge_outputs WHERE template_id = ?", id);
          await database.runAsync("DELETE FROM knowledge_templates WHERE id = ?", id);
          return;
        }

        const noteRows = kind === "note"
          ? await database.getAllAsync<{ id: string; audio_relative_path: string | null }>(
              "SELECT id, audio_relative_path FROM notes WHERE id = ?", id,
            )
          : await database.getAllAsync<{ id: string; audio_relative_path: string | null }>(
              "SELECT id, audio_relative_path FROM notes WHERE workspace_id = ?", id,
            );
        const noteIds = noteRows.map((row) => row.id);
        audioPaths.push(...noteRows.flatMap((row) => row.audio_relative_path ? [row.audio_relative_path] : []));

        for (const noteId of noteIds) {
          const conversations = await database.getAllAsync<{ conversation_id: string }>(
            "SELECT DISTINCT conversation_id FROM conversation_contexts WHERE note_id = ?", noteId,
          );
          for (const conversation of conversations) {
            await this.deleteConversation(database, conversation.conversation_id);
          }
          await database.runAsync("DELETE FROM knowledge_results WHERE note_id = ?", noteId);
          await database.runAsync("DELETE FROM knowledge_documents WHERE note_id = ?", noteId);
          await database.runAsync("DELETE FROM knowledge_outputs WHERE note_id = ?", noteId);
          await database.runAsync("DELETE FROM subnotes WHERE note_id = ?", noteId);
          await database.runAsync("DELETE FROM core_note_insights WHERE note_id = ?", noteId);
          await database.runAsync("DELETE FROM notes WHERE id = ?", noteId);
        }
        if (kind === "workspace") await database.runAsync("DELETE FROM workspaces WHERE id = ?", id);
      });
    } catch (error) {
      throw new DatabaseError("Unable to permanently delete this Trash item.", {
        cause: error instanceof Error ? error : undefined,
      });
    }
    for (const relativePath of audioPaths) this.deleteAudio(relativePath);
    this.onSearchContentChanged();
  }

  public async trashConversation(id: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const result = await this.databaseManager.getDatabase().runAsync(
        "UPDATE ai_conversations SET trashed_at = ?, updated_at = ? WHERE id = ? AND trashed_at IS NULL",
        now,
        now,
        id,
      );
      if (result.changes === 0) throw new Error("Conversation was not found.");
      this.onSearchContentChanged();
    } catch (error) {
      throw new DatabaseError("Unable to move the conversation to Trash.", { cause: error instanceof Error ? error : undefined });
    }
  }

  public async trashTemplate(id: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const result = await this.databaseManager.getDatabase().runAsync(
        "UPDATE knowledge_templates SET trashed_at = ?, updated_at = ? WHERE id = ? AND trashed_at IS NULL",
        now,
        now,
        id,
      );
      if (result.changes === 0) throw new Error("Template was not found.");
    } catch (error) {
      throw new DatabaseError("Unable to move the template to Trash.", { cause: error instanceof Error ? error : undefined });
    }
  }

  private async deleteConversation(
    database: ReturnType<DatabaseManager["getDatabase"]>,
    id: string,
  ): Promise<void> {
    await database.runAsync("DELETE FROM ai_messages WHERE conversation_id = ?", id);
    await database.runAsync("DELETE FROM conversation_contexts WHERE conversation_id = ?", id);
    await database.runAsync("DELETE FROM ai_conversations WHERE id = ?", id);
  }

  private deleteAudio(relativePath: string): void {
    try {
      const file = new File(Paths.document, ...relativePath.split("/"));
      if (file.exists) file.delete();
    } catch (error) {
      console.warn("[Trash] Database content was deleted but audio cleanup failed", { relativePath, error });
    }
  }

  private tableFor(kind: TrashKind): { table: string } {
    if (kind === "note") return { table: "notes" };
    if (kind === "workspace") return { table: "workspaces" };
    if (kind === "conversation") return { table: "ai_conversations" };
    if (kind === "template") return { table: "knowledge_templates" };
    throw new ValidationError("Unsupported Trash item type.");
  }

  private defaultName(kind: TrashKind): string {
    if (kind === "note") return "Untitled note";
    if (kind === "workspace") return "Untitled workspace";
    if (kind === "conversation") return "Ask AI";
    return "Knowledge template";
  }
}
