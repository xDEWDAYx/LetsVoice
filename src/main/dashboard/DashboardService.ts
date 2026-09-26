import Database from 'better-sqlite3';
import { DatabaseManager } from '../database/DatabaseManager';
import {
  TodoRepository,
  TodoData,
} from '../database/repositories/TodoRepository';
import { NoteClassificationService } from './NoteClassificationService';

export interface DashboardNoteDTO {
  id: number;
  workspaceId: number | null;
  name: string | null;
  audioRelativePath: string | null;
  transcript: string;
  isPinned: boolean;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  typeCategory: string;
  durationSeconds: number;
}

export interface DashboardOverviewDTO {
  notes: DashboardNoteDTO[];
  todos: TodoData[];
}

export class DashboardService {
  private database: Database.Database;

  private todoRepository: TodoRepository;

  private classificationService: NoteClassificationService;

  public constructor() {
    const dbManager = DatabaseManager.getInstance();
    this.database = dbManager.getDatabase();
    this.todoRepository = new TodoRepository(this.database);
    this.classificationService = new NoteClassificationService();
  }

  /**
   * 给还没有分类的历史笔记补上类型。
   *
   * 仪表板打开时在后台跑一次：分类是后加的能力，之前录的笔记都没有，
   * 总不能让用户挨个重新提取一遍。返回这次实际补上的条数。
   */
  public async classifyPendingNotes(): Promise<number> {
    return this.classificationService.classifyPendingNotes();
  }

  public getDashboardOverview(): DashboardOverviewDTO {
    const statement = this.database.prepare(`
            SELECT notes.*
            FROM notes
            JOIN workspaces ON workspaces.id = notes.workspace_id
            WHERE notes.trashed_at IS NULL
              AND workspaces.trashed_at IS NULL
            ORDER BY notes.updated_at DESC
            LIMIT 50
        `);

    const rows = statement.all() as any[];

    const notes: DashboardNoteDTO[] = rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      audioRelativePath: row.audio_relative_path,
      transcript: row.transcript,
      isPinned: row.is_pinned === 1,
      pinnedAt: row.pinned_at === null ? null : new Date(row.pinned_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      // 空串交给渲染层归一成「未分类」，主进程不塞界面文案。
      typeCategory: row.type_category ?? '',
      durationSeconds: 0,
    }));

    const todos = this.todoRepository.getAllTodos();

    return {
      notes,
      todos,
    };
  }

  /** 勾掉 / 取消勾掉一条待办。浮窗和仪表板共用。 */
  public setTodoCompleted(todoId: number, isCompleted: boolean): boolean {
    try {
      this.todoRepository.updateTodoStatus(todoId, isCompleted);
      return true;
    } catch (error) {
      console.error('Failed to update todo status:', error);
      return false;
    }
  }

  /** 置顶 / 取消置顶一条待办。 */
  public setTodoPinned(todoId: number, isPinned: boolean): boolean {
    try {
      this.todoRepository.updateTodoPinned(todoId, isPinned);
      return true;
    } catch (error) {
      console.error('Failed to update todo pin:', error);
      return false;
    }
  }

  public async toggleNotePin(
    noteId: number,
    isPinned: boolean,
  ): Promise<boolean> {
    try {
      const statement = this.database.prepare(`
                UPDATE notes
                SET is_pinned = ?, pinned_at = ?
                WHERE id = ? AND trashed_at IS NULL
            `);
      const pinnedAt = isPinned ? new Date().toISOString() : null;
      statement.run(isPinned ? 1 : 0, pinnedAt, noteId);
      return true;
    } catch (error) {
      console.error('Failed to toggle note pin:', error);
      return false;
    }
  }
}
