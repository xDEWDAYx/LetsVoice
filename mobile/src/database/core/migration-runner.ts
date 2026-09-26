import type { SQLiteDatabase } from "expo-sqlite";

import { Migration } from "./migration";

export class MigrationRunner {
  private readonly migrations: readonly Migration[];

  public constructor(migrations: readonly Migration[]) {
    this.migrations = [...migrations].sort(
      (left, right) => left.version - right.version,
    );
    this.validateMigrations();
  }

  public async run(database: SQLiteDatabase): Promise<void> {
    const currentVersion = await this.getCurrentVersion(database);
    const pendingMigrations = this.migrations.filter(
      (migration) => migration.version > currentVersion,
    );

    console.info("[Database] Migration check", {
      currentVersion,
      pendingVersions: pendingMigrations.map((migration) => migration.version),
    });

    for (const migration of pendingMigrations) {
      console.info("[Database] Applying migration", {
        version: migration.version,
      });
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await migration.migrate(transaction);
        await this.setVersion(transaction, migration.version);
      });
      console.info("[Database] Migration applied", {
        version: migration.version,
      });
    }
  }

  private async getCurrentVersion(database: SQLiteDatabase): Promise<number> {
    const result = await database.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version",
    );

    return result?.user_version ?? 0;
  }

  private async setVersion(
    database: SQLiteDatabase,
    version: number,
  ): Promise<void> {
    await database.execAsync(`PRAGMA user_version = ${version}`);
  }

  private validateMigrations(): void {
    for (let index = 1; index < this.migrations.length; index += 1) {
      const previousMigration = this.migrations[index - 1];
      const currentMigration = this.migrations[index];

      if (previousMigration.version === currentMigration.version) {
        throw new Error(
          `Duplicate database migration version: ${currentMigration.version}`,
        );
      }
    }
  }
}
