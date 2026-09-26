import { DatabaseManager } from "@/database";
import { AiConversation } from "@/domain/ai-conversation/ai-conversation";
import { AiMessage } from "@/domain/ai-message/ai-message";
import { DatabaseError } from "@/errors/database-error";

type AiConversationRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
};

const SELECT_COLUMNS = "id, name, created_at, updated_at, trashed_at";

export class AiConversationRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findById(id: string): Promise<AiConversation | null> {
    try {
      const row = await this.databaseManager
        .getDatabase()
        .getFirstAsync<AiConversationRow>(
          `SELECT ${SELECT_COLUMNS} FROM ai_conversations WHERE id = ? AND trashed_at IS NULL`,
          id,
        );
      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError("Unable to load the conversation.", error);
    }
  }

  public async findByIdIncludingTrashed(id: string): Promise<AiConversation | null> {
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<AiConversationRow>(
        `SELECT ${SELECT_COLUMNS} FROM ai_conversations WHERE id = ?`,
        id,
      );
      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError("Unable to load the conversation.", error);
    }
  }

  public async findWithMessages(): Promise<AiConversation[]> {
    try {
      const rows = await this.databaseManager
        .getDatabase()
        .getAllAsync<AiConversationRow>(
          `SELECT DISTINCT c.${SELECT_COLUMNS.replaceAll(", ", ", c.")}
           FROM ai_conversations c
           INNER JOIN ai_messages m ON m.conversation_id = c.id
           WHERE c.trashed_at IS NULL
           ORDER BY c.updated_at DESC`,
        );
      return rows.map((row) => this.mapRowToEntity(row));
    } catch (error) {
      throw this.toDatabaseError("Unable to load conversations.", error);
    }
  }

  public async findLatestByNoteId(
    noteId: string,
  ): Promise<AiConversation | null> {
    try {
      const row = await this.databaseManager
        .getDatabase()
        .getFirstAsync<AiConversationRow>(
          `SELECT c.id, c.name, c.created_at, c.updated_at, c.trashed_at
           FROM ai_conversations c
           INNER JOIN conversation_contexts cc
             ON cc.conversation_id = c.id
           WHERE cc.note_id = ? AND c.trashed_at IS NULL
             AND (SELECT COUNT(*) FROM conversation_contexts exact_cc WHERE exact_cc.conversation_id = c.id) = 1
             AND EXISTS (
               SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id
             )
           ORDER BY c.updated_at DESC, c.id DESC
           LIMIT 1`,
          noteId,
        );
      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError(
        "Unable to load the latest conversation for this note.",
        error,
      );
    }
  }

  public async findLatestByExactNoteIds(noteIds: readonly string[]): Promise<AiConversation | null> {
    const ids = [...new Set(noteIds)].sort();
    if (ids.length === 0) return null;
    const values = ids.map(() => "?").join(", ");
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<AiConversationRow>(
        `SELECT c.${SELECT_COLUMNS.replaceAll(", ", ", c.")}
         FROM ai_conversations c
         WHERE c.trashed_at IS NULL
           AND EXISTS (SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id)
           AND (SELECT COUNT(*) FROM conversation_contexts cc WHERE cc.conversation_id = c.id) = ?
           AND (SELECT COUNT(*) FROM conversation_contexts cc
                WHERE cc.conversation_id = c.id AND cc.note_id IN (${values})) = ?
         ORDER BY c.updated_at DESC, c.id DESC
         LIMIT 1`,
        ids.length,
        ...ids,
        ids.length,
      );
      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError("Unable to resume the matching conversation.", error);
    }
  }

  public async create(conversation: AiConversation): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO ai_conversations (id, name, created_at, updated_at, trashed_at)
         VALUES (?, ?, ?, ?, NULL)`,
        conversation.getId(),
        conversation.getName(),
        conversation.getCreatedAt(),
        conversation.getUpdatedAt(),
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to create the conversation.", error);
    }
  }

  /**
   * Atomically creates a conversation, links one note context, and saves the
   * first user message. Rolls back entirely on failure.
   */
  public async createWithContextsAndFirstMessage(
    conversation: AiConversation,
    noteIds: readonly string[],
    userMessage: AiMessage,
  ): Promise<void> {
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(
        async (transaction) => {
          await transaction.runAsync(
            `INSERT INTO ai_conversations (id, name, created_at, updated_at, trashed_at)
             VALUES (?, ?, ?, ?, NULL)`,
            conversation.getId(),
            conversation.getName(),
            conversation.getCreatedAt(),
            conversation.getUpdatedAt(),
          );
          for (const noteId of [...new Set(noteIds)].sort()) {
            await transaction.runAsync(
              `INSERT INTO conversation_contexts (conversation_id, note_id) VALUES (?, ?)`,
              conversation.getId(),
              noteId,
            );
          }
          await transaction.runAsync(
            `INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            userMessage.getId(),
            userMessage.getConversationId(),
            userMessage.getRole(),
            userMessage.getContent(),
            userMessage.getCreatedAt(),
          );
        },
      );
    } catch (error) {
      throw this.toDatabaseError(
        "Unable to create the conversation with the first message.",
        error,
      );
    }
  }

  public async createWithContextAndFirstMessage(
    conversation: AiConversation,
    noteId: string,
    userMessage: AiMessage,
  ): Promise<void> {
    return this.createWithContextsAndFirstMessage(conversation, [noteId], userMessage);
  }

  public async touchUpdatedAt(id: string, updatedAt: string): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        "UPDATE ai_conversations SET updated_at = ? WHERE id = ?",
        updatedAt,
        id,
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to update the conversation.", error);
    }
  }

  public async delete(id: string): Promise<void> {
    try {
      await this.databaseManager
        .getDatabase()
        .runAsync("DELETE FROM ai_conversations WHERE id = ?", id);
    } catch (error) {
      throw this.toDatabaseError("Unable to delete the conversation.", error);
    }
  }

  public async trash(id: string): Promise<string> {
    const now = new Date().toISOString();
    try {
      const result = await this.databaseManager.getDatabase().runAsync(
        "UPDATE ai_conversations SET trashed_at = ?, updated_at = ? WHERE id = ? AND trashed_at IS NULL",
        now,
        now,
        id,
      );
      if (result.changes === 0) throw new Error("Conversation is no longer available.");
      return now;
    } catch (error) {
      throw this.toDatabaseError("Unable to move the conversation to Trash.", error);
    }
  }

  public async restore(id: string): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        "UPDATE ai_conversations SET trashed_at = NULL, updated_at = ? WHERE id = ?",
        new Date().toISOString(),
        id,
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to restore the conversation.", error);
    }
  }

  private mapRowToEntity(row: AiConversationRow): AiConversation {
    return new AiConversation(
      row.id,
      row.name,
      row.created_at,
      row.updated_at,
      row.trashed_at,
    );
  }

  private toDatabaseError(message: string, error: unknown): DatabaseError {
    return new DatabaseError(message, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
