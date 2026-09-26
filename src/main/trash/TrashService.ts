import Database from 'better-sqlite3';
import {
  TrashActionResult,
  TrashActionTarget,
  TrashFilter,
  TrashItem,
  TrashListQuery,
  TrashListResult,
} from '@shared/types/TrashTypes';
import { BlobStorage } from '../database/BlobStorage';
import { DatabaseManager } from '../database/DatabaseManager';
import RecordingStorageService from '../audio/RecordingStorageService';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 200;

type RecordingDiscarder = Pick<RecordingStorageService, 'discardRecording'>;

type TrashServiceDependencies = {
  database?: Database.Database;
  recordingStorage?: RecordingDiscarder;
};

type NoteTrashRow = {
  item_type: 'note';
  id: number;
  name: string | null;
  trashed_at: string;
  original_workspace_id: number;
  original_workspace_name: string;
  preview: string;
};

type ConversationTrashRow = {
  item_type: 'conversation';
  id: number;
  name: string;
  trashed_at: string;
  message_count: number;
};

type WorkspaceTrashRow = {
  item_type: 'workspace';
  id: number;
  name: string;
  trashed_at: string;
  note_count: number;
  matched_contained_note: number;
};

type TemplateTrashRow = {
  item_type: 'template';
  id: number;
  name: string;
  trashed_at: string;
  preview: string;
  output_count: number;
};

/**
 * Owns the recoverable content lifecycle. Normal content repositories only
 * see active rows; this service is the sole boundary allowed to read or mutate
 * trashed rows and to perform irreversible deletion.
 */
export default class TrashService {
  private readonly database: Database.Database;

  private recordingStorage: RecordingDiscarder | null;

  public constructor(dependencies: TrashServiceDependencies = {}) {
    this.database =
      dependencies.database ?? DatabaseManager.getInstance().getDatabase();
    this.recordingStorage = dependencies.recordingStorage ?? null;
  }

  public list(rawQuery: unknown = {}): TrashListResult {
    const query = TrashService.normalizeListQuery(rawQuery);
    const searchPattern = TrashService.toLikePattern(query.search);
    const fetchLimit = query.page * query.pageSize;
    const bindings = { searchPattern, limit: fetchLimit };
    const items: TrashItem[] = [];
    let total = 0;

    if (query.filter === 'all' || query.filter === 'note') {
      const searchClause = searchPattern
        ? `AND (
            COALESCE(notes.name, '') LIKE @searchPattern ESCAPE '\\'
            OR notes.transcript LIKE @searchPattern ESCAPE '\\'
            OR workspaces.name LIKE @searchPattern ESCAPE '\\'
          )`
        : '';
      const noteRows = this.database
        .prepare(
          `SELECT 'note' AS item_type, notes.id, notes.name,
            notes.trashed_at, workspaces.id AS original_workspace_id,
            workspaces.name AS original_workspace_name,
            SUBSTR(REPLACE(REPLACE(notes.transcript, CHAR(10), ' '), CHAR(13), ' '), 1, 180) AS preview
          FROM notes
          JOIN workspaces ON workspaces.id = notes.workspace_id
          WHERE notes.trashed_at IS NOT NULL
            AND workspaces.trashed_at IS NULL
            ${searchClause}
          ORDER BY notes.trashed_at DESC, notes.id DESC
          LIMIT @limit`,
        )
        .all(bindings) as NoteTrashRow[];
      const noteCount = this.database
        .prepare(
          `SELECT COUNT(*) AS count
          FROM notes
          JOIN workspaces ON workspaces.id = notes.workspace_id
          WHERE notes.trashed_at IS NOT NULL
            AND workspaces.trashed_at IS NULL
            ${searchClause}`,
        )
        .get(bindings) as { count: number };
      total += Number(noteCount.count);
      items.push(
        ...noteRows.map((row) => ({
          itemType: 'note' as const,
          id: row.id,
          name: row.name ?? '',
          trashedAt: row.trashed_at,
          originalWorkspaceId: row.original_workspace_id,
          originalWorkspaceName: row.original_workspace_name,
          preview: row.preview,
        })),
      );
    }

    if (query.filter === 'all' || query.filter === 'workspace') {
      const workspaceNameMatches = searchPattern
        ? `workspaces.name LIKE @searchPattern ESCAPE '\\'`
        : '0';
      const containedNoteMatches = searchPattern
        ? `EXISTS (
            SELECT 1 FROM notes AS contained_notes
            WHERE contained_notes.workspace_id = workspaces.id
              AND (
                COALESCE(contained_notes.name, '') LIKE @searchPattern ESCAPE '\\'
                OR contained_notes.transcript LIKE @searchPattern ESCAPE '\\'
              )
          )`
        : '0';
      const searchClause = searchPattern
        ? `AND (${workspaceNameMatches} OR ${containedNoteMatches})`
        : '';
      const workspaceRows = this.database
        .prepare(
          `SELECT 'workspace' AS item_type, workspaces.id, workspaces.name,
            workspaces.trashed_at, COUNT(notes.id) AS note_count,
            CASE
              WHEN ${workspaceNameMatches} THEN 0
              WHEN ${containedNoteMatches} THEN 1
              ELSE 0
            END AS matched_contained_note
          FROM workspaces
          LEFT JOIN notes ON notes.workspace_id = workspaces.id
          WHERE workspaces.trashed_at IS NOT NULL
            ${searchClause}
          GROUP BY workspaces.id
          ORDER BY workspaces.trashed_at DESC, workspaces.id DESC
          LIMIT @limit`,
        )
        .all(bindings) as WorkspaceTrashRow[];
      const workspaceCount = this.database
        .prepare(
          `SELECT COUNT(*) AS count
          FROM workspaces
          WHERE workspaces.trashed_at IS NOT NULL
            ${searchClause}`,
        )
        .get(bindings) as { count: number };
      total += Number(workspaceCount.count);
      items.push(
        ...workspaceRows.map((row) => ({
          itemType: 'workspace' as const,
          id: row.id,
          name: row.name,
          trashedAt: row.trashed_at,
          noteCount: Number(row.note_count),
          matchedContainedNote: row.matched_contained_note === 1,
        })),
      );
    }

    if (query.filter === 'all' || query.filter === 'conversation') {
      const searchClause = searchPattern
        ? `AND ai_conversations.name LIKE @searchPattern ESCAPE '\\'`
        : '';
      const conversationRows = this.database
        .prepare(
          `SELECT 'conversation' AS item_type, ai_conversations.id,
            ai_conversations.name, ai_conversations.trashed_at,
            (SELECT COUNT(*) FROM ai_messages
              WHERE ai_messages.conversation_id = ai_conversations.id) AS message_count
          FROM ai_conversations
          WHERE ai_conversations.trashed_at IS NOT NULL
            ${searchClause}
          ORDER BY ai_conversations.trashed_at DESC, ai_conversations.id DESC
          LIMIT @limit`,
        )
        .all(bindings) as ConversationTrashRow[];
      const conversationCount = this.database
        .prepare(
          `SELECT COUNT(*) AS count
          FROM ai_conversations
          WHERE ai_conversations.trashed_at IS NOT NULL
            ${searchClause}`,
        )
        .get(bindings) as { count: number };
      total += Number(conversationCount.count);
      items.push(
        ...conversationRows.map((row) => ({
          itemType: 'conversation' as const,
          id: row.id,
          name: row.name,
          trashedAt: row.trashed_at,
          messageCount: Number(row.message_count),
        })),
      );
    }

    if (query.filter === 'all' || query.filter === 'template') {
      const searchClause = searchPattern
        ? `AND (
            knowledge_templates.name LIKE @searchPattern ESCAPE '\\'
            OR knowledge_templates.prompt LIKE @searchPattern ESCAPE '\\'
          )`
        : '';
      const templateRows = this.database
        .prepare(
          `SELECT 'template' AS item_type, knowledge_templates.id,
            knowledge_templates.name, knowledge_templates.trashed_at,
            SUBSTR(REPLACE(REPLACE(knowledge_templates.prompt, CHAR(10), ' '), CHAR(13), ' '), 1, 180) AS preview,
            (SELECT COUNT(*) FROM knowledge_outputs
              WHERE knowledge_outputs.template_id = knowledge_templates.id) AS output_count
          FROM knowledge_templates
          WHERE knowledge_templates.trashed_at IS NOT NULL
            ${searchClause}
          ORDER BY knowledge_templates.trashed_at DESC,
            knowledge_templates.id DESC
          LIMIT @limit`,
        )
        .all(bindings) as TemplateTrashRow[];
      const templateCount = this.database
        .prepare(
          `SELECT COUNT(*) AS count
          FROM knowledge_templates
          WHERE knowledge_templates.trashed_at IS NOT NULL
            ${searchClause}`,
        )
        .get(bindings) as { count: number };
      total += Number(templateCount.count);
      items.push(
        ...templateRows.map((row) => ({
          itemType: 'template' as const,
          id: row.id,
          name: row.name,
          trashedAt: row.trashed_at,
          preview: row.preview,
          outputCount: Number(row.output_count),
        })),
      );
    }

    items.sort((left, right) => {
      const timeDifference = right.trashedAt.localeCompare(left.trashedAt);
      if (timeDifference !== 0) return timeDifference;
      return right.id - left.id;
    });

    const offset = (query.page - 1) * query.pageSize;

    return {
      items: items.slice(offset, offset + query.pageSize),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  public count(): number {
    const row = this.database
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM workspaces WHERE trashed_at IS NOT NULL)
          +
          (SELECT COUNT(*)
            FROM notes
            JOIN workspaces ON workspaces.id = notes.workspace_id
            WHERE notes.trashed_at IS NOT NULL
              AND workspaces.trashed_at IS NULL)
          +
          (SELECT COUNT(*) FROM ai_conversations
            WHERE trashed_at IS NOT NULL)
          +
          (SELECT COUNT(*) FROM knowledge_templates
            WHERE trashed_at IS NOT NULL) AS count`,
      )
      .get() as { count: number };
    return Number(row.count);
  }

  public moveNote(rawId: unknown): TrashActionResult {
    const id = TrashService.normalizeId(rawId);
    const row = this.database
      .prepare(
        `SELECT notes.id, notes.name, notes.workspace_id
        FROM notes
        JOIN workspaces ON workspaces.id = notes.workspace_id
        WHERE notes.id = ?
          AND notes.trashed_at IS NULL
          AND workspaces.trashed_at IS NULL`,
      )
      .get(id) as
      | { id: number; name: string | null; workspace_id: number }
      | undefined;
    if (!row) {
      throw new Error(
        '笔记不存在或已在回收站 / Note not found or already in Trash',
      );
    }

    const result = this.database
      .prepare('UPDATE notes SET trashed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    if (result.changes !== 1) {
      throw new Error('无法移入回收站 / Could not move Note to Trash');
    }

    return {
      itemType: 'note',
      id,
      name: row.name ?? '',
      workspaceId: row.workspace_id,
      noteCount: 0,
    };
  }

  public moveWorkspace(rawId: unknown): TrashActionResult {
    const id = TrashService.normalizeId(rawId);
    const row = this.database
      .prepare(
        `SELECT workspaces.id, workspaces.name, COUNT(notes.id) AS note_count
        FROM workspaces
        LEFT JOIN notes ON notes.workspace_id = workspaces.id
        WHERE workspaces.id = ? AND workspaces.trashed_at IS NULL
        GROUP BY workspaces.id`,
      )
      .get(id) as { id: number; name: string; note_count: number } | undefined;
    if (!row) {
      throw new Error(
        '工作空间不存在或已在回收站 / Workspace not found or already in Trash',
      );
    }

    const trashedAt = new Date().toISOString();
    const move = this.database.transaction(() => {
      this.database
        .prepare('UPDATE workspaces SET trashed_at = ? WHERE id = ?')
        .run(trashedAt, id);
      this.database
        .prepare('UPDATE notes SET trashed_at = ? WHERE workspace_id = ?')
        .run(trashedAt, id);
    });
    move();

    return {
      itemType: 'workspace',
      id,
      name: row.name,
      workspaceId: id,
      noteCount: Number(row.note_count),
    };
  }

  public restore(rawTarget: unknown): TrashActionResult {
    const target = TrashService.normalizeTarget(rawTarget);
    if (target.itemType === 'note') return this.restoreNote(target.id);
    if (target.itemType === 'conversation') {
      return this.restoreConversation(target.id);
    }
    if (target.itemType === 'template') return this.restoreTemplate(target.id);
    return this.restoreWorkspace(target.id);
  }

  public permanentlyDelete(rawTarget: unknown): TrashActionResult {
    const target = TrashService.normalizeTarget(rawTarget);
    if (target.itemType === 'note')
      return this.permanentlyDeleteNote(target.id);
    if (target.itemType === 'conversation') {
      return this.permanentlyDeleteConversation(target.id);
    }
    if (target.itemType === 'template') {
      return this.permanentlyDeleteTemplate(target.id);
    }
    return this.permanentlyDeleteWorkspace(target.id);
  }

  /** 会话移入回收站：只打时间戳，消息一条不动，恢复时原样回来。 */
  public moveConversation(rawId: unknown): TrashActionResult {
    const id = TrashService.normalizeId(rawId);
    const row = this.database
      .prepare(
        `SELECT id, name FROM ai_conversations
        WHERE id = ? AND trashed_at IS NULL`,
      )
      .get(id) as { id: number; name: string } | undefined;
    if (!row) {
      throw new Error(
        '对话不存在或已在回收站 / Conversation not found or already in Trash',
      );
    }

    const result = this.database
      .prepare('UPDATE ai_conversations SET trashed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    if (result.changes !== 1) {
      throw new Error('无法移入回收站 / Could not move conversation to Trash');
    }

    return {
      itemType: 'conversation',
      id,
      name: row.name,
      workspaceId: null,
      noteCount: 0,
    };
  }

  /** 模板移入回收站后不再出现在场景列表，但历史生成结果保持不变。 */
  public moveTemplate(rawId: unknown): TrashActionResult {
    const id = TrashService.normalizeId(rawId);
    const row = this.database
      .prepare(
        `SELECT id, name FROM knowledge_templates
        WHERE id = ? AND trashed_at IS NULL`,
      )
      .get(id) as { id: number; name: string } | undefined;
    if (!row) {
      throw new Error(
        '知识模板不存在或已在回收站 / Template not found or already in Trash',
      );
    }

    const result = this.database
      .prepare('UPDATE knowledge_templates SET trashed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    if (result.changes !== 1) {
      throw new Error('无法移入回收站 / Could not move template to Trash');
    }

    return {
      itemType: 'template',
      id,
      name: row.name,
      workspaceId: null,
      noteCount: 0,
    };
  }

  private restoreConversation(id: number): TrashActionResult {
    const row = this.database
      .prepare(
        `SELECT id, name FROM ai_conversations
        WHERE id = ? AND trashed_at IS NOT NULL`,
      )
      .get(id) as { id: number; name: string } | undefined;
    if (!row) {
      throw new Error('对话不在回收站 / Conversation is not in Trash');
    }

    this.database
      .prepare('UPDATE ai_conversations SET trashed_at = NULL WHERE id = ?')
      .run(id);

    return {
      itemType: 'conversation',
      id,
      name: row.name,
      workspaceId: null,
      noteCount: 0,
    };
  }

  private permanentlyDeleteConversation(id: number): TrashActionResult {
    const row = this.database
      .prepare(
        `SELECT id, name FROM ai_conversations
        WHERE id = ? AND trashed_at IS NOT NULL`,
      )
      .get(id) as { id: number; name: string } | undefined;
    if (!row) {
      throw new Error('对话不在回收站 / Conversation is not in Trash');
    }

    // 消息挂在会话上，会话没了它们也没有意义，一并清掉
    this.database
      .prepare('DELETE FROM ai_messages WHERE conversation_id = ?')
      .run(id);
    this.database.prepare('DELETE FROM ai_conversations WHERE id = ?').run(id);

    return {
      itemType: 'conversation',
      id,
      name: row.name,
      workspaceId: null,
      noteCount: 0,
    };
  }

  private restoreTemplate(id: number): TrashActionResult {
    const row = this.database
      .prepare(
        `SELECT id, name FROM knowledge_templates
        WHERE id = ? AND trashed_at IS NOT NULL`,
      )
      .get(id) as { id: number; name: string } | undefined;
    if (!row) {
      throw new Error('模板不在回收站 / Template is not in Trash');
    }

    this.database
      .prepare('UPDATE knowledge_templates SET trashed_at = NULL WHERE id = ?')
      .run(id);
    return {
      itemType: 'template',
      id,
      name: row.name,
      workspaceId: null,
      noteCount: 0,
    };
  }

  private permanentlyDeleteTemplate(id: number): TrashActionResult {
    const row = this.database
      .prepare(
        `SELECT id, name FROM knowledge_templates
        WHERE id = ? AND trashed_at IS NOT NULL`,
      )
      .get(id) as { id: number; name: string } | undefined;
    if (!row) {
      throw new Error('模板不在回收站 / Template is not in Trash');
    }

    this.database
      .prepare('DELETE FROM knowledge_templates WHERE id = ?')
      .run(id);
    return {
      itemType: 'template',
      id,
      name: row.name,
      workspaceId: null,
      noteCount: 0,
    };
  }

  private restoreNote(id: number): TrashActionResult {
    const row = this.database
      .prepare(
        `SELECT notes.id, notes.name, notes.workspace_id
        FROM notes
        JOIN workspaces ON workspaces.id = notes.workspace_id
        WHERE notes.id = ?
          AND notes.trashed_at IS NOT NULL
          AND workspaces.trashed_at IS NULL`,
      )
      .get(id) as
      | { id: number; name: string | null; workspace_id: number }
      | undefined;
    if (!row) {
      throw new Error('回收站中找不到该笔记 / Note not found in Trash');
    }
    this.database
      .prepare('UPDATE notes SET trashed_at = NULL WHERE id = ?')
      .run(id);
    return {
      itemType: 'note',
      id,
      name: row.name ?? '',
      workspaceId: row.workspace_id,
      noteCount: 0,
    };
  }

  private restoreWorkspace(id: number): TrashActionResult {
    const row = this.database
      .prepare(
        `SELECT workspaces.id, workspaces.name, COUNT(notes.id) AS note_count
        FROM workspaces
        LEFT JOIN notes ON notes.workspace_id = workspaces.id
        WHERE workspaces.id = ? AND workspaces.trashed_at IS NOT NULL
        GROUP BY workspaces.id`,
      )
      .get(id) as { id: number; name: string; note_count: number } | undefined;
    if (!row) {
      throw new Error(
        '回收站中找不到该工作空间 / Workspace not found in Trash',
      );
    }
    const restore = this.database.transaction(() => {
      this.database
        .prepare('UPDATE workspaces SET trashed_at = NULL WHERE id = ?')
        .run(id);
      this.database
        .prepare('UPDATE notes SET trashed_at = NULL WHERE workspace_id = ?')
        .run(id);
    });
    restore();
    return {
      itemType: 'workspace',
      id,
      name: row.name,
      workspaceId: id,
      noteCount: Number(row.note_count),
    };
  }

  private permanentlyDeleteNote(id: number): TrashActionResult {
    const row = this.database
      .prepare(
        `SELECT notes.id, notes.name, notes.workspace_id,
          notes.audio_relative_path
        FROM notes
        JOIN workspaces ON workspaces.id = notes.workspace_id
        WHERE notes.id = ?
          AND notes.trashed_at IS NOT NULL
          AND workspaces.trashed_at IS NULL`,
      )
      .get(id) as
      | {
          id: number;
          name: string | null;
          workspace_id: number;
          audio_relative_path: string | null;
        }
      | undefined;
    if (!row) {
      throw new Error('回收站中找不到该笔记 / Note not found in Trash');
    }
    this.database.prepare('DELETE FROM notes WHERE id = ?').run(id);
    this.discardUnreferencedRecordings([row.audio_relative_path]);
    return {
      itemType: 'note',
      id,
      name: row.name ?? '',
      workspaceId: row.workspace_id,
      noteCount: 0,
    };
  }

  private permanentlyDeleteWorkspace(id: number): TrashActionResult {
    const row = this.database
      .prepare(
        `SELECT workspaces.id, workspaces.name, COUNT(notes.id) AS note_count
        FROM workspaces
        LEFT JOIN notes ON notes.workspace_id = workspaces.id
        WHERE workspaces.id = ? AND workspaces.trashed_at IS NOT NULL
        GROUP BY workspaces.id`,
      )
      .get(id) as { id: number; name: string; note_count: number } | undefined;
    if (!row) {
      throw new Error(
        '回收站中找不到该工作空间 / Workspace not found in Trash',
      );
    }
    const recordings = this.database
      .prepare(
        `SELECT DISTINCT audio_relative_path
        FROM notes
        WHERE workspace_id = ? AND audio_relative_path IS NOT NULL`,
      )
      .all(id) as Array<{ audio_relative_path: string }>;
    this.database.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    this.discardUnreferencedRecordings(
      recordings.map((item) => item.audio_relative_path),
    );
    return {
      itemType: 'workspace',
      id,
      name: row.name,
      workspaceId: id,
      noteCount: Number(row.note_count),
    };
  }

  private discardUnreferencedRecordings(
    relativePaths: Array<string | null>,
  ): void {
    const uniquePaths = new Set(relativePaths.filter(Boolean) as string[]);
    uniquePaths.forEach((relativePath) => {
      try {
        this.getRecordingStorage().discardRecording(relativePath);
      } catch (error) {
        // Database deletion is authoritative. A cleanup failure leaves an
        // unreferenced local file, which is safer than deleting another file.
        // eslint-disable-next-line no-console
        console.error('Failed to discard an unreferenced recording', error);
      }
    });
  }

  private getRecordingStorage(): RecordingDiscarder {
    if (!this.recordingStorage) {
      this.recordingStorage = new RecordingStorageService(
        BlobStorage.getInstance(),
        this.database,
      );
    }
    return this.recordingStorage;
  }

  private static normalizeId(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      throw new Error('无效的条目 ID / Invalid item ID');
    }
    return value;
  }

  private static normalizeTarget(value: unknown): TrashActionTarget {
    if (typeof value !== 'object' || value === null) {
      throw new Error('无效的回收站操作 / Invalid Trash action');
    }
    const candidate = value as Partial<TrashActionTarget>;
    if (
      candidate.itemType !== 'note' &&
      candidate.itemType !== 'workspace' &&
      candidate.itemType !== 'conversation' &&
      candidate.itemType !== 'template'
    ) {
      throw new Error('无效的条目类型 / Invalid item type');
    }
    return {
      itemType: candidate.itemType,
      id: TrashService.normalizeId(candidate.id),
    };
  }

  private static normalizeListQuery(value: unknown): Required<TrashListQuery> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('无效的回收站查询 / Invalid Trash query');
    }
    const candidate = value as TrashListQuery;
    const filter = candidate.filter ?? 'all';
    if (!TrashService.isFilter(filter)) {
      throw new Error('无效的回收站筛选 / Invalid Trash filter');
    }
    const page = candidate.page ?? 1;
    const pageSize = candidate.pageSize ?? DEFAULT_PAGE_SIZE;
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new Error('无效的页码 / Invalid page');
    }
    if (
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > MAX_PAGE_SIZE
    ) {
      throw new Error('无效的每页数量 / Invalid page size');
    }
    if (
      candidate.search !== undefined &&
      typeof candidate.search !== 'string'
    ) {
      throw new Error('无效的搜索内容 / Invalid search text');
    }
    return {
      search: (candidate.search ?? '').trim().slice(0, MAX_SEARCH_LENGTH),
      filter,
      page,
      pageSize,
    };
  }

  private static isFilter(value: unknown): value is TrashFilter {
    return (
      value === 'all' ||
      value === 'note' ||
      value === 'workspace' ||
      value === 'conversation' ||
      value === 'template'
    );
  }

  private static toLikePattern(search: string): string {
    if (!search) return '';
    const escaped = search.replace(/[\\%_]/g, '\\$&');
    return `%${escaped}%`;
  }
}
