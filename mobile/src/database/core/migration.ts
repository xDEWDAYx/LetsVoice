import type { SQLiteDatabase } from "expo-sqlite";

export abstract class Migration {
  public abstract readonly version: number;

  public abstract migrate(database: SQLiteDatabase): Promise<void>;
}
