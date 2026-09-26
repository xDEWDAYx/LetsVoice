import Database from 'better-sqlite3';
import { NoteExportRepository } from '../NoteExportRepository';

const describeWithElectron = process.versions.electron
  ? describe
  : describe.skip;

describeWithElectron('完整导出数据库聚合', () => {
  it('一次读取转写、两类知识、子笔记、模板输出、待办与对话', () => {
    const database = new Database(':memory:');
    database.exec(`
      CREATE TABLE workspaces (id INTEGER PRIMARY KEY, name TEXT, trashed_at TEXT);
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT, transcript TEXT,
        type_category TEXT, audio_relative_path TEXT, is_pinned INTEGER,
        created_at TEXT, updated_at TEXT, trashed_at TEXT
      );
      CREATE TABLE subnotes (
        id INTEGER PRIMARY KEY, note_id INTEGER, content_type TEXT,
        content TEXT, created_at TEXT
      );
      CREATE TABLE knowledge_templates (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE knowledge_outputs (
        id INTEGER PRIMARY KEY, note_id INTEGER, template_id INTEGER,
        content_type TEXT, content TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE structured_notes (note_id INTEGER PRIMARY KEY, payload TEXT);
      CREATE TABLE scenario_knowledge (note_id INTEGER PRIMARY KEY, payload TEXT);
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY, note_id INTEGER, title TEXT, date_string TEXT,
        is_completed INTEGER, is_pinned INTEGER, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE ai_conversations (
        id INTEGER PRIMARY KEY, name TEXT, created_at TEXT, updated_at TEXT,
        trashed_at TEXT
      );
      CREATE TABLE conversation_contexts (conversation_id INTEGER, note_id INTEGER);
      CREATE TABLE ai_messages (
        id INTEGER PRIMARY KEY, conversation_id INTEGER, role TEXT,
        content TEXT, created_at TEXT
      );
      INSERT INTO workspaces VALUES (1, 'workspace-token', NULL);
      INSERT INTO notes VALUES (
        10, 1, 'title-token', 'transcript-token', 'type-token',
        'recordings/audio-token.webm', 1, '2026-08-23T01:00:00.000Z',
        '2026-08-23T01:00:00.000Z', NULL
      );
      INSERT INTO subnotes VALUES (
        1, 10, 'note', 'subnote-token', '2026-08-23T01:00:00.000Z'
      );
      INSERT INTO knowledge_templates VALUES (1, 'template-token');
      INSERT INTO knowledge_outputs VALUES (
        1, 10, 1, 'markdown', 'legacy-token',
        '2026-08-23T01:00:00.000Z', '2026-08-23T01:00:00.000Z'
      );
      INSERT INTO structured_notes VALUES (
        10, '{"noteId":10,"summary":"summary-token"}'
      );
      INSERT INTO scenario_knowledge VALUES (
        10, '{"noteId":10,"templateName":"scenario-token"}'
      );
      INSERT INTO todos VALUES (
        1, 10, 'todo-token', 'tomorrow', 0, 0,
        '2026-08-23T01:00:00.000Z', '2026-08-23T01:00:00.000Z'
      );
      INSERT INTO ai_conversations VALUES (
        1, 'conversation-token', '2026-08-23T01:00:00.000Z',
        '2026-08-23T01:00:00.000Z', NULL
      );
      INSERT INTO conversation_contexts VALUES (1, 10);
      INSERT INTO ai_messages VALUES (
        1, 1, 'assistant', 'message-token', '2026-08-23T01:00:00.000Z'
      );
    `);

    const result = new NoteExportRepository(database).getNote(1, 10);

    expect(result.transcript).toBe('transcript-token');
    expect(result.structuredNote?.summary).toBe('summary-token');
    expect(result.scenarioKnowledge?.templateName).toBe('scenario-token');
    expect(result.subnotes[0].content).toBe('subnote-token');
    expect(result.knowledgeOutputs[0].content).toBe('legacy-token');
    expect(result.todos[0].title).toBe('todo-token');
    expect(result.conversations[0].messages[0].content).toBe('message-token');
    database.close();
  });
});
