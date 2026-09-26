import Database from 'better-sqlite3';
import { DatabaseManager } from '../database/DatabaseManager';
import WorkspaceSuggestionRules from './WorkspaceSuggestionRules';
import {
  WorkspaceSignal,
  WorkspaceSuggestion,
} from './WorkspaceSuggestionTypes';

/** 查询本地整理信号，分类规则和用户操作分别由独立模块处理。 */
export default class WorkspaceSuggestionService {
  private readonly database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public getSuggestion(): WorkspaceSuggestion {
    const rows = this.database
      .prepare(
        `SELECT workspaces.id, workspaces.name, COUNT(notes.id) AS note_count,
          GROUP_CONCAT(COALESCE(notes.name, '') || ' ' || SUBSTR(notes.transcript, 1, 400), ' ') AS content
        FROM workspaces
        LEFT JOIN notes ON notes.workspace_id = workspaces.id
          AND notes.trashed_at IS NULL
        WHERE workspaces.trashed_at IS NULL
        GROUP BY workspaces.id
        ORDER BY COALESCE(workspaces.last_opened_at, workspaces.created_at) DESC,
          workspaces.id DESC
        LIMIT 12`,
      )
      .all() as WorkspaceSignal[];

    return WorkspaceSuggestionRules.build(rows);
  }
}
