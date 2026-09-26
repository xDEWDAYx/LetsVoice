import { DatabaseManager } from "@/database";
import { TtsModel, TtsModelEngine } from "@/domain/tts-model/tts-model";
import { DatabaseError } from "@/errors/database-error";

type TtsModelRow = {
  id: string; engine: string; name: string; model_type: string; languages: string;
  file_path: string; size_bytes: number; is_active: number; downloaded_at: string;
  created_at: string; updated_at: string;
};

const COLUMNS = `id, engine, name, model_type, languages, file_path,
  size_bytes, is_active, downloaded_at, created_at, updated_at`;

export class TtsModelRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findAll(): Promise<TtsModel[]> {
    try {
      const rows = await this.databaseManager.getDatabase().getAllAsync<TtsModelRow>(
        `SELECT ${COLUMNS} FROM tts_models ORDER BY downloaded_at DESC`,
      );
      return rows.map((row) => this.mapRow(row));
    } catch (error) { throw this.toError("Unable to load TTS models.", error); }
  }

  public async findById(id: string): Promise<TtsModel | null> {
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<TtsModelRow>(
        `SELECT ${COLUMNS} FROM tts_models WHERE id = ?`, id,
      );
      return row ? this.mapRow(row) : null;
    } catch (error) { throw this.toError("Unable to load the TTS model.", error); }
  }

  public async findActive(): Promise<TtsModel | null> {
    try {
      const row = await this.databaseManager.getDatabase().getFirstAsync<TtsModelRow>(
        `SELECT ${COLUMNS} FROM tts_models WHERE is_active = 1 LIMIT 1`,
      );
      return row ? this.mapRow(row) : null;
    } catch (error) { throw this.toError("Unable to load the active TTS model.", error); }
  }

  public async create(model: TtsModel): Promise<void> {
    try {
      await this.databaseManager.getDatabase().runAsync(
        `INSERT INTO tts_models (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        model.getId(), model.getEngine(), model.getName(), model.getModelType(),
        model.getLanguages(), model.getFilePath(), model.getSizeBytes(),
        model.getIsActive() ? 1 : 0, model.getDownloadedAt(), model.getCreatedAt(),
        model.getUpdatedAt(),
      );
    } catch (error) { throw this.toError("Unable to save the TTS model.", error); }
  }

  public async activateExclusively(model: TtsModel): Promise<void> {
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          "UPDATE tts_models SET is_active = 0, updated_at = ? WHERE is_active = 1",
          new Date().toISOString(),
        );
        await tx.runAsync(
          "UPDATE tts_models SET is_active = 1, updated_at = ? WHERE id = ?",
          model.getUpdatedAt(), model.getId(),
        );
      });
    } catch (error) { throw this.toError("Unable to update the active TTS model.", error); }
  }

  public async delete(id: string): Promise<void> {
    try { await this.databaseManager.getDatabase().runAsync("DELETE FROM tts_models WHERE id = ?", id); }
    catch (error) { throw this.toError("Unable to remove the TTS model.", error); }
  }

  private mapRow(row: TtsModelRow): TtsModel {
    return new TtsModel(row.id, row.engine as TtsModelEngine, row.name,
      row.model_type, row.languages, row.file_path, row.size_bytes,
      row.is_active === 1, row.downloaded_at, row.created_at, row.updated_at);
  }

  private toError(message: string, error: unknown): DatabaseError {
    return new DatabaseError(message, { cause: error instanceof Error ? error : undefined });
  }
}
