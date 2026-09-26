import Database from 'better-sqlite3';
import { Note } from '@shared/entities/Note';
import { NoteRepository } from '../../database/repositories/NoteRepository';
import NoteEmbeddingRepository from '../../database/repositories/NoteEmbeddingRepository';
import SemanticNoteContentRepository from '../SemanticNoteContentRepository';
import SemanticNoteService from '../SemanticNoteService';

const note = new Note(
  1,
  7,
  'Weekly meeting',
  null,
  'The original transcript mentions the delivery date.',
  false,
  null,
  new Date('2026-08-23T00:00:00.000Z'),
  new Date('2026-08-23T00:00:00.000Z'),
);

describe('SemanticNoteService complete note search', () => {
  it('guarantees an exact match from generated note content', async () => {
    const notes = {
      findAll: jest.fn().mockReturnValue([note]),
      findAllByWorkspace: jest.fn().mockReturnValue([note]),
    } as unknown as NoteRepository;
    const embeddings = {
      find: jest.fn().mockReturnValue(null),
      upsert: jest.fn(),
    } as unknown as NoteEmbeddingRepository;
    const embedMany = jest
      .fn()
      .mockResolvedValueOnce([[1, 0]])
      .mockResolvedValueOnce([[-1, 0]]);
    const content = {
      findAllByNote: jest
        .fn()
        .mockReturnValue(['scenario_knowledge\nscenario-only-token']),
    } as unknown as SemanticNoteContentRepository;
    const service = new SemanticNoteService(
      notes,
      embeddings,
      { modelName: 'test-embedding', embedMany },
      content,
    );

    const results = await service.search('scenario-only-token', 7, 5);

    expect(results).toEqual([
      expect.objectContaining({
        id: 1,
        score: 1,
        transcriptPreview: expect.stringContaining('scenario-only-token'),
      }),
    ]);
    expect(embedMany.mock.calls[0][0][0]).toContain('scenario-only-token');
  });
});

function nativeDatabaseMatchesRuntime(): boolean {
  try {
    const probe = new Database(':memory:');
    probe.close();
    return true;
  } catch {
    return false;
  }
}

const describeWithNativeDatabase = nativeDatabaseMatchesRuntime()
  ? describe
  : describe.skip;

describeWithNativeDatabase('SemanticNoteContentRepository', () => {
  it('collects every text source displayed inside a note', () => {
    const database = new Database(':memory:');
    database.exec(`
      CREATE TABLE subnotes (
        id INTEGER PRIMARY KEY, note_id INTEGER, content_type TEXT, content TEXT
      );
      CREATE TABLE knowledge_templates (
        id INTEGER PRIMARY KEY, name TEXT, prompt TEXT
      );
      CREATE TABLE knowledge_outputs (
        id INTEGER PRIMARY KEY, note_id INTEGER, template_id INTEGER,
        content_type TEXT, content TEXT
      );
      CREATE TABLE structured_notes (note_id INTEGER PRIMARY KEY, payload TEXT);
      CREATE TABLE scenario_knowledge (note_id INTEGER PRIMARY KEY, payload TEXT);
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY, note_id INTEGER, title TEXT, date_string TEXT
      );
      CREATE TABLE ai_conversations (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE ai_messages (
        id INTEGER PRIMARY KEY, conversation_id INTEGER, role TEXT, content TEXT
      );
      CREATE TABLE conversation_contexts (
        conversation_id INTEGER, note_id INTEGER
      );

      INSERT INTO subnotes VALUES (1, 1, 'note', 'subnote-token');
      INSERT INTO knowledge_templates VALUES (1, 'Legacy template', 'prompt');
      INSERT INTO knowledge_outputs
        VALUES (1, 1, 1, 'markdown', 'legacy-output-token');
      INSERT INTO structured_notes VALUES (
        1,
        '{"summary":"structured-summary-token","tasks":[{"title":"structured-task-token"}]}'
      );
      INSERT INTO scenario_knowledge VALUES (
        1,
        '{"templateName":"Meeting","sections":[{"title":"Topics","items":["scenario-token"]}]}'
      );
      INSERT INTO todos VALUES (1, 1, 'todo-token', 'tomorrow');
      INSERT INTO ai_conversations VALUES (1, 'conversation-title-token');
      INSERT INTO ai_messages VALUES (1, 1, 'assistant', 'conversation-message-token');
      INSERT INTO conversation_contexts VALUES (1, 1);
    `);

    const content = new SemanticNoteContentRepository(database)
      .findAllByNote(1)
      .join('\n');

    expect(content).toContain('subnote-token');
    expect(content).toContain('legacy-output-token');
    expect(content).toContain('structured-summary-token');
    expect(content).toContain('structured-task-token');
    expect(content).toContain('scenario-token');
    expect(content).toContain('todo-token');
    expect(content).toContain('conversation-title-token');
    expect(content).toContain('conversation-message-token');
    expect(content).not.toContain('"summary"');
    database.close();
  });
});
