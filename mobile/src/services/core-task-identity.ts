export function normalizeTaskTitle(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function effectiveTaskDateKey(dueAt: string | null, startsAt: string | null): string {
  const value = dueAt ?? startsAt;
  if (!value) return "unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unscheduled";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function coreTaskIdentity(title: string, dueAt: string | null, startsAt: string | null): string {
  return `${normalizeTaskTitle(title)}::${effectiveTaskDateKey(dueAt, startsAt)}`;
}
