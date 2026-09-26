import Database from 'better-sqlite3';

import { Workspace } from '@shared/entities/Workspace';
import { Repository } from './Repository';
import { DatabaseManager } from '../DatabaseManager';

// 保留命名导出，与其余 Repository 的导入方式一致。
export class WorkspaceRepository implements Repository<Workspace> {
  private database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  /** 创建时让 SQLite 分配整数 ID，并把该 ID 返回给业务层。 */
  public create(entity: Workspace): number {
    const statement = this.database.prepare(`
            INSERT INTO workspaces (name, created_at, updated_at)
            VALUES (?, ?, ?)
        `);
    const result = statement.run(
      entity.getName(),
      entity.getCreatedAt().toISOString(),
      entity.getUpdatedAt().toISOString(),
    );

    return Number(result.lastInsertRowid);
  }

  public findById(id: number): Workspace | null {
    const statement = this.database.prepare(`
            SELECT *
            FROM workspaces
            WHERE id = ? AND trashed_at IS NULL
        `);
    const row = statement.get(id) as any;

    return row === undefined ? null : WorkspaceRepository.toWorkspace(row);
  }

  public findAll(): Workspace[] {
    const statement = this.database.prepare(`
            SELECT *
            FROM workspaces
            WHERE trashed_at IS NULL
            ORDER BY updated_at DESC
        `);
    const rows = statement.all() as any[];

    return rows.map((row) => WorkspaceRepository.toWorkspace(row));
  }

  public update(entity: Workspace): boolean {
    const statement = this.database.prepare(`
            UPDATE workspaces
            SET name = ?, updated_at = ?
            WHERE id = ? AND trashed_at IS NULL
        `);
    const result = statement.run(
      entity.getName(),
      entity.getUpdatedAt().toISOString(),
      entity.getId(),
    );

    return result.changes > 0;
  }

  public deleteById(id: number): boolean {
    const trashedAt = new Date().toISOString();
    const moveToTrash = this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE workspaces SET trashed_at = ?
          WHERE id = ? AND trashed_at IS NULL`,
        )
        .run(trashedAt, id);
      if (result.changes === 1) {
        this.database
          .prepare('UPDATE notes SET trashed_at = ? WHERE workspace_id = ?')
          .run(trashedAt, id);
      }
      return result.changes === 1;
    });
    return moveToTrash();
  }

  public existsById(id: number): boolean {
    const statement = this.database.prepare(
      `SELECT 1 FROM workspaces
      WHERE id = ? AND trashed_at IS NULL LIMIT 1`,
    );
    return statement.get(id) !== undefined;
  }

  private static toWorkspace(row: any): Workspace {
    return new Workspace(
      row.id,
      row.name,
      new Date(row.created_at),
      new Date(row.updated_at),
    );
  }
}
