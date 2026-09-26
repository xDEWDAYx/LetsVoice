import type { CoreTask } from "@/domain/core-note-insight/core-note-insight";

export type HomeCalendarItem = {
  id: string;
  sourceNoteId: string;
  title: string;
  kind: "task";
  dateKey: string;
  source: "structured";
};

type HomeCalendarInput = {
  tasks: readonly CoreTask[];
};

function keyFromIso(value: string | null): string | null {
  if (!value) return null;
  const direct = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) {
    const date = new Date(Number(direct[1]), Number(direct[2]) - 1, Number(direct[3]));
    return date.getFullYear() === Number(direct[1]) &&
      date.getMonth() === Number(direct[2]) - 1 &&
      date.getDate() === Number(direct[3])
      ? `${direct[1]}-${direct[2]}-${direct[3]}`
      : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function buildHomeCalendarItems({ tasks }: HomeCalendarInput): HomeCalendarItem[] {
  return tasks.flatMap((task) => {
    if (task.status !== "pending" || task.isCurrent === false) return [];
    const dateKey = keyFromIso(task.dueAt ?? task.startsAt);
    return dateKey ? [{
      id: task.id,
      sourceNoteId: task.sourceNoteId,
      title: task.title,
      kind: "task" as const,
      dateKey,
      source: "structured" as const,
    }] : [];
  }).sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.title.localeCompare(right.title));
}
