import { DatabaseManager } from "@/database";
import { LlmModel, LlmModelEngine } from "@/domain/llm-model/llm-model";
import { DatabaseError } from "@/errors/database-error";

type LlmModelRow = {
  id: string;
  engine: string;
  name: string;
  format: string;
  quantization: string | null;
  file_relative_path: string;
  size_bytes: number;
  is_active: number;
  downloaded_at: string;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS = `id, engine, name, format, quantization,
  file_relative_path, size_bytes, is_active, downloaded_at, created_at, updated_at`;

export class LlmModelRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findAll(): Promise<LlmModel[]> {
    try {
      const rows = await this.databaseManager.getDatabase().getAllAsync<LlmModelRow>(
        `SELECT ${SELECT_COLUMNS} FROM llm_models ORDER BY downloaded_at DESC`,
      );
      return rows.map((row) => this.mapRowToEntity(row));
    } catch (error) {
      throw this.toDatabaseError("Unable to load LLM models.", error);
    }
  }

  public async findById(id: string): Promise<LlmModel | null> {
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<LlmModelRow>(
        `SELECT ${SELECT_COLUMNS} FROM llm_models WHERE id = ?`,
        id,
      );
      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError("Unable to load the LLM model.", error);
    }
  }

  public async findActive(): Promise<LlmModel | null> {
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<LlmModelRow>(
        `SELECT ${SELECT_COLUMNS} FROM llm_models WHERE is_active = 1 LIMIT 1`,
      );
      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError("Unable to load the active LLM model.", error);
    }
  }

  public async create(model: LlmModel): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO llm_models (
          id, engine, name, format, quantization, file_relative_path,
          size_bytes, is_active, downloaded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        model.getId(), model.getEngine(), model.getName(), model.getFormat(),
        model.getQuantization(), model.getFileRelativePath(), model.getSizeBytes(),
        model.getIsActive() ? 1 : 0, model.getDownloadedAt(),
        model.getCreatedAt(), model.getUpdatedAt(),
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to save the LLM model.", error);
    }
  }

  public async update(model: LlmModel): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        "UPDATE llm_models SET is_active = ?, updated_at = ? WHERE id = ?",
        model.getIsActive() ? 1 : 0,
        model.getUpdatedAt(),
        model.getId(),
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to update the LLM model.", error);
    }
  }

  public async activateExclusively(model: LlmModel): Promise<void> {
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(
        async (transaction) => {
          const now = new Date().toISOString();
          await transaction.runAsync(
            "UPDATE llm_models SET is_active = 0, updated_at = ? WHERE is_active = 1",
            now,
          );
          await transaction.runAsync(
            "UPDATE llm_models SET is_active = 1, updated_at = ? WHERE id = ?",
            model.getUpdatedAt(),
            model.getId(),
          );
        },
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to update the active LLM model.", error);
    }
  }

  public async delete(id: string): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        "DELETE FROM llm_models WHERE id = ?",
        id,
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to remove the LLM model.", error);
    }
  }

  private mapRowToEntity(row: LlmModelRow): LlmModel {
    return new LlmModel(
      row.id, row.engine as LlmModelEngine, row.name, row.format,
      row.quantization, row.file_relative_path, row.size_bytes,
      row.is_active === 1, row.downloaded_at, row.created_at, row.updated_at,
    );
  }

  private toDatabaseError(message: string, error: unknown): DatabaseError {
    return new DatabaseError(message, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
