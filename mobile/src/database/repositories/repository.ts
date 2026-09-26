import type { SQLiteDatabase } from "expo-sqlite";

import { DatabaseManager } from "../core/database-manager";

export abstract class Repository {
  protected readonly databaseManager: DatabaseManager;

  public constructor(databaseManager: DatabaseManager) {
    this.databaseManager = databaseManager;
  }

  protected getDatabase(): SQLiteDatabase {
    return this.databaseManager.getDatabase();
  }
}
