export const TASK_RECURRENCE_KINDS = ["daily", "weekdays", "weekly", "biweekly", "monthly"] as const;
export type TaskRecurrenceKind = (typeof TASK_RECURRENCE_KINDS)[number];

export type TaskRecurrenceEvidence = {
  phrase: string;
  kind: TaskRecurrenceKind;
  firstDate: string;
};

const ENGLISH_WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const CHINESE_WEEKDAYS: Record<string, number> = {
  日: 0, 天: 0, "7": 0,
  一: 1, "1": 1,
  二: 2, "2": 2,
  三: 3, "3": 3,
  四: 4, "4": 4,
  五: 5, "5": 5,
  六: 6, "6": 6,
};
const CHINESE_NUMBERS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};
const RECURRENCE_PATTERN = new RegExp([
  "每(?:个|個)?(?:周|週|星期|礼拜|禮拜)[一二三四五六日天1-7]",
  "每(?:隔)?(?:两|兩|2)(?:周|週|星期|礼拜|禮拜)",
  "隔周|隔週",
  "每(?:个|個)?(?:周|週|星期|礼拜|禮拜)",
  "每(?:个|個)?月(?:[0-9]{1,2}|[一二两兩三四五六七八九十]{1,3})[号號日]",
  "每(?:个|個)?月|每月",
  "每(?:个|個)?工作日|每工作日",
  "每天|每日|天天|逐日",
  "(?:every|each)\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
  "(?:on\\s+)?weekdays?|every\\s+(?:work|week)day",
  "every\\s+(?:other|two|2)\\s+weeks?|bi-?weekly|fortnightly",
  "every\\s+weeks?|weekly",
  "(?:on\\s+)?(?:the\\s+)?[0-9]{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?every\\s+month",
  "every\\s+month\\s+(?:on\\s+)?(?:the\\s+)?[0-9]{1,2}(?:st|nd|rd|th)?",
  "every\\s+months?|monthly",
  "every\\s+days?|each\\s+day|daily",
].join("|"), "giu");
const ANNOTATION_PATTERN = /\((\d{4}-\d{2}-\d{2}),\s*REPEAT=(daily|weekdays|weekly|biweekly|monthly)\)/iu;

export function normalizeTaskRecurrence(raw: unknown, evidence = ""): TaskRecurrenceKind | null {
  const value = `${typeof raw === "string" ? raw : ""} ${evidence}`.normalize("NFKC").toLocaleLowerCase();
  if (/\b(?:daily|every\s+day)\b|每天|每日|天天|逐日/.test(value)) return "daily";
  if (/\b(?:weekdays?|every\s+(?:work|week)day)\b|每(?:个)?工作日|每工作日/.test(value)) return "weekdays";
  if (/\b(?:biweekly|bi-weekly|fortnightly|every\s+(?:other|two|2)\s+weeks?)\b|每(?:隔)?(?:两|兩|2)周|隔周|隔週/.test(value)) return "biweekly";
  if (/\b(?:monthly|every\s+month)\b|每(?:个|個)?月|每月/.test(value)) return "monthly";
  if (/\b(?:weekly|every\s+week)\b|每(?:个|個)?周|每周|每週/.test(value)) return "weekly";
  return null;
}

/**
 * Adds deterministic first-occurrence and recurrence annotations to the copy
 * sent to the local model. The saved transcript is never modified.
 */
export function annotateTaskRecurrences(text: string, reference: Date): string {
  if (!text) return text;
  return text.replace(RECURRENCE_PATTERN, (phrase, offset: number, source: string) => {
    const openAnnotation = source.lastIndexOf("(", offset);
    const closedAnnotation = source.lastIndexOf(")", offset);
    if (openAnnotation > closedAnnotation && /REPEAT=/iu.test(source.slice(openAnnotation, offset))) return phrase;
    if (ANNOTATION_PATTERN.test(source.slice(offset + phrase.length))) return phrase;
    const evidence = recurrenceEvidenceForPhrase(phrase, reference);
    return evidence ? `${phrase}(${evidence.firstDate}, REPEAT=${evidence.kind})` : phrase;
  });
}

export function extractTaskRecurrenceEvidence(text: string): TaskRecurrenceEvidence | null {
  const annotation = text.match(ANNOTATION_PATTERN);
  if (!annotation || !TASK_RECURRENCE_KINDS.includes(annotation[2] as TaskRecurrenceKind)) return null;
  const annotationStart = annotation.index ?? 0;
  const phrase = text.slice(0, annotationStart).match(RECURRENCE_PATTERN)?.at(-1) ?? "";
  return { phrase, firstDate: annotation[1], kind: annotation[2] as TaskRecurrenceKind };
}

export function stripTaskRecurrenceAnnotations(value: string): string {
  return value.replace(new RegExp(ANNOTATION_PATTERN.source, "giu"), "").trim();
}

function recurrenceEvidenceForPhrase(phrase: string, reference: Date): TaskRecurrenceEvidence | null {
  const normalized = phrase.normalize("NFKC").toLocaleLowerCase()
    .replaceAll("週", "周")
    .replaceAll("個", "个")
    .replaceAll("禮拜", "礼拜")
    .replaceAll("號", "号")
    .replaceAll("兩", "两");
  const start = startOfLocalDay(reference);
  let kind: TaskRecurrenceKind;
  let first = start;

  const chineseWeekly = normalized.match(/每(?:个)?(?:周|星期|礼拜)([一二三四五六日天1-7])/u);
  const englishWeekly = normalized.match(/(?:every|each)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/u);
  const monthlyDay = normalized.match(/每(?:个)?月([0-9]{1,2}|[一二两三四五六七八九十]{1,3})[号日]/u);
  const englishMonthlyDay = normalized.match(/(?:([0-9]{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?every\s+month|every\s+month\s+(?:on\s+)?(?:the\s+)?([0-9]{1,2})(?:st|nd|rd|th)?)/u);

  if (chineseWeekly || englishWeekly) {
    kind = "weekly";
    const target = chineseWeekly ? CHINESE_WEEKDAYS[chineseWeekly[1]] : ENGLISH_WEEKDAYS[englishWeekly![1]];
    first = nextWeeklyDay(start, target);
  } else if (/每(?:隔)?(?:两|2)(?:周|星期|礼拜)|隔周|every\s+(?:other|two|2)\s+weeks?|bi-?weekly|fortnightly/u.test(normalized)) {
    kind = "biweekly";
    first = nextMonday(start);
  } else if (/每(?:个)?工作日|每工作日|(?:on\s+)?weekdays?|every\s+(?:work|week)day/u.test(normalized)) {
    kind = "weekdays";
    first = nextWorkday(start);
  } else if (/每天|每日|天天|逐日|every\s+days?|each\s+day|daily/u.test(normalized)) {
    kind = "daily";
  } else if (monthlyDay || englishMonthlyDay) {
    kind = "monthly";
    const desired = monthlyDay
      ? parseChineseInteger(monthlyDay[1])
      : Number(englishMonthlyDay![1] ?? englishMonthlyDay![2]);
    if (!desired || desired > 31) return null;
    first = nextMonthlyDay(start, desired);
  } else if (/每(?:个)?月|每月|every\s+months?|monthly/u.test(normalized)) {
    kind = "monthly";
  } else if (/每(?:个)?(?:周|星期|礼拜)|every\s+weeks?|weekly/u.test(normalized)) {
    kind = "weekly";
    first = nextMonday(start);
  } else {
    return null;
  }
  return { phrase, kind, firstDate: formatLocalDate(first) };
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function nextWeeklyDay(value: Date, target: number): Date {
  const result = new Date(value);
  let delta = (target - result.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  result.setDate(result.getDate() + delta);
  return result;
}

function nextMonday(value: Date): Date {
  return nextWeeklyDay(value, 1);
}

function nextWorkday(value: Date): Date {
  const result = new Date(value);
  while (result.getDay() === 0 || result.getDay() === 6) result.setDate(result.getDate() + 1);
  return result;
}

function nextMonthlyDay(value: Date, desiredDay: number): Date {
  let year = value.getFullYear();
  let month = value.getMonth();
  for (let attempts = 0; attempts < 24; attempts += 1) {
    const candidate = new Date(year, month, desiredDay);
    if (candidate.getMonth() === month && candidate.getTime() >= value.getTime()) return candidate;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  throw new Error("Unable to resolve a monthly recurrence date.");
}

function parseChineseInteger(value: string): number | null {
  if (/^\d+$/u.test(value)) return Number(value);
  const tenIndex = value.indexOf("十");
  if (tenIndex < 0) return CHINESE_NUMBERS[value] ?? null;
  const tens = tenIndex === 0 ? 1 : CHINESE_NUMBERS[value.slice(0, tenIndex)];
  const unitsText = value.slice(tenIndex + 1);
  const units = unitsText ? CHINESE_NUMBERS[unitsText] : 0;
  return tens && units !== undefined ? tens * 10 + units : null;
}

function formatLocalDate(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function recurrenceValue(kind: TaskRecurrenceKind | null, effectiveDate: string | null): string | null {
  if (!kind || !effectiveDate) return null;
  const date = new Date(effectiveDate);
  if (Number.isNaN(date.getTime())) return null;
  if (kind === "weekly" || kind === "biweekly") return String(date.getDay());
  if (kind === "monthly") return String(date.getDate());
  return null;
}

export function recurringSeriesKey(
  noteId: string,
  title: string,
  kind: TaskRecurrenceKind,
  value: string | null,
): string {
  const normalizedTitle = title.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  return `${noteId}|${normalizedTitle}|${kind}|${value ?? ""}`;
}

export function nextRecurringDate(
  currentValue: string | null,
  kind: TaskRecurrenceKind,
  completedAt: string,
  value: string | null,
): string {
  const completed = new Date(completedAt);
  const current = currentValue ? new Date(currentValue) : new Date(completedAt);
  if (Number.isNaN(completed.getTime()) || Number.isNaN(current.getTime())) throw new Error("Recurring task has an invalid date.");

  let candidate = new Date(current);
  if (kind === "daily") {
    do candidate.setDate(candidate.getDate() + 1); while (candidate.getTime() <= completed.getTime());
  } else if (kind === "weekdays") {
    do {
      candidate.setDate(candidate.getDate() + 1);
    } while (candidate.getTime() <= completed.getTime() || candidate.getDay() === 0 || candidate.getDay() === 6);
  } else if (kind === "weekly" || kind === "biweekly") {
    const days = kind === "weekly" ? 7 : 14;
    do candidate.setDate(candidate.getDate() + days); while (candidate.getTime() <= completed.getTime());
  } else {
    const desiredDay = Number(value) || current.getDate();
    do {
      const nextMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 1, candidate.getHours(), candidate.getMinutes(), candidate.getSeconds(), candidate.getMilliseconds());
      const daysInMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
      if (desiredDay > daysInMonth) {
        candidate = nextMonth;
        continue;
      }
      candidate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), desiredDay, current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds());
    } while (candidate.getTime() <= completed.getTime() || candidate.getDate() !== desiredDay);
  }
  return candidate.toISOString();
}

export function rollTaskSchedule(
  startsAt: string | null,
  dueAt: string | null,
  kind: TaskRecurrenceKind,
  completedAt: string,
  value: string | null,
): { startsAt: string | null; dueAt: string | null } {
  const effective = dueAt ?? startsAt;
  const next = nextRecurringDate(effective, kind, completedAt, value);
  if (!effective) return dueAt !== null ? { startsAt, dueAt: next } : { startsAt: next, dueAt };
  const delta = new Date(next).getTime() - new Date(effective).getTime();
  const shift = (input: string | null) => input ? new Date(new Date(input).getTime() + delta).toISOString() : null;
  return { startsAt: shift(startsAt), dueAt: shift(dueAt) };
}
