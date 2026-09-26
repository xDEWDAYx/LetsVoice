/* eslint-disable import/order, no-useless-constructor, no-empty-function, lines-between-class-members */
import Database from 'better-sqlite3';
import { DatabaseManager } from '../database/DatabaseManager';
import type {
  StructuredNote,
  ScenarioKnowledge,
} from '@shared/types/KnowledgeGenerationTypes';

export default class KnowledgeRepository {
  constructor(
    private readonly db: Database.Database = DatabaseManager.getInstance().getDatabase(),
  ) {}
  getStructuredNote(noteId: number): StructuredNote | null {
    return this.read<StructuredNote>('structured_notes', noteId);
  }
  getScenario(noteId: number): ScenarioKnowledge | null {
    return this.read<ScenarioKnowledge>('scenario_knowledge', noteId);
  }
  saveStructuredNote(value: StructuredNote): void {
    this.save(
      'structured_notes',
      value.noteId,
      value.modelId,
      value.createdAt,
      value.updatedAt,
      value,
    );
  }
  saveScenario(value: ScenarioKnowledge): void {
    const scenarioKey =
      value.templateSource === 'custom'
        ? `custom:${value.templateId}`
        : value.scenario;
    this.save(
      'scenario_knowledge',
      value.noteId,
      value.modelId,
      value.createdAt,
      value.updatedAt,
      value,
      scenarioKey,
    );
  }
  private read<T>(table: string, noteId: number): T | null {
    const row = this.db
      .prepare(`SELECT payload FROM ${table} WHERE note_id = ?`)
      .get(noteId) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as T) : null;
  }
  private save(
    table: string,
    noteId: number,
    modelId: string,
    createdAt: string,
    updatedAt: string,
    payload: unknown,
    scenario: string | null = null,
  ): void {
    this.db.transaction(() =>
      this.db
        .prepare(
          `INSERT INTO ${table} (note_id, scenario, payload, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET scenario=excluded.scenario, payload=excluded.payload, model_id=excluded.model_id, updated_at=excluded.updated_at`,
        )
        .run(
          noteId,
          scenario,
          JSON.stringify(payload),
          modelId,
          createdAt,
          updatedAt,
        ),
    )();
  }
}
