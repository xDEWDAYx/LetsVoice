import Database from 'better-sqlite3';

import { Note } from '@shared/entities/Note';
import { AIConversation } from '@shared/entities/AIConversation';
import { DatabaseManager } from '../DatabaseManager';

// 保留命名导出，与其余 Repository 的导入方式一致。
export class ConversationContextRepository {
  private database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public addContext(conversationId: number, noteId: number): void {
    const statement = this.database.prepare(`
            INSERT INTO conversation_contexts (
                conversation_id,
                note_id
            )
            SELECT ?, notes.id
            FROM notes
            INNER JOIN workspaces ON workspaces.id = notes.workspace_id
            WHERE notes.id = ?
              AND notes.trashed_at IS NULL
              AND workspaces.trashed_at IS NULL
        `);

    const result = statement.run(conversationId, noteId);
    if (result.changes !== 1) {
      throw new Error('笔记不可用 / Note is unavailable');
    }
  }

  public removeContext(conversationId: number, noteId: number): void {
    const statement = this.database.prepare(`
            DELETE
            FROM conversation_contexts
            WHERE conversation_id = ?
            AND note_id = ?
        `);

    statement.run(conversationId, noteId);
  }

  public findAllByConversation(conversationId: number): Note[] {
    const statement = this.database.prepare(`
            SELECT notes.*
            FROM notes
            INNER JOIN conversation_contexts
            ON notes.id = conversation_contexts.note_id
            INNER JOIN workspaces
            ON workspaces.id = notes.workspace_id
            WHERE conversation_contexts.conversation_id = ?
            AND notes.trashed_at IS NULL
            AND workspaces.trashed_at IS NULL
        `);

    const rows = statement.all(conversationId) as any[];

    return rows.map((row) => ConversationContextRepository.toNote(row));
  }

  public findAllByNote(noteId: number): AIConversation[] {
    const statement = this.database.prepare(`
            SELECT ai_conversations.*
            FROM ai_conversations
            INNER JOIN conversation_contexts
            ON ai_conversations.id =
               conversation_contexts.conversation_id
            WHERE conversation_contexts.note_id = ?
        `);

    const rows = statement.all(noteId) as any[];

    return rows.map((row) =>
      ConversationContextRepository.toAIConversation(row),
    );
  }

  public exists(conversationId: number, noteId: number): boolean {
    const statement = this.database.prepare(`
            SELECT 1
            FROM conversation_contexts
            WHERE conversation_id = ?
            AND note_id = ?
            LIMIT 1
        `);

    return statement.get(conversationId, noteId) !== undefined;
  }

  private static toNote(row: any): Note {
    return new Note(
      row.id,
      row.workspace_id,
      row.name,
      row.audio_relative_path,
      row.transcript,
      row.is_pinned === 1,
      row.pinned_at === null ? null : new Date(row.pinned_at),
      new Date(row.created_at),
      new Date(row.updated_at),
    );
  }

  private static toAIConversation(row: any): AIConversation {
    return new AIConversation(
      row.id,
      row.name,
      new Date(row.created_at),
      new Date(row.updated_at),
    );
  }
}
