import Database from 'better-sqlite3';
import { DatabaseManager } from '../DatabaseManager';

export type StoredNoteEmbedding = {
  noteId: number;
  modelName: string;
  embedding: number[];
  contentHash: string;
  updatedAt: string;
};

/** 向量是可重建索引，独立于 notes 主表并随笔记级联删除。 */
export default class NoteEmbeddingRepository {
  private readonly database: Database.Database;

  public constructor(database = DatabaseManager.getInstance().getDatabase()) {
    this.database = database;
  }

  public find(noteId: number, modelName: string): StoredNoteEmbedding | null {
    const row = this.database
      .prepare(
        `SELECT note_id, model_name, embedding, content_hash, updated_at
         FROM note_embeddings WHERE note_id = ? AND model_name = ?`,
      )
      .get(noteId, modelName) as
      | {
          note_id: number;
          model_name: string;
          embedding: string;
          content_hash: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return null;
    try {
      const embedding = JSON.parse(row.embedding) as unknown;
      if (!Array.isArray(embedding) || !embedding.every(Number.isFinite)) {
        return null;
      }
      return {
        noteId: row.note_id,
        modelName: row.model_name,
        embedding,
        contentHash: row.content_hash,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  }

  public upsert(
    noteId: number,
    modelName: string,
    embedding: number[],
    contentHash: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO note_embeddings
          (note_id, model_name, embedding, content_hash, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(note_id, model_name) DO UPDATE SET
          embedding = excluded.embedding,
          content_hash = excluded.content_hash,
          updated_at = excluded.updated_at`,
      )
      .run(
        noteId,
        modelName,
        JSON.stringify(embedding),
        contentHash,
        new Date().toISOString(),
      );
  }
}
