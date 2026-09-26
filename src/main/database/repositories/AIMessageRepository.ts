import Database from 'better-sqlite3';

import { AIMessage } from '@shared/entities/AIMessage';
import { Repository } from './Repository';
import { DatabaseManager } from '../DatabaseManager';

// 保留命名导出，与其余 Repository 的导入方式一致。
export class AIMessageRepository implements Repository<AIMessage> {
  private database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public create(entity: AIMessage): void {
    const statement = this.database.prepare(`
            INSERT INTO ai_messages (
                id,
                conversation_id,
                role,
                content,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
        `);

    statement.run(
      entity.getId(),
      entity.getConversationId(),
      entity.getRole(),
      entity.getContent(),
      entity.getCreatedAt().toISOString(),
    );
  }

  /** 聊天消息沿用数据库自增 ID，并返回刚创建的实体。 */
  public createForConversation(
    conversationId: number,
    role: 'user' | 'assistant' | 'system',
    content: string,
  ): AIMessage {
    const now = new Date();
    const statement = this.database.prepare(`
            INSERT INTO ai_messages (
                conversation_id, role, content, created_at
            ) VALUES (?, ?, ?, ?)
        `);
    const result = statement.run(
      conversationId,
      role,
      content,
      now.toISOString(),
    );

    return new AIMessage(
      Number(result.lastInsertRowid),
      conversationId,
      role,
      content,
      now,
    );
  }

  public findById(id: number): AIMessage | null {
    const statement = this.database.prepare(`
            SELECT *
            FROM ai_messages
            WHERE id = ?
        `);

    const row = statement.get(id) as any;

    if (row === undefined) {
      return null;
    }

    return AIMessageRepository.toAIMessage(row);
  }

  public findAllByConversation(conversationId: number): AIMessage[] {
    const statement = this.database.prepare(`
            SELECT *
            FROM ai_messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
        `);

    const rows = statement.all(conversationId) as any[];

    return rows.map((row) => AIMessageRepository.toAIMessage(row));
  }

  public update(entity: AIMessage): boolean {
    const statement = this.database.prepare(`
            UPDATE ai_messages
            SET
                role = ?,
                content = ?
            WHERE id = ?
        `);

    const result = statement.run(
      entity.getRole(),
      entity.getContent(),
      entity.getId(),
    );

    return result.changes > 0;
  }

  public deleteById(id: number): boolean {
    const statement = this.database.prepare(`
            DELETE
            FROM ai_messages
            WHERE id = ?
        `);

    const result = statement.run(id);

    return result.changes > 0;
  }

  public existsById(id: number): boolean {
    const statement = this.database.prepare(`
            SELECT 1
            FROM ai_messages
            WHERE id = ?
            LIMIT 1
        `);

    return statement.get(id) !== undefined;
  }

  private static toAIMessage(row: any): AIMessage {
    return new AIMessage(
      row.id,
      row.conversation_id,
      row.role,
      row.content,
      new Date(row.created_at),
    );
  }
}
