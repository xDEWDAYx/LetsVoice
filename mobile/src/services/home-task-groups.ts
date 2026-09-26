import type { CoreTask } from "@/domain/core-note-insight/core-note-insight";

export type PendingTaskGroupKey = "overdue" | "today" | "upcoming" | "unscheduled";

export type HomeTaskGroups = {
  pending: { key: PendingTaskGroupKey; label: string; tasks: CoreTask[] }[];
  completed: CoreTask[];
};

export function toLocalDateKey(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function taskEffectiveDate(task: CoreTask): string | null {
  return task.dueAt ?? task.startsAt;
}

export function groupHomeTasks(tasks: readonly CoreTask[], now = new Date()): HomeTaskGroups {
  const today = toLocalDateKey(now)!;
  const buckets: Record<PendingTaskGroupKey, CoreTask[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    unscheduled: [],
  };

  for (const task of tasks) {
    if (task.status !== "pending") continue;
    const dateKey = toLocalDateKey(taskEffectiveDate(task));
    if (dateKey === null) buckets.unscheduled.push(task);
    else if (dateKey < today) buckets.overdue.push(task);
    else if (dateKey === today) buckets.today.push(task);
    else buckets.upcoming.push(task);
  }

  const sortByDate = (left: CoreTask, right: CoreTask) =>
    Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned)) ||
    (taskEffectiveDate(left) ?? "").localeCompare(taskEffectiveDate(right) ?? "") ||
    left.title.localeCompare(right.title);
  Object.values(buckets).forEach((bucket) => bucket.sort(sortByDate));

  const completed = tasks
    .filter((task) => task.status === "completed")
    .sort((left, right) =>
      (right.completedAt ?? "").localeCompare(left.completedAt ?? "") ||
      left.title.localeCompare(right.title),
    );

  return {
    pending: [
      { key: "overdue", label: "Overdue", tasks: buckets.overdue },
      { key: "today", label: "Today", tasks: buckets.today },
      { key: "upcoming", label: "Upcoming", tasks: buckets.upcoming },
      { key: "unscheduled", label: "Unscheduled", tasks: buckets.unscheduled },
    ],
    completed,
  };
}
