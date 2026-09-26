import Database from 'better-sqlite3';
import TrashService from '../TrashService';

const FIRST_TIME = '2026-08-19T10:00:00.000Z';
const SECOND_TIME = '2026-08-19T11:00:00.000Z';

function createDatabase(): Database.Database {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      last_opened_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trashed_at TEXT
    );
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT,
      audio_relative_path TEXT,
      transcript TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      pinned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trashed_at TEXT,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE TABLE subnotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      date_string TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trashed_at TEXT
    );
    CREATE TABLE ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
    );
    CREATE TABLE conversation_contexts (
      conversation_id INTEGER NOT NULL,
      note_id INTEGER NOT NULL,
      PRIMARY KEY(conversation_id, note_id),
      FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE knowledge_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      scenario_definition TEXT,
      normalized_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trashed_at TEXT
    );
    CREATE TABLE knowledge_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY(template_id) REFERENCES knowledge_templates(id) ON DELETE CASCADE
    );
  `);
  return database;
}

function insertWorkspace(database: Database.Database, name: string): number {
  return Number(
    database
      .prepare(
        `INSERT INTO workspaces (name, created_at, updated_at)
        VALUES (?, ?, ?)`,
      )
      .run(name, FIRST_TIME, SECOND_TIME).lastInsertRowid,
  );
}

function insertNote(
  database: Database.Database,
  workspaceId: number,
  name: string,
  transcript: string,
  audioRelativePath: string | null = null,
): number {
  return Number(
    database
      .prepare(
        `INSERT INTO notes (
          workspace_id, name, audio_relative_path, transcript, is_pinned,
          pinned_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        workspaceId,
        name,
        audioRelativePath,
        transcript,
        FIRST_TIME,
        FIRST_TIME,
        SECOND_TIME,
      ).lastInsertRowid,
  );
}

function insertTemplate(database: Database.Database, name: string): number {
  return Number(
    database
      .prepare(
        `INSERT INTO knowledge_templates (
          name, prompt, created_at, updated_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .run(name, 'Extract decisions and risks', FIRST_TIME, SECOND_TIME)
      .lastInsertRowid,
  );
}

/** Jest normally runs under Node while this repo installs the Electron ABI. */
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

describeWithNativeDatabase('TrashService', () => {
  let database: Database.Database;
  let discardRecording: jest.Mock;
  let service: TrashService;

  beforeEach(() => {
    database = createDatabase();
    discardRecording = jest.fn(() => ({ deleted: true, reason: 'deleted' }));
    service = new TrashService({
      database,
      recordingStorage: { discardRecording },
    });
  });

  afterEach(() => database.close());

  it('moves and restores the same note without changing its content state', () => {
    const workspaceId = insertWorkspace(database, 'Research');
    const noteId = insertNote(database, workspaceId, 'Interview', 'Keep me');

    service.moveNote(noteId);
    const trashed = service.list({ filter: 'note' });
    expect(trashed.total).toBe(1);
    expect(trashed.items[0]).toMatchObject({
      itemType: 'note',
      id: noteId,
      originalWorkspaceId: workspaceId,
    });

    service.restore({ itemType: 'note', id: noteId });
    const row = database
      .prepare(
        `SELECT trashed_at, is_pinned, pinned_at, created_at, updated_at
        FROM notes WHERE id = ?`,
      )
      .get(noteId) as Record<string, unknown>;
    expect(row).toEqual({
      trashed_at: null,
      is_pinned: 1,
      pinned_at: FIRST_TIME,
      created_at: FIRST_TIME,
      updated_at: SECOND_TIME,
    });
  });

  it('absorbs previously trashed notes into one workspace item', () => {
    const workspaceId = insertWorkspace(database, 'August');
    const firstNoteId = insertNote(
      database,
      workspaceId,
      'Earlier removal',
      'first',
    );
    insertNote(database, workspaceId, 'Still active', 'second');

    service.moveNote(firstNoteId);
    expect(service.count()).toBe(1);
    service.moveWorkspace(workspaceId);

    const result = service.list({ filter: 'all' });
    expect(result.total).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        itemType: 'workspace',
        id: workspaceId,
        noteCount: 2,
      }),
    ]);

    service.restore({ itemType: 'workspace', id: workspaceId });
    const activeNotes = database
      .prepare(
        `SELECT COUNT(*) AS count FROM notes
        WHERE workspace_id = ? AND trashed_at IS NULL`,
      )
      .get(workspaceId) as { count: number };
    expect(activeNotes.count).toBe(2);
  });

  it('returns a workspace when the search matches a contained note', () => {
    const workspaceId = insertWorkspace(database, 'General');
    insertNote(
      database,
      workspaceId,
      'Meeting arranged at nine',
      'tomorrow morning',
    );
    service.moveWorkspace(workspaceId);

    const result = service.list({ search: 'arranged', filter: 'all' });
    expect(result.items).toEqual([
      expect.objectContaining({
        itemType: 'workspace',
        id: workspaceId,
        matchedContainedNote: true,
      }),
    ]);
  });

  it('permanently deletes note attachments but preserves its conversation', () => {
    const workspaceId = insertWorkspace(database, 'Calls');
    const noteId = insertNote(
      database,
      workspaceId,
      'Client call',
      'transcript',
      'recordings/call.wav',
    );
    const conversationId = Number(
      database
        .prepare(
          `INSERT INTO ai_conversations (name, created_at, updated_at)
          VALUES (?, ?, ?)`,
        )
        .run('Follow-up', FIRST_TIME, SECOND_TIME).lastInsertRowid,
    );
    database
      .prepare(
        `INSERT INTO ai_messages (conversation_id, role, content, created_at)
        VALUES (?, 'assistant', 'Saved answer', ?)`,
      )
      .run(conversationId, FIRST_TIME);
    database
      .prepare(
        `INSERT INTO conversation_contexts (conversation_id, note_id)
        VALUES (?, ?)`,
      )
      .run(conversationId, noteId);
    database
      .prepare(
        `INSERT INTO subnotes (note_id, content_type, content, created_at)
        VALUES (?, 'summary', 'Attached', ?)`,
      )
      .run(noteId, FIRST_TIME);
    database
      .prepare(
        `INSERT INTO todos (
          note_id, title, date_string, is_completed, created_at, updated_at
        ) VALUES (?, 'Follow up', 'tomorrow', 0, ?, ?)`,
      )
      .run(noteId, FIRST_TIME, SECOND_TIME);

    service.moveNote(noteId);
    service.permanentlyDelete({ itemType: 'note', id: noteId });

    expect(
      database.prepare('SELECT 1 FROM notes WHERE id = ?').get(noteId),
    ).toBeUndefined();
    expect(
      database
        .prepare('SELECT content FROM ai_messages WHERE conversation_id = ?')
        .get(conversationId),
    ).toEqual({ content: 'Saved answer' });
    expect(
      database
        .prepare(
          'SELECT 1 FROM conversation_contexts WHERE conversation_id = ?',
        )
        .get(conversationId),
    ).toBeUndefined();
    expect(discardRecording).toHaveBeenCalledWith('recordings/call.wav');
  });

  it('permanently deletes a workspace and its Notes but preserves conversations', () => {
    const workspaceId = insertWorkspace(database, 'Finished project');
    const firstNoteId = insertNote(
      database,
      workspaceId,
      'First call',
      'first transcript',
      'recordings/first.wav',
    );
    insertNote(
      database,
      workspaceId,
      'Second call',
      'second transcript',
      'recordings/second.wav',
    );
    const conversationId = Number(
      database
        .prepare(
          `INSERT INTO ai_conversations (name, created_at, updated_at)
          VALUES (?, ?, ?)`,
        )
        .run('Project follow-up', FIRST_TIME, SECOND_TIME).lastInsertRowid,
    );
    database
      .prepare(
        `INSERT INTO ai_messages (conversation_id, role, content, created_at)
        VALUES (?, 'assistant', 'Retain this answer', ?)`,
      )
      .run(conversationId, FIRST_TIME);
    database
      .prepare(
        `INSERT INTO conversation_contexts (conversation_id, note_id)
        VALUES (?, ?)`,
      )
      .run(conversationId, firstNoteId);

    service.moveWorkspace(workspaceId);
    service.permanentlyDelete({ itemType: 'workspace', id: workspaceId });

    expect(
      database
        .prepare('SELECT 1 FROM workspaces WHERE id = ?')
        .get(workspaceId),
    ).toBeUndefined();
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM notes WHERE workspace_id = ?')
        .get(workspaceId),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare('SELECT content FROM ai_messages WHERE conversation_id = ?')
        .get(conversationId),
    ).toEqual({ content: 'Retain this answer' });
    expect(
      database
        .prepare(
          'SELECT 1 FROM conversation_contexts WHERE conversation_id = ?',
        )
        .get(conversationId),
    ).toBeUndefined();
    expect(discardRecording).toHaveBeenCalledTimes(2);
    expect(discardRecording).toHaveBeenCalledWith('recordings/first.wav');
    expect(discardRecording).toHaveBeenCalledWith('recordings/second.wav');
  });

  it('rejects irreversible deletion of an active item', () => {
    const workspaceId = insertWorkspace(database, 'Protected');
    const noteId = insertNote(database, workspaceId, 'Active', 'safe');

    expect(() =>
      service.permanentlyDelete({ itemType: 'note', id: noteId }),
    ).toThrow('Note not found in Trash');
    expect(
      database.prepare('SELECT 1 FROM notes WHERE id = ?').get(noteId),
    ).toBeDefined();
  });

  it('keeps filters isolated and orders all item types by trashed time', () => {
    const noteWorkspaceId = insertWorkspace(database, 'Notes');
    const noteId = insertNote(database, noteWorkspaceId, 'Alpha', 'note');
    const workspaceId = insertWorkspace(database, 'Workspace');
    const templateId = insertTemplate(database, 'Review template');

    service.moveNote(noteId);
    service.moveWorkspace(workspaceId);
    service.moveTemplate(templateId);

    expect(service.list({ filter: 'note' }).items).toEqual([
      expect.objectContaining({ itemType: 'note', id: noteId }),
    ]);
    expect(service.list({ filter: 'workspace' }).items).toEqual([
      expect.objectContaining({ itemType: 'workspace', id: workspaceId }),
    ]);
    expect(service.list({ filter: 'template' }).items).toEqual([
      expect.objectContaining({ itemType: 'template', id: templateId }),
    ]);
    expect(service.count()).toBe(3);
  });
});

describeWithNativeDatabase('知识模板的回收站', () => {
  let database: Database.Database;
  let service: TrashService;
  let noteId: number;

  beforeEach(() => {
    database = createDatabase();
    service = new TrashService({ database });
    const workspaceId = insertWorkspace(database, 'Meeting');
    noteId = insertNote(database, workspaceId, 'Weekly sync', 'transcript');
  });

  afterEach(() => database.close());

  it('移入回收站后保留模板和历史生成结果', () => {
    const templateId = insertTemplate(database, 'Decision review');
    database
      .prepare(
        `INSERT INTO knowledge_outputs (
          note_id, template_id, content_type, content, created_at, updated_at
        ) VALUES (?, ?, 'structured_note', 'saved output', ?, ?)`,
      )
      .run(noteId, templateId, FIRST_TIME, SECOND_TIME);

    service.moveTemplate(templateId);

    expect(service.list({ filter: 'template' }).items).toEqual([
      expect.objectContaining({
        itemType: 'template',
        id: templateId,
        outputCount: 1,
      }),
    ]);
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM knowledge_outputs').get(),
    ).toEqual({ count: 1 });
  });

  it('恢复后重新成为可用模板', () => {
    const templateId = insertTemplate(database, 'Interview guide');
    service.moveTemplate(templateId);

    service.restore({ itemType: 'template', id: templateId });

    expect(
      database
        .prepare('SELECT trashed_at FROM knowledge_templates WHERE id = ?')
        .get(templateId),
    ).toEqual({ trashed_at: null });
    expect(service.list({ filter: 'template' }).items).toHaveLength(0);
  });

  it('只有从回收站彻底删除时才级联删除历史输出', () => {
    const templateId = insertTemplate(database, 'Lecture outline');
    database
      .prepare(
        `INSERT INTO knowledge_outputs (
          note_id, template_id, content_type, content, created_at, updated_at
        ) VALUES (?, ?, 'structured_note', 'saved output', ?, ?)`,
      )
      .run(noteId, templateId, FIRST_TIME, SECOND_TIME);
    service.moveTemplate(templateId);

    service.permanentlyDelete({ itemType: 'template', id: templateId });

    expect(
      database
        .prepare('SELECT 1 FROM knowledge_templates WHERE id = ?')
        .get(templateId),
    ).toBeUndefined();
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM knowledge_outputs').get(),
    ).toEqual({ count: 0 });
  });
});

describeWithNativeDatabase('对话的回收站', () => {
  /** 建一条会话并挂两条消息，返回会话 id。 */
  function seedConversation(
    database: Database.Database,
    name = '关于银行材料',
  ): number {
    const info = database
      .prepare(
        `INSERT INTO ai_conversations (name, created_at, updated_at)
         VALUES (?, ?, ?)`,
      )
      .run(name, FIRST_TIME, FIRST_TIME);
    const id = Number(info.lastInsertRowid);
    [1, 2].forEach((index) => {
      database
        .prepare(
          `INSERT INTO ai_messages (conversation_id, role, content, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(id, index === 1 ? 'user' : 'assistant', `m${index}`, FIRST_TIME);
    });
    return id;
  }

  it('移入回收站只打时间戳，消息一条不少', () => {
    const database = createDatabase();
    const service = new TrashService({ database });
    const id = seedConversation(database);

    const result = service.moveConversation(id);

    expect(result.itemType).toBe('conversation');
    expect(result.name).toBe('关于银行材料');
    const row = database
      .prepare('SELECT trashed_at FROM ai_conversations WHERE id = ?')
      .get(id) as { trashed_at: string | null };
    expect(row.trashed_at).not.toBeNull();
    const messages = database
      .prepare(
        'SELECT COUNT(*) AS c FROM ai_messages WHERE conversation_id = ?',
      )
      .get(id) as { c: number };
    expect(messages.c).toBe(2);
  });

  it('已经在回收站里的不能再删一次', () => {
    const database = createDatabase();
    const service = new TrashService({ database });
    const id = seedConversation(database);
    service.moveConversation(id);

    expect(() => service.moveConversation(id)).toThrow();
  });

  it('回收站列表里能看到它，并带上消息条数', () => {
    const database = createDatabase();
    const service = new TrashService({ database });
    const id = seedConversation(database);
    service.moveConversation(id);

    const listed = service
      .list({ filter: 'conversation' })
      .items.find((item) => item.id === id);

    expect(listed).toMatchObject({
      itemType: 'conversation',
      name: '关于银行材料',
      messageCount: 2,
    });
    expect(service.count()).toBe(1);
  });

  it('按笔记 / 工作空间筛选时不会混进来', () => {
    const database = createDatabase();
    const service = new TrashService({ database });
    service.moveConversation(seedConversation(database));

    expect(service.list({ filter: 'note' }).items).toHaveLength(0);
    expect(service.list({ filter: 'workspace' }).items).toHaveLength(0);
    expect(service.list({ filter: 'all' }).items).toHaveLength(1);
  });

  it('搜索按会话名匹配', () => {
    const database = createDatabase();
    const service = new TrashService({ database });
    service.moveConversation(seedConversation(database, '周会纪要'));

    expect(service.list({ search: '周会' }).items).toHaveLength(1);
    expect(service.list({ search: '不存在的词' }).items).toHaveLength(0);
  });

  it('恢复之后回到正常列表', () => {
    const database = createDatabase();
    const service = new TrashService({ database });
    const id = seedConversation(database);
    service.moveConversation(id);

    service.restore({ itemType: 'conversation', id });

    const row = database
      .prepare('SELECT trashed_at FROM ai_conversations WHERE id = ?')
      .get(id) as { trashed_at: string | null };
    expect(row.trashed_at).toBeNull();
    expect(service.list({ filter: 'conversation' }).items).toHaveLength(0);
  });

  it('彻底删除会连消息一起清掉，不留孤儿', () => {
    const database = createDatabase();
    const service = new TrashService({ database });
    const id = seedConversation(database);
    service.moveConversation(id);

    service.permanentlyDelete({ itemType: 'conversation', id });

    const conversations = database
      .prepare('SELECT COUNT(*) AS c FROM ai_conversations')
      .get() as { c: number };
    const messages = database
      .prepare('SELECT COUNT(*) AS c FROM ai_messages')
      .get() as { c: number };
    expect(conversations.c).toBe(0);
    expect(messages.c).toBe(0);
  });

  it('没在回收站里的不能恢复、也不能彻底删除', () => {
    const database = createDatabase();
    const service = new TrashService({ database });
    const id = seedConversation(database);

    expect(() => service.restore({ itemType: 'conversation', id })).toThrow();
    expect(() =>
      service.permanentlyDelete({ itemType: 'conversation', id }),
    ).toThrow();
  });
});
