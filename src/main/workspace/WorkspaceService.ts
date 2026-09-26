import Database from 'better-sqlite3';
import { DatabaseManager } from '../database/DatabaseManager';
import { BlobStorage } from '../database/BlobStorage';
import TrashService from '../trash/TrashService';

// what you need to know about a workspace(just summary to show)
// data structure of a workspace
export type WorkspaceSummary = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  recent_at: string;
  note_count: number;
  pinned_count: number;
};

export type WorkspaceSubnote = {
  id: number;
  content_type: string;
  content: string;
  created_at: string;
};

export type WorkspaceKnowledgeOutput = {
  id: number;
  template_name: string;
  content_type: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceAiMessage = {
  id: number;
  role: string;
  content: string;
  created_at: string;
};

export type WorkspaceAiConversation = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  messages: WorkspaceAiMessage[];
};

export type WorkspaceNote = {
  id: number;
  name: string | null;
  audio_relative_path: string | null;
  transcript: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  subnotes: WorkspaceSubnote[];
  knowledge_outputs: WorkspaceKnowledgeOutput[];
  conversations: WorkspaceAiConversation[];
};

export type WorkspaceAudioData = {
  mime_type: string;
  bytes: Uint8Array;
};

export type SaveTranscriptionNoteRequest = {
  workspaceId: number;
  name?: string | null;
  transcript: string;
  summaries?: string[];
  audioRelativePath?: string | null;
};

export type SaveTranscriptionNoteResult = {
  noteId: number;
  workspaceId: number;
  name: string;
};

/**
 * 工作空间业务服务：集中处理验证与数据库操作。
 * Workspace service: encapsulates validation and database operations.
 *
 */
export class WorkspaceService {
  // still read-only to avoid reassigning database causeing unexpected problems.
  private readonly database: Database.Database;

  // initialize
  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  // 获取工作空间列表及其笔记统计
  // Get a list of workspaces with note statistics
  public listWorkspaces(rawLimit: unknown = 6): WorkspaceSummary[] {
    const limit = WorkspaceService.normalizeLimit(rawLimit);

    // 首页按最近进入时间排序；updated_at 只描述内容或名称的修改时间。
    // Home ordering follows access time, never content modification time.
    const statement = this.database.prepare(`
      SELECT workspaces.id, workspaces.name,
        workspaces.created_at, workspaces.updated_at,
        workspaces.last_opened_at,
        COALESCE(workspaces.last_opened_at, workspaces.created_at) AS recent_at,
        COUNT(notes.id) AS note_count,
        COALESCE(SUM(notes.is_pinned), 0) AS pinned_count
      FROM workspaces
      LEFT JOIN notes ON notes.workspace_id = workspaces.id
        AND notes.trashed_at IS NULL
      WHERE workspaces.trashed_at IS NULL
      GROUP BY workspaces.id
      ORDER BY COALESCE(workspaces.last_opened_at, workspaces.created_at) DESC,
        workspaces.id DESC
      LIMIT ?
    `);

    const workspaces = statement.all(limit) as WorkspaceSummary[];

    return workspaces;
  }

  // 创建一个新的工作空间
  // Create a new workspace
  public createWorkspace(rawName: unknown): WorkspaceSummary {
    const name = WorkspaceService.normalizeName(rawName);
    const now = new Date().toISOString();

    // 先准备并执行新增语句，run() 用于 INSERT、UPDATE 和 DELETE。
    const insertStatement = this.database.prepare(
      'INSERT INTO workspaces (name, created_at, updated_at) VALUES (?, ?, ?)',
    );
    const insertResult = insertStatement.run(name, now, now);

    return this.getWorkspaceSummary(insertResult.lastInsertRowid);
  }

  /**
   * 进入详情时记录最近打开时间；不修改 updated_at。
   * Opening a Workspace changes access order without claiming its content changed.
   */
  public openWorkspace(rawId: unknown): WorkspaceSummary {
    const id = WorkspaceService.normalizeId(rawId);
    const statement = this.database.prepare(
      `UPDATE workspaces SET last_opened_at = ?
      WHERE id = ? AND trashed_at IS NULL`,
    );
    const result = statement.run(new Date().toISOString(), id);

    if (result.changes === 0) {
      throw new Error('工作空间不存在 / Workspace not found');
    }

    return this.getWorkspaceSummary(id);
  }

  // 获取指定工作空间中的笔记
  // Get notes in a specific workspace
  public listNotes(rawWorkspaceId: unknown): WorkspaceNote[] {
    const workspaceId = WorkspaceService.normalizeId(rawWorkspaceId);

    // 先显示置顶笔记，再显示最近更新的普通笔记
    // Pinned notes appear first, followed by recently updated notes.
    const noteStatement = this.database.prepare(
      `SELECT id, name, audio_relative_path, transcript, is_pinned,
        created_at, updated_at
      FROM notes WHERE workspace_id = ? AND trashed_at IS NULL
      ORDER BY is_pinned DESC, pinned_at DESC, updated_at DESC`,
    );
    const noteRows = noteStatement.all(workspaceId) as Array<
      Omit<WorkspaceNote, 'subnotes' | 'knowledge_outputs' | 'conversations'>
    >;

    const subnoteStatement = this.database.prepare(
      `SELECT id, content_type, content, created_at
      FROM subnotes WHERE note_id = ? ORDER BY created_at ASC`,
    );
    const outputStatement = this.database.prepare(
      `SELECT knowledge_outputs.id, knowledge_templates.name AS template_name,
        knowledge_outputs.content_type, knowledge_outputs.content,
        knowledge_outputs.created_at, knowledge_outputs.updated_at
      FROM knowledge_outputs
      JOIN knowledge_templates
        ON knowledge_templates.id = knowledge_outputs.template_id
      WHERE knowledge_outputs.note_id = ?
      ORDER BY knowledge_outputs.updated_at DESC`,
    );
    const conversationStatement = this.database.prepare(
      `SELECT ai_conversations.id, ai_conversations.name,
        ai_conversations.created_at, ai_conversations.updated_at
      FROM conversation_contexts
      JOIN ai_conversations
        ON ai_conversations.id = conversation_contexts.conversation_id
      WHERE conversation_contexts.note_id = ?
      ORDER BY ai_conversations.updated_at DESC`,
    );
    const messageStatement = this.database.prepare(
      `SELECT id, role, content, created_at
      FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    );

    const notes: WorkspaceNote[] = [];
    // 普通循环让多阶段查询与组装过程保持可读。
    // eslint-disable-next-line no-restricted-syntax
    for (const note of noteRows) {
      const subnotes = subnoteStatement.all(note.id) as WorkspaceSubnote[];
      const knowledgeOutputs = outputStatement.all(
        note.id,
      ) as WorkspaceKnowledgeOutput[];
      const conversationRows = conversationStatement.all(note.id) as Array<
        Omit<WorkspaceAiConversation, 'messages'>
      >;
      const conversations: WorkspaceAiConversation[] = [];

      // eslint-disable-next-line no-restricted-syntax
      for (const conversation of conversationRows) {
        const messages = messageStatement.all(
          conversation.id,
        ) as WorkspaceAiMessage[];
        conversations.push({ ...conversation, messages });
      }

      notes.push({
        ...note,
        subnotes,
        knowledge_outputs: knowledgeOutputs,
        conversations,
      });
    }

    return notes;
  }

  public async getNoteAudio(
    rawWorkspaceId: unknown,
    rawNoteId: unknown,
  ): Promise<WorkspaceAudioData | null> {
    const workspaceId = WorkspaceService.normalizeId(rawWorkspaceId);
    const noteId = WorkspaceService.normalizeId(rawNoteId);
    const statement = this.database.prepare(
      `SELECT notes.audio_relative_path FROM notes
      JOIN workspaces ON workspaces.id = notes.workspace_id
      WHERE notes.id = ? AND notes.workspace_id = ?
        AND notes.trashed_at IS NULL AND workspaces.trashed_at IS NULL`,
    );
    const row = statement.get(noteId, workspaceId) as
      | { audio_relative_path: string | null }
      | undefined;

    if (!row?.audio_relative_path) return null;

    const storage = BlobStorage.getInstance();
    if (!storage.exists(row.audio_relative_path)) return null;

    const audio = storage.load(row.audio_relative_path);
    const buffer = await audio.arrayBuffer();
    return {
      mime_type: WorkspaceService.getAudioMimeType(row.audio_relative_path),
      bytes: new Uint8Array(buffer),
    };
  }

  public saveTranscriptionNote(
    rawRequest: unknown,
  ): SaveTranscriptionNoteResult {
    if (typeof rawRequest !== 'object' || rawRequest === null) {
      throw new Error('无效的保存请求 / Invalid save request');
    }

    const request = rawRequest as Partial<SaveTranscriptionNoteRequest>;
    const workspaceId = WorkspaceService.normalizeId(request.workspaceId);
    this.getWorkspaceSummary(workspaceId);

    const transcript = String(request.transcript ?? '').trim();
    if (!transcript) {
      throw new Error('转录内容不能为空 / Transcript is required');
    }

    const defaultName = transcript.replace(/\s+/g, ' ').trim().slice(0, 64);
    const name = WorkspaceService.normalizeOptionalNoteName(
      request.name,
      defaultName || 'Untitled Note',
    );
    const summaries = WorkspaceService.normalizeSummaries(request.summaries);
    const audioRelativePath = WorkspaceService.normalizeAudioRelativePath(
      request.audioRelativePath,
    );
    const now = new Date().toISOString();

    const save = this.database.transaction(() => {
      const noteResult = this.database
        .prepare(
          `INSERT INTO notes (
            workspace_id, name, audio_relative_path, transcript,
            is_pinned, pinned_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, NULL, ?, ?)`,
        )
        .run(workspaceId, name, audioRelativePath, transcript, now, now);
      const noteId = Number(noteResult.lastInsertRowid);

      const insertSummary = this.database.prepare(
        `INSERT INTO subnotes (note_id, content_type, content, created_at)
         VALUES (?, ?, ?, ?)`,
      );
      summaries.forEach((summary, index) => {
        insertSummary.run(
          noteId,
          `AI 语义总结 ${index + 1} / Semantic summary ${index + 1}`,
          summary,
          now,
        );
      });

      this.database
        .prepare('UPDATE workspaces SET updated_at = ? WHERE id = ?')
        .run(now, workspaceId);

      return { noteId, workspaceId, name };
    });

    return save();
  }

  // 修改工作空间名称
  // Rename a workspace
  public renameWorkspace(rawId: unknown, rawName: unknown): boolean {
    const id = WorkspaceService.normalizeId(rawId);
    const name = WorkspaceService.normalizeName(rawName);
    const statement = this.database.prepare(
      `UPDATE workspaces SET name = ?, updated_at = ?
      WHERE id = ? AND trashed_at IS NULL`,
    );
    const result = statement.run(name, new Date().toISOString(), id);

    return result.changes > 0;
  }

  /** @deprecated Use the explicit Trash IPC namespace for new callers. */
  public deleteWorkspace(rawId: unknown): boolean {
    new TrashService({ database: this.database }).moveWorkspace(rawId);
    return true;
  }

  /** @deprecated Use the explicit Trash IPC namespace for new callers. */
  public deleteNote(rawId: unknown): boolean {
    new TrashService({ database: this.database }).moveNote(rawId);
    return true;
  }

  private static normalizeOptionalNoteName(
    value: unknown,
    fallback: string,
  ): string {
    if (typeof value !== 'string' || !value.trim())
      return fallback.slice(0, 80);
    return value.trim().slice(0, 80);
  }

  private static normalizeSummaries(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100)
      .map((item) => item.slice(0, 12000));
  }

  private static normalizeAudioRelativePath(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') {
      throw new Error('无效的录音路径 / Invalid recording path');
    }

    const normalized = value.replaceAll('\\', '/');
    const segments = normalized.split('/');
    if (
      segments.length !== 2 ||
      segments[0] !== 'recordings' ||
      !segments[1] ||
      segments[1] === '.' ||
      segments[1] === '..'
    ) {
      throw new Error('录音不在受管目录中 / Recording is not managed');
    }

    const storage = BlobStorage.getInstance();
    if (!storage.exists(normalized)) {
      throw new Error('关联录音不存在 / Linked recording was not found');
    }
    return normalized;
  }

  private static normalizeName(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('工作空间名称不能为空 / Workspace name is required');
    }

    return value.trim().slice(0, 80);
  }

  private static normalizeId(value: unknown): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('无效的工作空间 ID / Invalid workspace ID');
    }
    return id;
  }

  private static normalizeLimit(value: unknown): number {
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error(
        '工作空间数量必须为 1 到 100 / Workspace limit must be 1-100',
      );
    }
    return limit;
  }

  private getWorkspaceSummary(id: number | bigint): WorkspaceSummary {
    const statement = this.database.prepare(
      `SELECT workspaces.id, workspaces.name,
        workspaces.created_at, workspaces.updated_at,
        workspaces.last_opened_at,
        COALESCE(workspaces.last_opened_at, workspaces.created_at) AS recent_at,
        COUNT(notes.id) AS note_count,
        COALESCE(SUM(notes.is_pinned), 0) AS pinned_count
      FROM workspaces
      LEFT JOIN notes ON notes.workspace_id = workspaces.id
        AND notes.trashed_at IS NULL
      WHERE workspaces.id = ? AND workspaces.trashed_at IS NULL
      GROUP BY workspaces.id`,
    );
    const workspace = statement.get(id) as WorkspaceSummary | undefined;

    if (!workspace) {
      throw new Error('工作空间不存在 / Workspace not found');
    }
    return workspace;
  }

  private static getAudioMimeType(relativePath: string): string {
    const extension = relativePath.toLocaleLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      flac: 'audio/flac',
      aac: 'audio/aac',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
      webm: 'audio/webm',
      ogg: 'audio/ogg',
    };
    return mimeTypes[extension ?? ''] ?? 'application/octet-stream';
  }
}
