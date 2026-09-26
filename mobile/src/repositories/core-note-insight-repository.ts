import { DatabaseManager } from "@/database";
import {
  CoreNoteInsight,
  type CoreActionItem,
  type CoreInsightStatus,
  type CoreTask,
} from "@/domain/core-note-insight/core-note-insight";
import { DatabaseError } from "@/errors/database-error";
import { coreTaskIdentity } from "@/services/core-task-identity";
import { rollTaskSchedule, type TaskRecurrenceKind } from "@/services/task-recurrence";

type InsightRow = { id: string; note_id: string; summary: string; model_id: string; created_at: string; updated_at: string };
type KeyPointRow = { content: string };
type ActionRow = { id: string; task_id: string | null; position: number; title: string; description: string | null; status: string; starts_at: string | null; due_at: string | null; completed_at: string | null; source_note_id: string; external_system: string | null; external_id: string | null; metadata_json: string };
type TaskRow = { id: string; insight_id: string; position: number; title: string; description: string | null; status: string; starts_at: string | null; due_at: string | null; completed_at: string | null; source_note_id: string; external_system: string | null; external_id: string | null; metadata_json: string; is_pinned: number; pinned_at: string | null; recurrence_kind: string | null; recurrence_value: string | null; series_key: string | null; occurrence_index: number; is_current: number; ended_at: string | null };

export type CoreDashboardItems = { tasks: CoreTask[] };

export class CoreNoteInsightRepository {
  public constructor(private readonly databaseManager: DatabaseManager) {}

  public async findByNoteId(noteId: string): Promise<CoreNoteInsight | null> {
    try {
      const database = this.databaseManager.getDatabase();
      const row = await database.getFirstAsync<InsightRow>("SELECT * FROM core_note_insights WHERE note_id = ?", noteId);
      if (!row) return null;
      const [keyPoints, taskRows, actionRows] = await Promise.all([
        database.getAllAsync<KeyPointRow>("SELECT content FROM core_note_key_points WHERE insight_id = ? ORDER BY position", row.id),
        database.getAllAsync<TaskRow>(`SELECT * FROM core_note_tasks WHERE insight_id = ? AND is_current = 1
          ORDER BY is_current DESC, CASE status WHEN 'pending' THEN 0 ELSE 1 END,
            completed_at DESC, occurrence_index DESC, position`, row.id),
        database.getAllAsync<ActionRow>("SELECT * FROM core_note_action_items WHERE insight_id = ? ORDER BY position", row.id),
      ]);
      return new CoreNoteInsight(
        row.id, row.note_id, row.summary, keyPoints.map((item) => item.content),
        taskRows.map((item) => this.mapTask(item, actionRows.filter((action) => action.task_id === item.id))),
        actionRows.filter((item) => item.task_id === null).map((item) => this.mapAction(item)),
        row.model_id, row.created_at, row.updated_at,
      );
    } catch (error) {
      throw this.databaseError("Unable to load Structured Note.", error);
    }
  }

  public async findDashboardItems(): Promise<CoreDashboardItems> {
    try {
      const database = this.databaseManager.getDatabase();
      const tasks = await database.getAllAsync<TaskRow>(
        `SELECT tasks.* FROM core_note_tasks tasks
         INNER JOIN core_note_insights insights ON insights.id = tasks.insight_id AND insights.note_id = tasks.source_note_id
         INNER JOIN notes n ON n.id = tasks.source_note_id AND n.trashed_at IS NULL
         INNER JOIN workspaces w ON w.id = n.workspace_id AND w.trashed_at IS NULL
         WHERE ((tasks.status = 'pending' AND tasks.is_current = 1) OR tasks.status = 'completed')
         ORDER BY tasks.is_pinned DESC, COALESCE(tasks.due_at, tasks.starts_at), tasks.completed_at DESC, tasks.position`,
      );
      return { tasks: tasks.map((task) => this.mapTask(task, [])) };
    } catch (error) {
      throw this.databaseError("Unable to load dashboard insights.", error);
    }
  }

  public async save(insight: CoreNoteInsight): Promise<void> {
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(async (database) => {
        const existing = await database.getFirstAsync<InsightRow>("SELECT * FROM core_note_insights WHERE note_id = ?", insight.getNoteId());
        const insightId = existing?.id ?? insight.getId();
        const previousTasks = existing
          ? await database.getAllAsync<TaskRow>("SELECT * FROM core_note_tasks WHERE insight_id = ?", insightId)
          : [];
        const previousActions = existing
          ? await database.getAllAsync<ActionRow>("SELECT * FROM core_note_action_items WHERE insight_id = ?", insightId)
          : [];
        const now = insight.getUpdatedAt();

        if (existing) {
          await database.runAsync(
            "UPDATE core_note_insights SET summary = ?, model_id = ?, updated_at = ? WHERE id = ?",
            insight.getSummary(), insight.getModelId(), now, insightId,
          );
          await database.runAsync("DELETE FROM core_note_key_points WHERE insight_id = ?", insightId);
          await database.runAsync("DELETE FROM core_note_action_items WHERE insight_id = ?", insightId);
          await database.runAsync("DELETE FROM core_note_calendar_intents WHERE insight_id = ?", insightId);
        } else {
          await database.runAsync(
            "INSERT INTO core_note_insights (id, note_id, summary, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            insightId, insight.getNoteId(), insight.getSummary(), insight.getModelId(), insight.getCreatedAt(), now,
          );
        }

        for (const [position, keyPoint] of insight.getKeyPoints().entries()) {
          await database.runAsync("INSERT INTO core_note_key_points (id, insight_id, position, content) VALUES (?, ?, ?, ?)", `${insightId}-key-${position}-${Date.now()}`, insightId, position, keyPoint);
        }

        const usedPreviousIds = new Set<string>();
        const savedTaskIds = new Map<string, string>();
        const generatedSeriesKeys = new Set(insight.getTasks().flatMap((task) => task.seriesKey ? [task.seriesKey] : []));
        for (const [position, task] of insight.getTasks().entries()) {
          const matching = previousTasks.find((previous) => {
            if (usedPreviousIds.has(previous.id) || previous.is_current !== 1) return false;
            if (task.seriesKey) return previous.series_key === task.seriesKey;
            return previous.series_key === null && coreTaskIdentity(previous.title, previous.due_at, previous.starts_at) === coreTaskIdentity(task.title, task.dueAt, task.startsAt);
          });
          const taskId = matching?.id ?? task.id;
          savedTaskIds.set(task.id, taskId);
          if (matching) {
            usedPreviousIds.add(matching.id);
            await database.runAsync(
              `UPDATE core_note_tasks SET position = ?, title = ?, description = ?, starts_at = ?, due_at = ?,
                external_system = ?, external_id = ?, metadata_json = ?, recurrence_kind = ?, recurrence_value = ?,
                series_key = ?, is_current = 1, ended_at = NULL WHERE id = ?`,
              position, task.title, task.description, task.startsAt, task.dueAt, task.externalSystem, task.externalId,
              JSON.stringify(task.metadata), task.recurrenceKind ?? null, task.recurrenceValue ?? null,
              task.seriesKey ?? null, taskId,
            );
          } else {
            await this.insertTask(database, insightId, position, task, taskId);
          }
        }

        const endedSeries = new Set<string>();
        for (const previous of previousTasks.filter((task) => !usedPreviousIds.has(task.id))) {
          if (previous.series_key && !generatedSeriesKeys.has(previous.series_key)) {
            if (!endedSeries.has(previous.series_key)) {
              endedSeries.add(previous.series_key);
              const endedKey = `${previous.series_key}|ended:${now}`;
              await database.runAsync("DELETE FROM core_note_tasks WHERE insight_id = ? AND series_key = ? AND status = 'pending'", insightId, previous.series_key);
              await database.runAsync(
                "UPDATE core_note_tasks SET series_key = ?, is_current = 0, ended_at = COALESCE(ended_at, ?) WHERE insight_id = ? AND series_key = ?",
                endedKey, now, insightId, previous.series_key,
              );
            }
            continue;
          }
          if (previous.status === "pending") {
            await database.runAsync("DELETE FROM core_note_tasks WHERE id = ?", previous.id);
          } else if (previous.series_key && generatedSeriesKeys.has(previous.series_key)) {
            await database.runAsync("UPDATE core_note_tasks SET is_current = 0 WHERE id = ?", previous.id);
          } else {
            await database.runAsync("UPDATE core_note_tasks SET is_current = 0, ended_at = COALESCE(ended_at, ?) WHERE id = ?", now, previous.id);
          }
        }

        const completedTaskIds = new Set(previousTasks.filter((task) => task.status === "completed").map((task) => task.id));
        for (const action of previousActions.filter((item) => item.task_id && completedTaskIds.has(item.task_id))) {
          await database.runAsync(
            `INSERT INTO core_note_action_items (id, insight_id, task_id, position, title, description, status, starts_at, due_at, completed_at, source_note_id, external_system, external_id, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            action.id, insightId, action.task_id, action.position, action.title, action.description, action.status,
            action.starts_at, action.due_at, action.completed_at, action.source_note_id, action.external_system, action.external_id, action.metadata_json,
          );
        }
        for (const item of insight.getActionItems()) {
          const taskId = item.taskId ? (savedTaskIds.get(item.taskId) ?? item.taskId) : null;
          if (taskId && completedTaskIds.has(taskId)) continue;
          await database.runAsync(
            `INSERT INTO core_note_action_items (id, insight_id, task_id, position, title, description, status, starts_at, due_at, completed_at, source_note_id, external_system, external_id, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            `${item.id}-${Date.now()}`, insightId, taskId, item.position, item.title, item.description, item.status,
            item.startsAt, item.dueAt, item.completedAt, item.sourceNoteId, item.externalSystem, item.externalId, JSON.stringify(item.metadata),
          );
        }
      });
    } catch (error) {
      throw this.databaseError("Unable to save Structured Note.", error);
    }
  }

  public async setTaskCompleted(noteId: string, taskId: string, completed: boolean): Promise<void> {
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(async (database) => {
        const task = await database.getFirstAsync<TaskRow>("SELECT * FROM core_note_tasks WHERE id = ? AND source_note_id = ?", taskId, noteId);
        if (!task) throw new Error("Task was not found.");
        const now = new Date().toISOString();
        if (completed && task.status !== "completed") {
          if (task.is_current !== 1 || task.ended_at) throw new Error("Only a current task can be completed.");
          if (task.recurrence_kind && task.series_key) {
            const schedule = rollTaskSchedule(task.starts_at, task.due_at, task.recurrence_kind as TaskRecurrenceKind, now, task.recurrence_value);
            await database.runAsync("UPDATE core_note_tasks SET status = 'completed', completed_at = ?, is_current = 0 WHERE id = ?", now, task.id);
            const successorId = `${task.series_key.replace(/[^a-zA-Z0-9_-]/g, "-")}-${task.occurrence_index + 1}-${Date.now()}`;
            await database.runAsync(
              `INSERT INTO core_note_tasks (id, insight_id, position, title, description, status, starts_at, due_at, completed_at,
                source_note_id, external_system, external_id, metadata_json, is_pinned, pinned_at, recurrence_kind,
                recurrence_value, series_key, occurrence_index, is_current, ended_at)
               VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)`,
              successorId, task.insight_id, task.position, task.title, task.description, schedule.startsAt, schedule.dueAt,
              task.source_note_id, task.external_system, task.external_id, task.metadata_json, task.is_pinned, task.pinned_at,
              task.recurrence_kind, task.recurrence_value, task.series_key, task.occurrence_index + 1,
            );
            const actions = await database.getAllAsync<ActionRow>("SELECT * FROM core_note_action_items WHERE task_id = ?", task.id);
            const currentEffective = task.due_at ?? task.starts_at;
            const nextEffective = schedule.dueAt ?? schedule.startsAt;
            const actionDelta = currentEffective && nextEffective
              ? new Date(nextEffective).getTime() - new Date(currentEffective).getTime()
              : 0;
            const rollActionDate = (value: string | null) => value && actionDelta
              ? new Date(new Date(value).getTime() + actionDelta).toISOString()
              : value;
            for (const action of actions) {
              await database.runAsync(
                `INSERT INTO core_note_action_items (id, insight_id, task_id, position, title, description, status, starts_at, due_at, completed_at, source_note_id, external_system, external_id, metadata_json)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?, ?, ?)`,
                `${successorId}-action-${action.position}`, task.insight_id, successorId, action.position, action.title, action.description,
                rollActionDate(action.starts_at), rollActionDate(action.due_at), action.source_note_id, action.external_system, action.external_id, action.metadata_json,
              );
            }
          } else {
            await database.runAsync("UPDATE core_note_tasks SET status = 'completed', completed_at = ? WHERE id = ?", now, task.id);
          }
        } else if (!completed && task.status === "completed") {
          if (task.ended_at) throw new Error("An ended task series cannot be restored.");
          if (task.recurrence_kind && task.series_key) {
            const latest = await database.getFirstAsync<{ occurrence_index: number }>(
              "SELECT MAX(occurrence_index) AS occurrence_index FROM core_note_tasks WHERE series_key = ? AND status = 'completed'", task.series_key,
            );
            if (latest?.occurrence_index !== task.occurrence_index) throw new Error("Only the most recently completed recurring occurrence can be restored.");
            await database.runAsync("DELETE FROM core_note_tasks WHERE series_key = ? AND status = 'pending' AND is_current = 1", task.series_key);
            await database.runAsync("UPDATE core_note_tasks SET status = 'pending', completed_at = NULL, is_current = 1 WHERE id = ?", task.id);
          } else {
            await database.runAsync("UPDATE core_note_tasks SET status = 'pending', completed_at = NULL, is_current = 1 WHERE id = ?", task.id);
          }
        }
        await database.runAsync("UPDATE core_note_insights SET updated_at = ? WHERE note_id = ?", now, noteId);
      });
    } catch (error) {
      throw this.databaseError("Unable to update this task.", error);
    }
  }

  public async setTaskPinned(noteId: string, taskId: string, pinned: boolean): Promise<void> {
    try {
      await this.databaseManager.getDatabase().withExclusiveTransactionAsync(async (database) => {
        const task = await database.getFirstAsync<TaskRow>("SELECT * FROM core_note_tasks WHERE id = ? AND source_note_id = ?", taskId, noteId);
        if (!task) throw new Error("Task was not found.");
        const now = new Date().toISOString();
        if (task.series_key) {
          await database.runAsync("UPDATE core_note_tasks SET is_pinned = ?, pinned_at = ? WHERE series_key = ?", pinned ? 1 : 0, pinned ? now : null, task.series_key);
        } else {
          await database.runAsync("UPDATE core_note_tasks SET is_pinned = ?, pinned_at = ? WHERE id = ?", pinned ? 1 : 0, pinned ? now : null, task.id);
        }
        await database.runAsync("UPDATE core_note_insights SET updated_at = ? WHERE note_id = ?", now, noteId);
      });
    } catch (error) {
      throw this.databaseError("Unable to pin this task.", error);
    }
  }

  private async insertTask(database: ReturnType<DatabaseManager["getDatabase"]>, insightId: string, position: number, task: CoreTask, taskId: string): Promise<void> {
    await database.runAsync(
      `INSERT INTO core_note_tasks (id, insight_id, position, title, description, status, starts_at, due_at, completed_at,
        source_note_id, external_system, external_id, metadata_json, is_pinned, pinned_at, recurrence_kind,
        recurrence_value, series_key, occurrence_index, is_current, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      taskId, insightId, position, task.title, task.description, task.status, task.startsAt, task.dueAt, task.completedAt,
      task.sourceNoteId, task.externalSystem, task.externalId, JSON.stringify(task.metadata), task.isPinned ? 1 : 0,
      task.pinnedAt ?? null, task.recurrenceKind ?? null, task.recurrenceValue ?? null, task.seriesKey ?? null,
      task.occurrenceIndex ?? 0, task.isCurrent === false ? 0 : 1, task.endedAt ?? null,
    );
  }

  private mapAction(row: ActionRow): CoreActionItem {
    return { id: row.id, taskId: row.task_id, position: row.position, title: row.title, description: row.description, status: row.status as CoreInsightStatus, startsAt: row.starts_at, dueAt: row.due_at, completedAt: row.completed_at, sourceNoteId: row.source_note_id, externalSystem: row.external_system, externalId: row.external_id, metadata: this.parseMetadata(row.metadata_json) };
  }

  private mapTask(row: TaskRow, actions: ActionRow[]): CoreTask {
    return { id: row.id, title: row.title, description: row.description, status: row.status as CoreInsightStatus, startsAt: row.starts_at, dueAt: row.due_at, completedAt: row.completed_at, sourceNoteId: row.source_note_id, externalSystem: row.external_system, externalId: row.external_id, metadata: this.parseMetadata(row.metadata_json), actionItems: actions.map((item) => this.mapAction(item)), isPinned: row.is_pinned === 1, pinnedAt: row.pinned_at, recurrenceKind: row.recurrence_kind as TaskRecurrenceKind | null, recurrenceValue: row.recurrence_value, seriesKey: row.series_key, occurrenceIndex: row.occurrence_index, isCurrent: row.is_current === 1, endedAt: row.ended_at };
  }

  private parseMetadata(value: string): Record<string, unknown> {
    try { const parsed = JSON.parse(value) as unknown; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
  }

  private databaseError(message: string, error: unknown): DatabaseError {
    return new DatabaseError(message, { cause: error instanceof Error ? error : undefined });
  }
}
