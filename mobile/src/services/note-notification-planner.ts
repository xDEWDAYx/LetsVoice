import type { CoreTask } from "@/domain/core-note-insight/core-note-insight";

export type PlannedNoteNotification = {
  identifier: string;
  itemId: string;
  kind: "task";
  noteId: string;
  title: string;
  body: string;
  triggerAt: Date;
};

type NotificationSource = {
  tasks: readonly CoreTask[];
};

function precision(metadata: Record<string, unknown>, field: string): string | null {
  const expressions = metadata.timeExpressions;
  if (!expressions || typeof expressions !== "object" || Array.isArray(expressions)) return null;
  const expression = (expressions as Record<string, unknown>)[field];
  if (!expression || typeof expression !== "object" || Array.isArray(expression)) return null;
  const value = (expression as Record<string, unknown>).precision;
  return typeof value === "string" ? value : null;
}

function localTrigger(value: string, isDateOnly: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/u.test(value)) return null;
  if (isDateOnly || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0);
    return date.getFullYear() === Number(match[1]) &&
      date.getMonth() === Number(match[2]) - 1 &&
      date.getDate() === Number(match[3])
      ? date
      : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stableIdentifier(itemId: string): string {
  const safeId = itemId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 160);
  return `speakspace-task-${safeId}`;
}

export function planNoteNotifications(
  source: NotificationSource,
  now: Date = new Date(),
): PlannedNoteNotification[] {
  const planned: PlannedNoteNotification[] = [];
  for (const task of source.tasks) {
    const field = task.dueAt ? "dueAt" : "startsAt";
    const value = task.dueAt ?? task.startsAt;
    if (task.status !== "pending" || task.isCurrent === false || !value) continue;
    const triggerAt = localTrigger(value, precision(task.metadata, field) === "date");
    if (!triggerAt || triggerAt.getTime() <= now.getTime()) continue;
    planned.push({
      identifier: stableIdentifier(task.id),
      itemId: task.id,
      kind: "task",
      noteId: task.sourceNoteId,
      title: task.title,
      body: "Task due — open the source Note in LetsVoice.",
      triggerAt,
    });
  }
  return planned.sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime());
}
