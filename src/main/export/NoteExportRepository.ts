import Database from 'better-sqlite3';
import type {
  ScenarioKnowledge,
  StructuredNote,
} from '@shared/types/KnowledgeGenerationTypes';
import { DatabaseManager } from '../database/DatabaseManager';
import type {
  NoteExportConversation,
  NoteExportData,
  NoteExportKnowledgeOutput,
  NoteExportSubnote,
  NoteExportTodo,
} from './NoteExportData';

type NoteRow = {
  id: number;
  workspace_id: number;
  workspace_name: string;
  name: string | null;
  transcript: string;
  type_category: string | null;
  audio_relative_path: string | null;
  is_pinned: number;
  created_at: string;
  updated_at: string;
};

export class NoteExportRepository {
  private readonly database: Database.Database;

  public constructor(
    database: Database.Database = DatabaseManager.getInstance().getDatabase(),
  ) {
    this.database = database;
  }

  public getNote(workspaceId: number, noteId: number): NoteExportData {
    const note = this.database
      .prepare(
        `SELECT notes.id, notes.workspace_id, workspaces.name AS workspace_name,
          notes.name, notes.transcript, notes.type_category,
          notes.audio_relative_path, notes.is_pinned,
          notes.created_at, notes.updated_at
        FROM notes
        JOIN workspaces ON workspaces.id = notes.workspace_id
        WHERE notes.id = ? AND notes.workspace_id = ?
          AND notes.trashed_at IS NULL AND workspaces.trashed_at IS NULL`,
      )
      .get(noteId, workspaceId) as NoteRow | undefined;

    if (!note) {
      throw new Error('笔记不存在或不属于当前工作空间 / Note not found');
    }

    return {
      noteId: note.id,
      workspaceId: note.workspace_id,
      workspaceName: note.workspace_name,
      title: note.name?.trim() || 'Untitled Note',
      transcript: note.transcript,
      typeCategory: note.type_category,
      audioRelativePath: note.audio_relative_path,
      isPinned: note.is_pinned === 1,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      structuredNote: this.readKnowledge<StructuredNote>(
        'structured_notes',
        note.id,
      ),
      scenarioKnowledge: this.readKnowledge<ScenarioKnowledge>(
        'scenario_knowledge',
        note.id,
      ),
      subnotes: this.getSubnotes(note.id),
      knowledgeOutputs: this.getKnowledgeOutputs(note.id),
      todos: this.getTodos(note.id),
      conversations: this.getConversations(note.id),
    };
  }

  private getSubnotes(noteId: number): NoteExportSubnote[] {
    const rows = this.database
      .prepare(
        `SELECT id, content_type, content, created_at
        FROM subnotes WHERE note_id = ? ORDER BY created_at ASC, id ASC`,
      )
      .all(noteId) as Array<{
      id: number;
      content_type: string;
      content: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      contentType: row.content_type,
      content: row.content,
      createdAt: row.created_at,
    }));
  }

  private getKnowledgeOutputs(noteId: number): NoteExportKnowledgeOutput[] {
    const rows = this.database
      .prepare(
        `SELECT knowledge_outputs.id,
          COALESCE(knowledge_templates.name, 'Deleted template') AS template_name,
          knowledge_outputs.content_type, knowledge_outputs.content,
          knowledge_outputs.created_at, knowledge_outputs.updated_at
        FROM knowledge_outputs
        LEFT JOIN knowledge_templates
          ON knowledge_templates.id = knowledge_outputs.template_id
        WHERE knowledge_outputs.note_id = ?
        ORDER BY knowledge_outputs.updated_at DESC, knowledge_outputs.id DESC`,
      )
      .all(noteId) as Array<{
      id: number;
      template_name: string;
      content_type: string;
      content: string;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      templateName: row.template_name,
      contentType: row.content_type,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private getTodos(noteId: number): NoteExportTodo[] {
    const rows = this.database
      .prepare(
        `SELECT id, title, date_string, is_completed, is_pinned,
          created_at, updated_at
        FROM todos WHERE note_id = ?
        ORDER BY is_pinned DESC, created_at ASC, id ASC`,
      )
      .all(noteId) as Array<{
      id: number;
      title: string;
      date_string: string;
      is_completed: number;
      is_pinned: number;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      dateString: row.date_string,
      isCompleted: row.is_completed === 1,
      isPinned: row.is_pinned === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private getConversations(noteId: number): NoteExportConversation[] {
    const conversations = this.database
      .prepare(
        `SELECT ai_conversations.id, ai_conversations.name,
          ai_conversations.created_at, ai_conversations.updated_at
        FROM conversation_contexts
        JOIN ai_conversations
          ON ai_conversations.id = conversation_contexts.conversation_id
        WHERE conversation_contexts.note_id = ?
          AND ai_conversations.trashed_at IS NULL
        ORDER BY ai_conversations.updated_at DESC, ai_conversations.id DESC`,
      )
      .all(noteId) as Array<{
      id: number;
      name: string;
      created_at: string;
      updated_at: string;
    }>;
    const getMessages = this.database.prepare(
      `SELECT id, role, content, created_at
      FROM ai_messages WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC`,
    );
    return conversations.map((conversation) => ({
      id: conversation.id,
      name: conversation.name,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: (
        getMessages.all(conversation.id) as Array<{
          id: number;
          role: string;
          content: string;
          created_at: string;
        }>
      ).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
      })),
    }));
  }

  private readKnowledge<T>(table: string, noteId: number): T | null {
    const row = this.database
      .prepare(`SELECT payload FROM ${table} WHERE note_id = ?`)
      .get(noteId) as { payload: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as T;
    } catch {
      return null;
    }
  }
}
