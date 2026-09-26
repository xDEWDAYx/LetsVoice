export type CoreInsightStatus = "pending" | "completed" | "cancelled";

export type CoreActionItem = {
  id: string;
  taskId: string | null;
  position: number;
  title: string;
  description: string | null;
  status: CoreInsightStatus;
  startsAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  sourceNoteId: string;
  externalSystem: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
};

export type CoreTask = {
  id: string;
  title: string;
  description: string | null;
  status: CoreInsightStatus;
  startsAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  sourceNoteId: string;
  externalSystem: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
  actionItems: CoreActionItem[];
  isPinned?: boolean;
  pinnedAt?: string | null;
  recurrenceKind?: import("@/services/task-recurrence").TaskRecurrenceKind | null;
  recurrenceValue?: string | null;
  seriesKey?: string | null;
  occurrenceIndex?: number;
  isCurrent?: boolean;
  endedAt?: string | null;
};

export class CoreNoteInsight {
  public constructor(
    private readonly id: string,
    private readonly noteId: string,
    private readonly summary: string,
    private readonly keyPoints: string[],
    private readonly tasks: CoreTask[],
    private readonly unassignedActionItems: CoreActionItem[],
    private readonly modelId: string,
    private readonly createdAt: string,
    private readonly updatedAt: string,
  ) {}

  public getId(): string { return this.id; }
  public getNoteId(): string { return this.noteId; }
  public getSummary(): string { return this.summary; }
  public getKeyPoints(): readonly string[] { return this.keyPoints; }
  public getTasks(): readonly CoreTask[] { return this.tasks; }
  public getUnassignedActionItems(): readonly CoreActionItem[] { return this.unassignedActionItems; }
  public getActionItems(): readonly CoreActionItem[] { return [...this.tasks.flatMap((task) => task.actionItems), ...this.unassignedActionItems]; }
  public getModelId(): string { return this.modelId; }
  public getCreatedAt(): string { return this.createdAt; }
  public getUpdatedAt(): string { return this.updatedAt; }
}
