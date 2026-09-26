import { DatabaseManager } from "@/database";
import { SttModel, SttModelEngine } from "@/domain/stt-model/stt-model";
import { DatabaseError } from "@/errors/database-error";

type SttModelRow = {
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

export class SttModelRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findAll(): Promise<SttModel[]> {
    try {
      const rows = await this.databaseManager
        .getDatabase()
        .getAllAsync<SttModelRow>(
          `SELECT id, engine, name, format, quantization, file_relative_path,
            size_bytes, is_active, downloaded_at, created_at, updated_at
           FROM stt_models
           ORDER BY downloaded_at DESC`,
        );

      return rows.map((row) => this.mapRowToEntity(row));
    } catch (error) {
      throw this.toDatabaseError("Unable to load STT models.", error);
    }
  }

  public async findById(id: string): Promise<SttModel | null> {
    try {
      const row = await this.databaseManager
        .getDatabase()
        .getFirstAsync<SttModelRow>(
          `SELECT id, engine, name, format, quantization, file_relative_path,
            size_bytes, is_active, downloaded_at, created_at, updated_at
           FROM stt_models
           WHERE id = ?`,
          id,
        );

      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError("Unable to load the STT model.", error);
    }
  }

  public async findActive(): Promise<SttModel | null> {
    try {
      const row = await this.databaseManager
        .getDatabase()
        .getFirstAsync<SttModelRow>(
          `SELECT id, engine, name, format, quantization, file_relative_path,
            size_bytes, is_active, downloaded_at, created_at, updated_at
           FROM stt_models
           WHERE is_active = 1
           LIMIT 1`,
        );

      return row ? this.mapRowToEntity(row) : null;
    } catch (error) {
      throw this.toDatabaseError("Unable to load the active STT model.", error);
    }
  }

  public async create(model: SttModel): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO stt_models (
          id, engine, name, format, quantization, file_relative_path,
          size_bytes, is_active, downloaded_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        model.getId(),
        model.getEngine(),
        model.getName(),
        model.getFormat(),
        model.getQuantization(),
        model.getFileRelativePath(),
        model.getSizeBytes(),
        model.getIsActive() ? 1 : 0,
        model.getDownloadedAt(),
        model.getCreatedAt(),
        model.getUpdatedAt(),
      );
    } catch (error) {
      throw this.toDatabaseError("Unable to save the STT model.", error);
    }
  }

  public async update(model: SttModel): Promise<void> {
    try {
      await this.databaseManager
        .getDatabase()
        .runAsync(
          "UPDATE stt_models SET is_active = ?, updated_at = ? WHERE id = ?",
          model.getIsActive() ? 1 : 0,
          model.getUpdatedAt(),
          model.getId(),
        );
    } catch (error) {
      throw this.toDatabaseError("Unable to update the STT model.", error);
    }
  }

  public async deactivateAll(): Promise<void> {
    try {
      await this.databaseManager
        .getDatabase()
        .runAsync(
          "UPDATE stt_models SET is_active = 0, updated_at = ? WHERE is_active = 1",
          new Date().toISOString(),
        );
    } catch (error) {
      throw this.toDatabaseError(
        "Unable to update the active STT model.",
        error,
      );
    }
  }

  public async delete(id: string): Promise<void> {
    try {
      await this.databaseManager
        .getDatabase()
        .runAsync("DELETE FROM stt_models WHERE id = ?", id);
    } catch (error) {
      throw this.toDatabaseError("Unable to remove the STT model.", error);
    }
  }

  private mapRowToEntity(row: SttModelRow): SttModel {
    return new SttModel(
      row.id,
      row.engine as SttModelEngine,
      row.name,
      row.format,
      row.quantization,
      row.file_relative_path,
      row.size_bytes,
      row.is_active === 1,
      row.downloaded_at,
      row.created_at,
      row.updated_at,
    );
  }

  private toDatabaseError(message: string, error: unknown): DatabaseError {
    return new DatabaseError(message, {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
