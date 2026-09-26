// better-sqlite3 是 Electron 原生依赖，安装在 release/app 并通过模块链接供主进程使用。
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

// 保留命名导出，避免修改现有 repositories 与 WorkspaceService 的导入方式。
export class DatabaseManager {
  // 类内部的单例类型属于正常自引用，不是运行时的提前访问。
  // eslint-disable-next-line no-use-before-define
  private static instance: DatabaseManager | null = null;

  private databasePath: string;

  private database: Database.Database;

  private constructor() {
    const userDataPath = app.getPath('userData');

    this.databasePath = path.join(userDataPath, 'speakspace.db');

    this.database = new Database(this.databasePath);

    this.initialize();
  }

  private initialize(): void {
    this.database.pragma('foreign_keys = ON');

    this.createCoreTables();
    this.ensureWorkspaceLastOpenedColumn();
    this.ensureTrashColumns();
    this.ensureNoteCategoryColumn();
    this.ensureConversationTrashColumn();
    this.ensureTodoPinnedColumn();
    this.ensureKnowledgeTemplateScenarioColumns();
    this.ensureKnowledgeGenerationTables();
    this.cleanupOrphanedConversations();
  }

  private ensureKnowledgeGenerationTables(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS structured_notes (
        note_id INTEGER PRIMARY KEY,
        scenario TEXT,
        payload TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS scenario_knowledge (
        note_id INTEGER PRIMARY KEY,
        scenario TEXT NOT NULL,
        payload TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_structured_notes_updated_at ON structured_notes(updated_at);
      CREATE INDEX IF NOT EXISTS idx_scenario_knowledge_updated_at ON scenario_knowledge(updated_at);
    `);
    const legacyTable = this.database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'core_note_insights'",
      )
      .get();
    if (legacyTable) {
      this.database.transaction(() => {
        this.database.exec(`
          INSERT OR IGNORE INTO structured_notes (
            note_id, scenario, payload, model_id, created_at, updated_at
          )
          SELECT note_id, scenario, payload, model_id, created_at, updated_at
          FROM core_note_insights;
          DROP TABLE core_note_insights;
        `);
      })();
    }
  }

  /**
   * 刪除所有沒有關聯筆記的對話。
   * 這可以清理過去因為只刪除筆記而殘留下來的空對話。
   */
  private cleanupOrphanedConversations(): void {
    try {
      this.database.exec(`
        DELETE FROM ai_conversations
        WHERE id NOT IN (SELECT conversation_id FROM conversation_contexts)
          AND id NOT IN (SELECT conversation_id FROM ai_messages)
      `);
    } catch (err) {
      console.error('Failed to clean up orphaned conversations:', err);
    }
  }

  public static getInstance(): DatabaseManager {
    if (DatabaseManager.instance === null) {
      DatabaseManager.instance = new DatabaseManager();
    }

    return DatabaseManager.instance;
  }

  public getDatabase(): Database.Database {
    return this.database;
  }

  public getDatabasePath(): string {
    return this.databasePath;
  }

  public close(): void {
    this.database.close();
  }

  private createCoreTables(): void {
    this.database.exec(`

            CREATE TABLE IF NOT EXISTS workspaces (

                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,

                last_opened_at TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                trashed_at TEXT
            );


            CREATE TABLE IF NOT EXISTS notes (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                workspace_id INTEGER NOT NULL,

                name TEXT,

                audio_relative_path TEXT,

                transcript TEXT NOT NULL,

                is_pinned INTEGER NOT NULL DEFAULT 0,

                -- 语言无关的分类 key（meeting / personal / ...），
                -- NULL 表示还没分过类，界面上显示为「未分类」。
                type_category TEXT,

                pinned_at TEXT,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                trashed_at TEXT,

                FOREIGN KEY(workspace_id)
                    REFERENCES workspaces(id)
                    ON DELETE CASCADE
            );


            CREATE TABLE IF NOT EXISTS subnotes (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                note_id INTEGER NOT NULL,

                content_type TEXT NOT NULL,

                content TEXT NOT NULL,

                created_at TEXT NOT NULL,


                FOREIGN KEY(note_id)
                    REFERENCES notes(id)
                    ON DELETE CASCADE
            );


            CREATE TABLE IF NOT EXISTS knowledge_templates (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                name TEXT NOT NULL,

                prompt TEXT NOT NULL,

                scenario_definition TEXT,

                normalized_at TEXT,

                created_at TEXT NOT NULL,

                updated_at TEXT NOT NULL,

                trashed_at TEXT
            );


            CREATE TABLE IF NOT EXISTS knowledge_outputs (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                note_id INTEGER NOT NULL,

                template_id INTEGER NOT NULL,

                content_type TEXT NOT NULL,

                content TEXT NOT NULL,

                created_at TEXT NOT NULL,

                updated_at TEXT NOT NULL,


                FOREIGN KEY(note_id)
                    REFERENCES notes(id)
                    ON DELETE CASCADE,


                FOREIGN KEY(template_id)
                    REFERENCES knowledge_templates(id)
                    ON DELETE CASCADE
            );


            CREATE TABLE IF NOT EXISTS note_embeddings (

                note_id INTEGER NOT NULL,

                model_name TEXT NOT NULL,

                embedding TEXT NOT NULL,

                content_hash TEXT NOT NULL,

                updated_at TEXT NOT NULL,

                PRIMARY KEY(note_id, model_name),

                FOREIGN KEY(note_id)
                    REFERENCES notes(id)
                    ON DELETE CASCADE
            );


            CREATE TABLE IF NOT EXISTS ai_conversations (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                name TEXT NOT NULL,

                created_at TEXT NOT NULL,

                updated_at TEXT NOT NULL,

                -- NULL 表示正常；有时间戳表示已移入回收站，可恢复
                trashed_at TEXT
            );


            CREATE TABLE IF NOT EXISTS ai_messages (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                conversation_id INTEGER NOT NULL,

                role TEXT NOT NULL,

                content TEXT NOT NULL,

                created_at TEXT NOT NULL,


                FOREIGN KEY(conversation_id)
                    REFERENCES ai_conversations(id)
                    ON DELETE CASCADE
            );


            CREATE TABLE IF NOT EXISTS conversation_contexts (

                conversation_id INTEGER NOT NULL,

                note_id INTEGER NOT NULL,


                PRIMARY KEY(
                    conversation_id,
                    note_id
                ),


                FOREIGN KEY(conversation_id)
                    REFERENCES ai_conversations(id)
                    ON DELETE CASCADE,


                FOREIGN KEY(note_id)
                    REFERENCES notes(id)
                    ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                date_string TEXT NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                -- 置顶的待办排在最前，浮窗和仪表板都按它排序
                is_pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(note_id)
                    REFERENCES notes(id)
                    ON DELETE CASCADE
            );

        `);
  }

  /**
   * 兼容已有数据库：last_opened_at 表示最近进入时间，updated_at 仍表示内容修改时间。
   * Existing databases receive only the missing Workspace access-time column.
   */
  private ensureWorkspaceLastOpenedColumn(): void {
    const statement = this.database.prepare('PRAGMA table_info(workspaces)');
    const columns = statement.all() as Array<{ name: string }>;

    if (!columns.some((column) => column.name === 'last_opened_at')) {
      this.database.exec(
        'ALTER TABLE workspaces ADD COLUMN last_opened_at TEXT',
      );
    }
  }

  /** 补齐旧版自定义模板缺少的规范化字段与回收站状态。 */
  private ensureKnowledgeTemplateScenarioColumns(): void {
    const columns = this.database
      .prepare('PRAGMA table_info(knowledge_templates)')
      .all() as Array<{ name: string }>;

    if (!columns.some((column) => column.name === 'scenario_definition')) {
      this.database.exec(
        'ALTER TABLE knowledge_templates ADD COLUMN scenario_definition TEXT',
      );
    }
    if (!columns.some((column) => column.name === 'normalized_at')) {
      this.database.exec(
        'ALTER TABLE knowledge_templates ADD COLUMN normalized_at TEXT',
      );
    }
    if (!columns.some((column) => column.name === 'trashed_at')) {
      this.database.exec(
        'ALTER TABLE knowledge_templates ADD COLUMN trashed_at TEXT',
      );
    }
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_templates_trashed_at
        ON knowledge_templates(trashed_at);
    `);
  }

  /** 待办置顶是后加的：老库补上这一列，默认 0。 */
  private ensureTodoPinnedColumn(): void {
    const columns = this.database
      .prepare('PRAGMA table_info(todos)')
      .all() as Array<{ name: string }>;

    if (!columns.some((column) => column.name === 'is_pinned')) {
      this.database.exec(
        'ALTER TABLE todos ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0',
      );
    }
  }

  /** 会话回收站是后加的：老库补上这一列，NULL 表示没被删。 */
  private ensureConversationTrashColumn(): void {
    const columns = this.database
      .prepare('PRAGMA table_info(ai_conversations)')
      .all() as Array<{ name: string }>;

    if (!columns.some((column) => column.name === 'trashed_at')) {
      this.database.exec(
        'ALTER TABLE ai_conversations ADD COLUMN trashed_at TEXT',
      );
    }
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_trashed_at
        ON ai_conversations(trashed_at);
    `);
  }

  /**
   * 笔记类型是后加的列：老库直接补上，值为 NULL 表示还没分类，
   * 后台补分类任务会挑出这些笔记逐条识别。
   */
  private ensureNoteCategoryColumn(): void {
    const columns = this.database
      .prepare('PRAGMA table_info(notes)')
      .all() as Array<{ name: string }>;

    if (!columns.some((column) => column.name === 'type_category')) {
      this.database.exec('ALTER TABLE notes ADD COLUMN type_category TEXT');
    }
  }

  /**
   * Existing local databases gain nullable recovery timestamps in place. NULL
   * means active; a timestamp means the row is recoverable through Trash.
   */
  private ensureTrashColumns(): void {
    const ensureColumn = (table: 'workspaces' | 'notes') => {
      const columns = this.database
        .prepare(`PRAGMA table_info(${table})`)
        .all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === 'trashed_at')) {
        this.database.exec(`ALTER TABLE ${table} ADD COLUMN trashed_at TEXT`);
      }
    };

    ensureColumn('workspaces');
    ensureColumn('notes');
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_workspaces_trashed_at
        ON workspaces(trashed_at);
      CREATE INDEX IF NOT EXISTS idx_notes_trashed_at
        ON notes(trashed_at);
    `);
  }
}
