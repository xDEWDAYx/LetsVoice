import type { SQLiteDatabase } from "expo-sqlite";

import { DatabaseConfig } from "../config/database-config";
import { MigrationRunner } from "./migration-runner";

export class DatabaseManager {
  private database: SQLiteDatabase | null = null;

  public constructor(
    private readonly config: DatabaseConfig,
    private readonly migrationRunner: MigrationRunner,
  ) {}

  public async initialize(database: SQLiteDatabase): Promise<void> {
    console.info("[Database] Initializing and checking migrations", {
      databaseName: this.config.databaseName,
    });
    await database.execAsync(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;",
    );
    await this.migrationRunner.run(database);
    this.database = database;
    console.info("[Database] Ready", {
      databaseName: this.config.databaseName,
    });
  }

  public getDatabase(): SQLiteDatabase {
    if (this.database === null) {
      throw new Error(
        `Database ${this.config.databaseName} has not been initialized.`,
      );
    }

    return this.database;
  }

  public isInitialized(): boolean {
    return this.database !== null;
  }
}
