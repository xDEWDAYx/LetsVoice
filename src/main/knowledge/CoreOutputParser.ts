export type StructuredNoteRawItem = {
  title: string;
  description: string | null;
  startsAtExpression: string | null;
  dueAtExpression: string | null;
  actionItems?: StructuredNoteRawItem[];
};
export type StructuredNoteRawTime = StructuredNoteRawItem & {
  endsAtExpression: string | null;
  remindAtExpression: string | null;
  allDay: boolean;
  timezone: string | null;
};
export type StructuredNoteContentRaw = { summary: string; keyPoints: string[] };
export type StructuredNoteActionsRaw = {
  tasks: StructuredNoteRawItem[];
  unassignedActionItems: StructuredNoteRawItem[];
  reminders: StructuredNoteRawTime[];
  calendarIntents: StructuredNoteRawTime[];
};
const MAX_FALLBACK_SUMMARY_CHARS = 240;

/** A non-empty transcript must always produce something useful in the Summary UI. */
export function ensureStructuredSummary(
  summary: string,
  transcript: string,
): string {
  const generated = summary.trim();
  if (generated) return generated;

  const normalizedTranscript = transcript.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalizedTranscript);
  if (characters.length <= MAX_FALLBACK_SUMMARY_CHARS)
    return normalizedTranscript;
  return `${characters
    .slice(0, MAX_FALLBACK_SUMMARY_CHARS - 1)
    .join('')
    .trimEnd()}…`;
}

export function parseStrictJson<T>(
  raw: string,
  validate: (value: unknown) => value is T,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error(
      'The local model returned unreadable JSON. Retry or choose a stronger model.',
    );
  }
  if (!validate(parsed))
    throw new Error(
      'The local model returned incomplete structured data. Please retry.',
    );
  return parsed;
}
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const nullableString = (v: unknown) => v === null || typeof v === 'string';
const rawItem = (v: unknown): v is StructuredNoteRawItem =>
  object(v) &&
  typeof v.title === 'string' &&
  nullableString(v.description) &&
  nullableString(v.startsAtExpression) &&
  nullableString(v.dueAtExpression) &&
  (v.actionItems === undefined ||
    (Array.isArray(v.actionItems) && v.actionItems.every(rawItem)));
const rawTime = (v: unknown): v is StructuredNoteRawTime => {
  if (!rawItem(v)) return false;
  const x = v as unknown as Record<string, unknown>;
  return (
    nullableString(x.endsAtExpression) &&
    nullableString(x.remindAtExpression) &&
    typeof x.allDay === 'boolean' &&
    nullableString(x.timezone)
  );
};
export const isStructuredNoteContent = (
  v: unknown,
): v is StructuredNoteContentRaw =>
  object(v) &&
  typeof v.summary === 'string' &&
  strings(v.keyPoints) &&
  Object.keys(v).every((k) => ['summary', 'keyPoints'].includes(k));
export const isStructuredNoteActions = (
  v: unknown,
): v is StructuredNoteActionsRaw =>
  object(v) &&
  Array.isArray(v.tasks) &&
  v.tasks.every(rawItem) &&
  Array.isArray(v.unassignedActionItems) &&
  v.unassignedActionItems.every(rawItem) &&
  Array.isArray(v.reminders) &&
  v.reminders.every(rawTime) &&
  Array.isArray(v.calendarIntents) &&
  v.calendarIntents.every(rawTime) &&
  Object.keys(v).every((k) =>
    ['tasks', 'unassignedActionItems', 'reminders', 'calendarIntents'].includes(
      k,
    ),
  );
