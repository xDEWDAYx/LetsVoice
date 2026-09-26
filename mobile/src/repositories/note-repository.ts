import { isNoteCategory, type NoteCategory } from "@/constants/note-categories";
import { DatabaseManager } from "@/database";
import { Note } from "@/domain/note/note";
import { DatabaseError } from "@/errors/database-error";

type NoteRow = {
  id: string;
  workspace_id: string | null;
  name: string | null;
  audio_relative_path: string | null;
  transcript: string;
  is_pinned: number;
  pinned_at: string | null;
  category: string;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NoteSearchCorpus = {
  note: Note;
  structuredSections: { section: "summary" | "key-points" | "tasks"; text: string }[];
  knowledgeResults: { id: string; title: string; text: string }[];
  conversations: { id: string; title: string; text: string }[];
};

type StructuredSearchRow = {
  note_id: string;
  summary: string;
  key_points: string;
  tasks: string;
  action_items: string;
};
type KnowledgeSearchRow = {
  note_id: string;
  id: string;
  template_name: string;
  summary: string;
  sections_json: string;
};
type ConversationSearchRow = { note_id: string; id: string; name: string; text: string };

const NOTE_COLUMNS = `n.id, n.workspace_id, n.name, n.audio_relative_path,
  n.transcript, n.is_pinned, n.pinned_at, n.category, n.trashed_at,
  n.created_at, n.updated_at`;

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

export class NoteRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findById(id: string): Promise<Note | null> {
    return this.findOne(
      `${NOTE_COLUMNS}
       FROM notes n
       INNER JOIN workspaces w ON w.id = n.workspace_id
       WHERE n.id = ? AND n.trashed_at IS NULL AND w.trashed_at IS NULL`,
      id,
    );
  }

  public async findByIdIncludingTrashed(id: string): Promise<Note | null> {
    return this.findOne(`${NOTE_COLUMNS} FROM notes n WHERE n.id = ?`, id);
  }

  public async findByWorkspaceId(workspaceId: string): Promise<Note[]> {
    return this.findMany(
      `${NOTE_COLUMNS}
       FROM notes n
       INNER JOIN workspaces w ON w.id = n.workspace_id
       WHERE n.workspace_id = ? AND n.trashed_at IS NULL AND w.trashed_at IS NULL
       ORDER BY n.is_pinned DESC, n.pinned_at DESC, n.updated_at DESC`,
      workspaceId,
    );
  }

  public async findAll(): Promise<Note[]> {
    return this.findMany(
      `${NOTE_COLUMNS}
       FROM notes n
       INNER JOIN workspaces w ON w.id = n.workspace_id
       WHERE n.trashed_at IS NULL AND w.trashed_at IS NULL
       ORDER BY n.is_pinned DESC, n.pinned_at DESC, n.updated_at DESC`,
    );
  }

  public async findAllWithTranscript(): Promise<Note[]> {
    return this.findMany(
      `${NOTE_COLUMNS}
       FROM notes n
       INNER JOIN workspaces w ON w.id = n.workspace_id
       WHERE n.trashed_at IS NULL AND w.trashed_at IS NULL
         AND length(trim(n.transcript)) > 0
       ORDER BY n.updated_at DESC`,
    );
  }

  public async findByIdsIncludingTrashed(ids: readonly string[]): Promise<Note[]> {
    if (ids.length === 0) return [];
    return this.findMany(
      `${NOTE_COLUMNS} FROM notes n WHERE n.id IN (${placeholders(ids.length)})`,
      ...ids,
    );
  }

  public async areAllActive(ids: readonly string[]): Promise<boolean> {
    const normalized = [...new Set(ids)];
    if (normalized.length === 0) return false;
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM notes n
         INNER JOIN workspaces w ON w.id = n.workspace_id
         WHERE n.id IN (${placeholders(normalized.length)})
           AND n.trashed_at IS NULL AND w.trashed_at IS NULL`,
        ...normalized,
      );
      return (row?.count ?? 0) === normalized.length;
    } catch (error) {
      throw this.toDatabaseError("Unable to check note availability.", error);
    }
  }

  public async search(query: string): Promise<Note[]> {
    const pattern = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
    return this.findMany(
      `${NOTE_COLUMNS}
       FROM notes n
       INNER JOIN workspaces w ON w.id = n.workspace_id
       WHERE n.trashed_at IS NULL AND w.trashed_at IS NULL
         AND (n.name LIKE ? ESCAPE '\\' COLLATE NOCASE
           OR n.transcript LIKE ? ESCAPE '\\' COLLATE NOCASE)
       ORDER BY n.updated_at DESC`,
      pattern,
      pattern,
    );
  }

  public async getSearchCorpus(): Promise<NoteSearchCorpus[]> {
    try {
      const database = this.databaseManager.getDatabase();
      const [notes, structuredRows, knowledgeRows, conversationRows] = await Promise.all([
        this.findAll(),
        database.getAllAsync<StructuredSearchRow>(
          `SELECT n.id AS note_id,
             COALESCE(i.summary, '') AS summary,
             COALESCE((SELECT group_concat(content, ' ') FROM core_note_key_points WHERE insight_id = i.id), '') AS key_points,
             COALESCE((SELECT group_concat(title || ' ' || COALESCE(description, ''), ' ') FROM core_note_tasks WHERE insight_id = i.id), '') AS tasks,
             COALESCE((SELECT group_concat(title || ' ' || COALESCE(description, ''), ' ') FROM core_note_action_items WHERE insight_id = i.id), '') AS action_items
           FROM notes n
           INNER JOIN workspaces w ON w.id = n.workspace_id
           LEFT JOIN core_note_insights i ON i.note_id = n.id
           WHERE n.trashed_at IS NULL AND w.trashed_at IS NULL`,
        ),
        database.getAllAsync<KnowledgeSearchRow>(
          `SELECT kr.note_id, kr.id, kr.template_name, kr.summary, kr.sections_json
           FROM knowledge_results kr
           INNER JOIN notes n ON n.id = kr.note_id
           INNER JOIN workspaces w ON w.id = n.workspace_id
           WHERE n.trashed_at IS NULL AND w.trashed_at IS NULL
           ORDER BY kr.created_at DESC`,
        ),
        database.getAllAsync<ConversationSearchRow>(
          `SELECT cc.note_id, c.id, c.name,
             trim(c.name || char(10) || COALESCE(group_concat(m.content, char(10) || char(10)), '')) AS text
           FROM conversation_contexts cc
           INNER JOIN ai_conversations c ON c.id = cc.conversation_id
           INNER JOIN notes n ON n.id = cc.note_id
           INNER JOIN workspaces w ON w.id = n.workspace_id
           LEFT JOIN ai_messages m ON m.conversation_id = c.id
           WHERE c.trashed_at IS NULL
             AND n.trashed_at IS NULL
             AND w.trashed_at IS NULL
           GROUP BY cc.note_id, c.id, c.name
           ORDER BY c.updated_at DESC`,
        ),
      ]);

      const structuredByNoteId = new Map<string, NoteSearchCorpus["structuredSections"]>();
      for (const row of structuredRows) {
        structuredByNoteId.set(row.note_id, [
          { section: "summary", text: row.summary },
          { section: "key-points", text: row.key_points },
          { section: "tasks", text: [row.tasks, row.action_items].filter(Boolean).join(" ") },
        ]);
      }
      const knowledgeByNoteId = new Map<string, NoteSearchCorpus["knowledgeResults"]>();
      for (const row of knowledgeRows) {
        const items = knowledgeByNoteId.get(row.note_id) ?? [];
        items.push({
          id: row.id,
          title: row.template_name,
          text: [row.template_name, row.summary, this.knowledgeSectionText(row.sections_json)]
            .filter(Boolean)
            .join(" "),
        });
        knowledgeByNoteId.set(row.note_id, items);
      }
      const conversationsByNoteId = new Map<string, NoteSearchCorpus["conversations"]>();
      for (const row of conversationRows) {
        const items = conversationsByNoteId.get(row.note_id) ?? [];
        items.push({ id: row.id, title: row.name, text: row.text });
        conversationsByNoteId.set(row.note_id, items);
      }

      return notes.map((note) => ({
        note,
        structuredSections: structuredByNoteId.get(note.getId()) ?? [],
        knowledgeResults: knowledgeByNoteId.get(note.getId()) ?? [],
        conversations: conversationsByNoteId.get(note.getId()) ?? [],
      }));
    } catch (error) {
      throw this.toDatabaseError("Unable to build the note search index.", error);
    }
  }

  public async create(note: Note): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO notes (
          id, workspace_id, name, audio_relative_path, transcript,
          is_pinned, pinned_at, category, trashed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        note.getId(), note.getWorkspaceId(), note.getName(), note.getAudioRelativePath(),
        note.getTranscript(), note.getIsPinned() ? 1 : 0, note.getPinnedAt(),
        note.getCategory(), note.getTrashedAt(), note.getCreatedAt(), note.getUpdatedAt(),
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to create the note.", error);
    }
  }

  public async update(note: Note): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `UPDATE notes SET workspace_id = ?, name = ?, transcript = ?,
          is_pinned = ?, pinned_at = ?, category = ?, updated_at = ?
         WHERE id = ? AND trashed_at IS NULL`,
        note.getWorkspaceId(), note.getName(), note.getTranscript(),
        note.getIsPinned() ? 1 : 0, note.getPinnedAt(), note.getCategory(),
        note.getUpdatedAt(), note.getId(),
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to update the note.", error);
    }
  }

  public async updateCategory(id: string, category: NoteCategory): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        "UPDATE notes SET category = ?, updated_at = ? WHERE id = ? AND trashed_at IS NULL",
        category, new Date().toISOString(), id,
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to update the note category.", error);
    }
  }

  public async updateCategoryIfUnchanged(
    id: string,
    category: NoteCategory,
    expectedUpdatedAt: string,
  ): Promise<boolean> {
    try {
      const result = await this.databaseManager.getDatabase().runAsync(
        `UPDATE notes SET category = ?, updated_at = ?
         WHERE id = ? AND trashed_at IS NULL AND updated_at = ?`,
        category, new Date().toISOString(), id, expectedUpdatedAt,
      );
      return result.changes === 1;
    } catch (error) {
      throw this.toDatabaseError("Unable to update the note category.", error);
    }
  }

  public async moveMany(ids: readonly string[], workspaceId: string): Promise<void> {
    await this.runAtomicNoteUpdate(ids, async (database, normalizedIds) => {
      const workspace = await database.getFirstAsync<{ id: string }>(
        "SELECT id FROM workspaces WHERE id = ? AND trashed_at IS NULL", workspaceId,
      );
      if (!workspace) throw new Error("Target workspace does not exist.");
      await database.runAsync(
        `UPDATE notes SET workspace_id = ?, updated_at = ?
         WHERE id IN (${placeholders(normalizedIds.length)})`,
        workspaceId, new Date().toISOString(), ...normalizedIds,
      );
    });
  }

  public async setPinnedMany(ids: readonly string[], isPinned: boolean): Promise<void> {
    await this.runAtomicNoteUpdate(ids, async (database, normalizedIds) => {
      const now = new Date().toISOString();
      await database.runAsync(
        `UPDATE notes SET is_pinned = ?, pinned_at = ?, updated_at = ?
         WHERE id IN (${placeholders(normalizedIds.length)})`,
        isPinned ? 1 : 0, isPinned ? now : null, now, ...normalizedIds,
      );
    });
  }

  public async trashMany(ids: readonly string[]): Promise<string> {
    const trashedAt = new Date().toISOString();
    await this.runAtomicNoteUpdate(ids, async (database, normalizedIds) => {
      await database.runAsync(
        `UPDATE notes SET trashed_at = ?, updated_at = ?
         WHERE id IN (${placeholders(normalizedIds.length)})`,
        trashedAt, trashedAt, ...normalizedIds,
      );
    });
    return trashedAt;
  }

  public async restoreMany(ids: readonly string[]): Promise<void> {
    const normalizedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (normalizedIds.length === 0) return;
    try {
      await this.databaseManager.getDatabase().runAsync(
        `UPDATE notes SET trashed_at = NULL, updated_at = ?
         WHERE id IN (${placeholders(normalizedIds.length)})`,
        new Date().toISOString(), ...normalizedIds,
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to restore notes.", error);
    }
  }

  public async delete(id: string): Promise<void> {
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(async (transaction) => {
        const conversations = await transaction.getAllAsync<{ conversation_id: string }>(
          "SELECT conversation_id FROM conversation_contexts WHERE note_id = ?", id,
        );
        for (const row of conversations) {
          await transaction.runAsync("DELETE FROM ai_messages WHERE conversation_id = ?", row.conversation_id);
          await transaction.runAsync("DELETE FROM conversation_contexts WHERE conversation_id = ?", row.conversation_id);
          await transaction.runAsync("DELETE FROM ai_conversations WHERE id = ?", row.conversation_id);
        }
        await transaction.runAsync("DELETE FROM knowledge_results WHERE note_id = ?", id);
        await transaction.runAsync("DELETE FROM knowledge_documents WHERE note_id = ?", id);
        await transaction.runAsync("DELETE FROM knowledge_outputs WHERE note_id = ?", id);
        await transaction.runAsync("DELETE FROM subnotes WHERE note_id = ?", id);
        await transaction.runAsync("DELETE FROM notes WHERE id = ?", id);
      });
    } catch (error) {
      throw this.toDatabaseError("Unable to permanently delete the note.", error);
    }
  }

  private async runAtomicNoteUpdate(
    ids: readonly string[],
    update: (database: ReturnType<DatabaseManager["getDatabase"]>, normalizedIds: string[]) => Promise<void>,
  ): Promise<void> {
    const normalizedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (normalizedIds.length === 0) throw new Error("Select at least one note.");
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(async (database) => {
        const row = await database.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM notes n
           INNER JOIN workspaces w ON w.id = n.workspace_id
           WHERE n.id IN (${placeholders(normalizedIds.length)})
             AND n.trashed_at IS NULL AND w.trashed_at IS NULL`,
          ...normalizedIds,
        );
        if ((row?.count ?? 0) !== normalizedIds.length) {
          throw new Error("One or more selected notes are no longer available.");
        }
        await update(database, normalizedIds);
      });
    } catch (error) {
      throw this.toDatabaseError("Unable to update the selected notes.", error);
    }
  }

  private async findOne(query: string, ...params: string[]): Promise<Note | null> {
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<NoteRow>(
        `SELECT ${query}`, ...params,
      );
      return row?.workspace_id ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError("Unable to load the note.", error);
    }
  }

  private async findMany(query: string, ...params: string[]): Promise<Note[]> {
    try {
      const rows = await this.databaseManager.getDatabase().getAllAsync<NoteRow>(
        `SELECT ${query}`, ...params,
      );
      return rows.filter((row) => row.workspace_id !== null).map((row) => this.mapRowToEntity(row));
    } catch (error) {
      throw this.toDatabaseError("Unable to load notes.", error);
    }
  }

  private mapRowToEntity(row: NoteRow): Note {
    if (row.workspace_id === null) throw new DatabaseError("Note has no workspace relationship.");
    return new Note(
      row.id, row.workspace_id, row.name, row.audio_relative_path, row.transcript,
      row.is_pinned === 1, row.pinned_at, row.created_at, row.updated_at,
      isNoteCategory(row.category) ? row.category : "uncategorized", row.trashed_at,
    );
  }

  private knowledgeSectionText(value: string): string {
    try {
      const sections = JSON.parse(value) as unknown;
      if (!Array.isArray(sections)) return "";
      return sections.flatMap((section) => {
        if (!section || typeof section !== "object" || Array.isArray(section)) return [];
        const record = section as Record<string, unknown>;
        const title = typeof record.title === "string" ? record.title : "";
        const items = Array.isArray(record.items)
          ? record.items.filter((item): item is string => typeof item === "string")
          : [];
        return [title, ...items];
      }).join(" ");
    } catch {
      return "";
    }
  }

  private toDatabaseError(message: string, error: unknown): DatabaseError {
    return new DatabaseError(message, { cause: error instanceof Error ? error : undefined });
  }
}
