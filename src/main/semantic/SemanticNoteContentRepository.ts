import Database from 'better-sqlite3';
import { DatabaseManager } from '../database/DatabaseManager';

type SearchContentRow = {
  source_label: string;
  content: string;
};

function collectTextValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(collectTextValues);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectTextValues);
  }
  return [];
}

/** 读取一篇笔记在工作空间详情中可见的全部附属文字。 */
export default class SemanticNoteContentRepository {
  private readonly database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public findAllByNote(noteId: number): string[] {
    const rows = this.database
      .prepare(
        `SELECT source_label, content
        FROM (
          SELECT 10 AS source_order, id AS item_order,
            content_type AS source_label, content
          FROM subnotes WHERE note_id = ?

          UNION ALL

          SELECT 20, knowledge_outputs.id,
            knowledge_templates.name || ' ' || knowledge_outputs.content_type,
            knowledge_outputs.content
          FROM knowledge_outputs
          JOIN knowledge_templates
            ON knowledge_templates.id = knowledge_outputs.template_id
          WHERE knowledge_outputs.note_id = ?

          UNION ALL

          SELECT 30, 0, 'structured_note', payload
          FROM structured_notes WHERE note_id = ?

          UNION ALL

          SELECT 40, 0, 'scenario_knowledge', payload
          FROM scenario_knowledge WHERE note_id = ?

          UNION ALL

          SELECT 50, id, 'todo', title || ' ' || date_string
          FROM todos WHERE note_id = ?

          UNION ALL

          SELECT 60, ai_conversations.id, 'conversation', ai_conversations.name
          FROM conversation_contexts
          JOIN ai_conversations
            ON ai_conversations.id = conversation_contexts.conversation_id
          WHERE conversation_contexts.note_id = ?

          UNION ALL

          SELECT 70, ai_messages.id, ai_messages.role, ai_messages.content
          FROM conversation_contexts
          JOIN ai_messages
            ON ai_messages.conversation_id = conversation_contexts.conversation_id
          WHERE conversation_contexts.note_id = ?
        )
        WHERE TRIM(content) <> ''
        ORDER BY source_order ASC, item_order ASC`,
      )
      .all(
        noteId,
        noteId,
        noteId,
        noteId,
        noteId,
        noteId,
        noteId,
      ) as SearchContentRow[];

    return rows.map((row) => {
      if (
        row.source_label !== 'structured_note' &&
        row.source_label !== 'scenario_knowledge'
      ) {
        return `${row.source_label}\n${row.content}`;
      }
      try {
        const visibleText = collectTextValues(JSON.parse(row.content)).join(
          '\n',
        );
        return `${row.source_label}\n${visibleText}`;
      } catch {
        return `${row.source_label}\n${row.content}`;
      }
    });
  }
}
