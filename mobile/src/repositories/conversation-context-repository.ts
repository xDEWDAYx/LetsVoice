import { DatabaseManager } from "@/database";
import { DatabaseError } from "@/errors/database-error";

export class ConversationContextRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async link(conversationId: string, noteId: string): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT OR IGNORE INTO conversation_contexts (conversation_id, note_id)
         VALUES (?, ?)`,
        conversationId,
        noteId,
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to link the note context.", error);
    }
  }

  public async unlink(conversationId: string, noteId: string): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `DELETE FROM conversation_contexts
         WHERE conversation_id = ? AND note_id = ?`,
        conversationId,
        noteId,
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to unlink the note context.", error);
    }
  }

  public async findNoteIdsByConversationId(
    conversationId: string,
  ): Promise<string[]> {
    try {
      const rows = await this.databaseManager
        .getDatabase()
        .getAllAsync<{ note_id: string }>(
          `SELECT note_id FROM conversation_contexts
           WHERE conversation_id = ?`,
          conversationId,
        );
      return rows.map((row) => row.note_id);
    } catch (error) {
      throw this.toDatabaseError("Unable to load linked notes.", error);
    }
  }

  public async countByConversationId(conversationId: string): Promise<number> {
    try {
      const row = await this.databaseManager
        .getDatabase()
        .getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM conversation_contexts
           WHERE conversation_id = ?`,
          conversationId,
        );
      return row?.count ?? 0;
    } catch (error) {
      throw this.toDatabaseError("Unable to count linked notes.", error);
    }
  }

  private toDatabaseError(message: string, error: unknown): DatabaseError {
    return new DatabaseError(message, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
