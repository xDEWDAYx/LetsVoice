import { DatabaseManager } from "@/database";
import { AiMessage, AiMessageRole } from "@/domain/ai-message/ai-message";
import { DatabaseError } from "@/errors/database-error";

type AiMessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
};

const SELECT_COLUMNS = "id, conversation_id, role, content, created_at";

export class AiMessageRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findByConversationId(conversationId: string): Promise<AiMessage[]> {
    try {
      const rows = await this.databaseManager
        .getDatabase()
        .getAllAsync<AiMessageRow>(
          `SELECT ${SELECT_COLUMNS}
           FROM ai_messages
           WHERE conversation_id = ?
           ORDER BY created_at ASC`,
          conversationId,
        );
      return rows.map((row) => this.mapRowToEntity(row));
    } catch (error) {
      throw this.toDatabaseError("Unable to load messages.", error);
    }
  }

  public async countByConversationId(conversationId: string): Promise<number> {
    try {
      const row = await this.databaseManager
        .getDatabase()
        .getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) AS count FROM ai_messages WHERE conversation_id = ?",
          conversationId,
        );
      return row?.count ?? 0;
    } catch (error) {
      throw this.toDatabaseError("Unable to count messages.", error);
    }
  }

  public async create(message: AiMessage): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        message.getId(),
        message.getConversationId(),
        message.getRole(),
        message.getContent(),
        message.getCreatedAt(),
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to save the message.", error);
    }
  }

  private mapRowToEntity(row: AiMessageRow): AiMessage {
    return new AiMessage(
      row.id,
      row.conversation_id,
      row.role as AiMessageRole,
      row.content,
      row.created_at,
    );
  }

  private toDatabaseError(message: string, error: unknown): DatabaseError {
    return new DatabaseError(message, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
