import {
  annotateCoreNoteDates,
  stripCoreNoteDateAnnotations,
} from "./core-note-date-rewriter.ts";

export { annotateCoreNoteDates, stripCoreNoteDateAnnotations };

export type ResolvedCoreNoteTime = {
  raw: string;
  normalized: string | null;
  resolvedDate: string | null;
  display: string;
  precision: "month" | "date" | "datetime" | "time-only" | "unresolved";
  isApproximate: boolean;
};

const WEEKDAYS: Record<string, number> = {
  monday: 1, mon: 1, "周一": 1, "週一": 1, "星期一": 1,
  tuesday: 2, tue: 2, tues: 2, "周二": 2, "週二": 2, "星期二": 2,
  wednesday: 3, wed: 3, "周三": 3, "週三": 3, "星期三": 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, "周四": 4, "週四": 4, "星期四": 4,
  friday: 5, fri: 5, "周五": 5, "週五": 5, "星期五": 5,
  saturday: 6, sat: 6, "周六": 6, "週六": 6, "星期六": 6,
  sunday: 0, sun: 0, "周日": 0, "週日": 0, "周天": 0, "週天": 0, "星期日": 0, "星期天": 0,
};
const CHINESE_NUMBERS: Record<string, number> = { 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const ENGLISH_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const EN_CLOCK_SOURCE = String.raw`(?:(?:1[0-2]|0?\d)(?::[0-5]\d)?\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)`;
const EN_MONTH_SOURCE = String.raw`(?:january|february|march|april|may|june|july|august|september|october|november|december)`;
const EN_DATE_SOURCE = String.raw`(?:\d{4}-\d{1,2}-\d{1,2}|${EN_MONTH_SOURCE}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+${EN_MONTH_SOURCE}(?:,?\s+\d{4})?)`;
const EN_WEEKDAY_SOURCE = String.raw`(?:(?:next|this)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)`;
const CORE_TIME_PHRASE_PATTERNS = [
  /(?:提前|提早)\s*(?:\d+|[一二两兩三四五六七八九十]{1,3})\s*(?:个|個)?\s*(?:天|日|周|週|星期|礼拜|禮拜)(?:\s*\(\d{4}-\d{2}-\d{2}\))?/u,
  new RegExp(String.raw`\b(?:at\s+${EN_CLOCK_SOURCE}\s+)?(?:before|by|on|until|from)\s+${EN_DATE_SOURCE}(?:\s+at\s+${EN_CLOCK_SOURCE})?\b`, "iu"),
  new RegExp(String.raw`\b(?:at\s+${EN_CLOCK_SOURCE}\s+on\s+)?${EN_DATE_SOURCE}(?:\s+at\s+${EN_CLOCK_SOURCE})?\b`, "iu"),
  new RegExp(String.raw`\b(?:before|by|on|until|from|at)\s+${EN_WEEKDAY_SOURCE}(?:\s+at\s+${EN_CLOCK_SOURCE})?\b`, "iu"),
  new RegExp(String.raw`\b${EN_WEEKDAY_SOURCE}(?:\s+at\s+${EN_CLOCK_SOURCE})?\b`, "iu"),
  new RegExp(String.raw`\b(?:in\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+hours?(?:\s+(?:later|from now))?\b`, "iu"),
  new RegExp(String.raw`\b(?:before|by|on|until|from|at)?\s*(?:the\s+)?(?:day after tomorrow|tomorrow|today|tonight|next month)(?:\s+at\s+${EN_CLOCK_SOURCE})?\b`, "iu"),
  new RegExp(String.raw`\b(?:at\s+)?${EN_CLOCK_SOURCE}(?:\s+on\s+(?:the\s+)?same day)?\b`, "iu"),
  /(?:在|於|于|截至|截止(?:到)?|之前|前|到)?\s*(?:\d{4}\s*年\s*)?(?:\d{1,2}|[一二两兩三四五六七八九十]{1,3})\s*月\s*(?:\d{1,2}|[一二两兩三四五六七八九十]{1,3})\s*[日号號](?:\s*(?:上午|早上|中午|下午|晚上)?\s*(?:\d{1,2}|[一二两兩三四五六七八九十]+)\s*[点點时時](?:\s*\d{1,2}\s*分?)?)?/u,
  /(?:在|於|于|截至|截止(?:到)?|之前|前|到)?\s*(?:(?:下|本)?(?:周|週|星期|礼拜|禮拜)[一二三四五六日天]|今天|今日|明天|明日|后天|後天|今晚|下(?:个|個)?月)(?:\s*(?:上午|早上|中午|下午|晚上)?\s*(?:\d{1,2}|[一二两兩三四五六七八九十]+)\s*[点點时時](?:\s*\d{1,2}\s*分?)?)?/u,
  /(?:\d+|[一二两兩三四五六七八九十]+)\s*小[时時](?:后|後)/u,
  /(?:上午|早上|中午|下午|晚上)?\s*(?:\d{1,2}|[一二两兩三四五六七八九十]+)\s*[点點时時](?:\s*\d{1,2}\s*分?)?/u,
] as const;

/** Keeps the existing free-form time-field contract while removing surrounding task prose. */
export function extractCoreNoteTimeExpression(expression: unknown): string | null {
  if (typeof expression !== "string" || !expression.trim()) return null;
  const matches = CORE_TIME_PHRASE_PATTERNS
    .map((pattern) => expression.trim().match(pattern)?.[0]?.trim() ?? "")
    .filter(Boolean)
    .map((match) => match.replace(/^[,;，；]\s*|\s*[,.!?;，。！？；]+$/gu, "").trim());
  if (!matches.length) return null;
  return matches.reduce((best, candidate) => candidate.length > best.length ? candidate : best);
}

export function getLocalReferenceTime(now: Date = new Date()): { instant: Date; localIso: string; timezone: string } {
  return { instant: new Date(now), localIso: formatLocalDateTime(now), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local" };
}

export function resolveCoreNoteTime(expression: unknown, reference: Date): ResolvedCoreNoteTime | null {
  if (typeof expression !== "string" || !expression.trim()) return null;
  const raw = expression.trim();
  const prepared = annotateCoreNoteDates(raw, reference);
  const lower = raw.toLocaleLowerCase();
  const preparedLower = prepared.toLocaleLowerCase();
  if (["null", "unknown", "undefined", "none", "n/a"].includes(lower)) return null;
  const approximate = /\b(around|about|approximately)\b|大约|约|左右/.test(lower);
  const relativeHours = lower.match(/(?:in\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*hours?\s*(?:later|from now)?|([一二两兩三四五六七八九十]+)\s*小[时時](?:后|後)/u);
  if (relativeHours) {
    const hours = relativeHours[1]
      ? (/^\d+$/.test(relativeHours[1]) ? Number(relativeHours[1]) : ENGLISH_NUMBERS[relativeHours[1]] ?? Number.NaN)
      : parseChineseInteger(relativeHours[2]);
    if (Number.isFinite(hours)) {
      const date = new Date(reference.getTime() + hours * 60 * 60 * 1000);
      return result(raw, formatLocalDateTime(date), formatDate(date), "datetime", approximate);
    }
  }

  const explicit = parseExplicitDate(preparedLower, reference);
  let date: Date | null = explicit?.date ?? null;
  const leadDays = parseLeadDays(lower);
  if (date && leadDays !== null && explicit?.isActionableLead !== true) date = addDays(date, -leadDays);
  if (date) {
    // An explicit year-month-day always wins over relative words elsewhere in the phrase.
  } else if (/大(?:后|後)天/u.test(lower)) date = addDays(startOfDay(reference), 3);
  else if (/\bday after tomorrow\b|(?:后|後)天/u.test(lower)) date = addDays(startOfDay(reference), 2);
  else if (/\btomorrow\b|明天|明日/u.test(lower)) date = addDays(startOfDay(reference), 1);
  else if (/\btoday\b|今天|今日/u.test(lower)) date = startOfDay(reference);
  else {
    const weekday = findWeekday(lower);
    if (weekday !== null) {
      const isNext = /\bnext\b|下(?:个|個)?(?:周|週|星期|礼拜|禮拜)/u.test(lower);
      date = weekdayDate(reference, weekday, isNext);
    }
  }

  if (!date && /\bnext month\b|下(?:个|個)?月/u.test(lower)) {
    const month = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
    return result(raw, formatMonth(month), null, "month", approximate);
  }

  const time = parseClockTime(lower, leadDays !== null);
  if (date && time) {
    date.setHours(time.hour, time.minute, 0, 0);
    return result(raw, formatLocalDateTime(date), formatDate(date), "datetime", approximate);
  }
  if (date) return result(raw, formatDate(date), formatDate(date), "date", approximate);
  if (time) return result(raw, null, null, "time-only", approximate);
  return result(raw, null, null, "unresolved", approximate);
}

function result(raw: string, normalized: string | null, resolvedDate: string | null, precision: ResolvedCoreNoteTime["precision"], isApproximate: boolean): ResolvedCoreNoteTime {
  return { raw, normalized, resolvedDate, display: raw, precision, isApproximate };
}
function startOfDay(value: Date): Date { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }
function addDays(value: Date, days: number): Date { const result = new Date(value); result.setDate(result.getDate() + days); return result; }
function weekdayDate(reference: Date, target: number, nextWeek: boolean): Date {
  const base = startOfDay(reference);
  if (nextWeek) {
    const daysToMonday = (8 - base.getDay()) % 7 || 7;
    return addDays(base, daysToMonday + ((target + 6) % 7));
  }
  const delta = (target - base.getDay() + 7) % 7;
  return addDays(base, delta);
}
function findWeekday(value: string): number | null {
  for (const [name, day] of Object.entries(WEEKDAYS)) if (value.includes(name)) return day;
  return null;
}
type ExplicitDate = { date: Date; isActionableLead: boolean };
type AnnotatedDate = ExplicitDate & { index: number; end: number };

function parseExplicitDate(value: string, reference: Date): ExplicitDate | null {
  const annotated = annotatedDates(value);
  if (annotated.length) return selectAnnotatedDate(value, annotated);

  const months: Record<string, number> = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
    may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
    september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
    december: 12, dec: 12,
  };
  const monthName = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  const chinese = value.match(/(?:(\d{4})\s*年\s*)?(\d{1,2}|[一二两兩三四五六七八九十]{1,3})\s*月\s*(\d{1,2}|[一二两兩三四五六七八九十]{1,3})\s*(?:日|号|號)/u);
  const dayMonth = value.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthName})(?:[\\s,]+(\\d{4}))?\\b`));
  const monthDay = value.match(new RegExp(`\\b(${monthName})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[\\s,]+(\\d{4}))?\\b`));
  if (!iso && !chinese && !dayMonth && !monthDay) return null;

  const month = iso
    ? Number(iso[2])
    : chinese
      ? parseChineseInteger(chinese[2])
      : months[dayMonth?.[2] ?? monthDay![1]];
  const day = iso
    ? Number(iso[3])
    : chinese
      ? parseChineseInteger(chinese[3])
      : Number(dayMonth?.[1] ?? monthDay?.[2]);
  const explicitYear = iso?.[1] ?? chinese?.[1] ?? dayMonth?.[3] ?? monthDay?.[3];
  const year = explicitYear ? Number(explicitYear) : inferredYear(month, day, reference);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? { date, isActionableLead: false }
    : null;
}

function annotatedDates(value: string): AnnotatedDate[] {
  return [...value.matchAll(/\((\d{4})-(\d{2})-(\d{2})(?:,[^)]*)?\)/gu)].flatMap((match) => {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return [];
    const index = match.index;
    const prefix = value.slice(Math.max(0, index - 36), index);
    return [{
      date,
      index,
      end: index + match[0].length,
      isActionableLead: /(?:提前|提早)\s*(?:\d+|[一二两兩三四五六七八九十]{1,3})\s*(?:天|日|(?:个|個)?(?:周|週|星期|礼拜|禮拜))\s*$/u.test(prefix),
    }];
  });
}

function selectAnnotatedDate(value: string, candidates: AnnotatedDate[]): ExplicitDate {
  const actionableLead = candidates.find((candidate) => candidate.isActionableLead);
  if (actionableLead) return actionableLead;
  if (candidates.length === 1) return candidates[0];

  const reminderAnchors = [
    ...value.matchAll(/\b(?:remind(?:er|\s+me|\s+us)?|remember\s+to|notify|alert)\b/giu),
    ...value.matchAll(/(?:提醒|记得|記得|通知|闹钟|鬧鐘)/gu),
  ].map((match) => ({ index: match.index, end: match.index + match[0].length }));
  if (!reminderAnchors.length) return candidates[0];

  return [...candidates].sort((left, right) =>
    minimumRangeDistance(left, reminderAnchors) - minimumRangeDistance(right, reminderAnchors) ||
    left.index - right.index,
  )[0];
}

function minimumRangeDistance(
  candidate: Pick<AnnotatedDate, "index" | "end">,
  anchors: readonly { index: number; end: number }[],
): number {
  return anchors.reduce((minimum, anchor) => {
    if (candidate.end < anchor.index) return Math.min(minimum, anchor.index - candidate.end);
    if (anchor.end < candidate.index) return Math.min(minimum, candidate.index - anchor.end);
    return 0;
  }, Number.POSITIVE_INFINITY);
}

function parseLeadDays(value: string): number | null {
  const chinese = value.match(/(?:提前|提早)\s*(\d+|[一二两兩三四五六七八九十]{1,3})\s*(?:天|日)/u);
  if (chinese) return parseChineseInteger(chinese[1]);
  const english = value.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+days?\s+(?:before|earlier)\b/);
  if (!english) return null;
  return /^\d+$/.test(english[1]) ? Number(english[1]) : ENGLISH_NUMBERS[english[1]] ?? null;
}

function parseChineseInteger(value: string): number {
  if (/^\d+$/u.test(value)) return Number(value);
  const normalized = value.replace(/[两兩]/gu, "二");
  if (normalized === "十") return 10;
  const [tens, units] = normalized.split("十");
  if (units !== undefined) {
    const tensValue = tens ? CHINESE_NUMBERS[tens] ?? Number.NaN : 1;
    const unitsValue = units ? CHINESE_NUMBERS[units] ?? Number.NaN : 0;
    return tensValue * 10 + unitsValue;
  }
  return CHINESE_NUMBERS[normalized] ?? Number.NaN;
}

function inferredYear(month: number, day: number, reference: Date): number {
  const currentYear = reference.getFullYear();
  const candidate = new Date(currentYear, month - 1, day);
  const gracePastMs = 45 * 24 * 60 * 60 * 1000;
  return startOfDay(reference).getTime() - candidate.getTime() > gracePastMs
    ? currentYear + 1
    : currentYear;
}
type ClockCandidate = { index: number; end: number; hour: number; minute: number };
type TextRange = { index: number; end: number };

function parseClockTime(value: string, preferReminderTime = false): { hour: number; minute: number } | null {
  const candidates: ClockCandidate[] = [];
  for (const match of value.matchAll(/\b(1[0-2]|0?\d)(?::([0-5]\d))?\s*(am|pm)\b/gu)) {
    let hour = Number(match[1]) % 12;
    if (match[3] === "pm") hour += 12;
    candidates.push({ index: match.index, end: match.index + match[0].length, hour, minute: Number(match[2] ?? 0) });
  }
  for (const match of value.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm)\b)/gu)) {
    candidates.push({ index: match.index, end: match.index + match[0].length, hour: Number(match[1]), minute: Number(match[2]) });
  }
  for (const match of value.matchAll(/(上午|早上|中午|下午|晚上)?\s*(\d{1,2}|[一二两兩三四五六七八九十]+)\s*[点點时時](?:\s*(\d{1,2})\s*分?)?/gu)) {
    const parsedHour = /^\d+$/.test(match[2]) ? Number(match[2]) : parseChineseInteger(match[2]);
    if (!Number.isFinite(parsedHour) || parsedHour > 23) continue;
    let hour = parsedHour;
    if ((match[1] === "下午" || match[1] === "晚上") && hour < 12) hour += 12;
    if (match[1] === "中午" && hour < 11) hour += 12;
    candidates.push({ index: match.index, end: match.index + match[0].length, hour, minute: Number(match[3] ?? 0) });
  }
  candidates.sort((left, right) => left.index - right.index);
  const selected = preferReminderTime ? reminderClockCandidate(value, candidates) : candidates[0];
  return selected ? { hour: selected.hour, minute: selected.minute } : null;
}

function reminderClockCandidate(value: string, candidates: readonly ClockCandidate[]): ClockCandidate | undefined {
  if (candidates.length < 2) return candidates[0];
  const leadRanges = ranges(
    value,
    /(?:提前|提早)\s*(?:\d+|[一二两兩三四五六七八九十]{1,3})\s*(?:天|日)|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+days?\s+(?:before|earlier)\b/gu,
  );
  const reminderRanges = [
    ...ranges(value, /\b(?:remind(?:er|\s+me|\s+us)?|remember\s+to|notify|alert)\b/gu),
    ...ranges(value, /(?:提醒|记得|記得|通知|闹钟|鬧鐘)/gu),
  ];
  const directlyAssociated = candidates.flatMap((candidate) =>
    reminderRanges.flatMap((anchor) => {
      const association = reminderAssociation(
        value,
        candidate,
        anchor,
        candidates,
        leadRanges,
        reminderRanges,
      );
      return association ? [{ candidate, ...association }] : [];
    })
  ).sort((left, right) =>
    left.priority - right.priority ||
    left.distance - right.distance ||
    minimumDistance(leadRanges, left.candidate) - minimumDistance(leadRanges, right.candidate) ||
    left.candidate.index - right.candidate.index,
  );
  if (directlyAssociated[0]) return directlyAssociated[0].candidate;

  return [...candidates].sort((left, right) =>
    minimumDistance(leadRanges, left) - minimumDistance(leadRanges, right) ||
    left.index - right.index,
  )[0];
}

function reminderAssociation(
  value: string,
  candidate: ClockCandidate,
  anchor: TextRange,
  candidates: readonly ClockCandidate[],
  leadRanges: readonly TextRange[],
  reminderRanges: readonly TextRange[],
): { priority: number; distance: number } | null {
  const anchorBeforeClock = anchor.end <= candidate.index;
  const clockBeforeAnchor = candidate.end <= anchor.index;
  if (!anchorBeforeClock && !clockBeforeAnchor) return null;
  const start = anchorBeforeClock ? anchor.end : candidate.end;
  const end = anchorBeforeClock ? candidate.index : anchor.index;
  const distance = end - start;
  if (distance > 48) return null;
  if (candidates.some((other) => other !== candidate && other.index >= start && other.end <= end)) return null;

  const between = value.slice(start, end);
  if (hasTargetDateEvidence(between)) return null;
  if (clockBeforeAnchor && clockFollowsTargetDate(value, candidate, leadRanges, reminderRanges)) return null;
  const leadBetween = leadRanges.some((range) => range.index >= start && range.end <= end);
  return {
    priority: leadBetween ? 0 : (anchorBeforeClock ? 1 : 2),
    distance,
  };
}

function clockFollowsTargetDate(
  value: string,
  candidate: ClockCandidate,
  leadRanges: readonly TextRange[],
  reminderRanges: readonly TextRange[],
): boolean {
  const start = Math.max(0, candidate.index - 48);
  const preceding = value.slice(start, candidate.index);
  if (!hasTargetDateEvidence(preceding)) return false;
  return ![...leadRanges, ...reminderRanges].some((range) =>
    range.index >= start && range.end <= candidate.index,
  );
}

function hasTargetDateEvidence(value: string): boolean {
  return /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}\b|\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b|\b\d{4}-\d{1,2}-\d{1,2}\b|(?:\d{1,2}|[一二两兩三四五六七八九十]{1,3})\s*月\s*(?:\d{1,2}|[一二两兩三四五六七八九十]{1,3})\s*(?:日|号|號)/iu.test(value);
}

function ranges(value: string, pattern: RegExp): TextRange[] {
  return [...value.matchAll(pattern)].map((match) => ({
    index: match.index,
    end: match.index + match[0].length,
  }));
}

function minimumDistance(rangesToCompare: readonly TextRange[], candidate: TextRange): number {
  return rangesToCompare.reduce((minimum, range) => {
    if (candidate.end < range.index) return Math.min(minimum, range.index - candidate.end);
    if (range.end < candidate.index) return Math.min(minimum, candidate.index - range.end);
    return 0;
  }, Number.POSITIVE_INFINITY);
}
function pad(value: number): string { return String(value).padStart(2, "0"); }
function formatDate(value: Date): string { return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`; }
function formatMonth(value: Date): string { return `${value.getFullYear()}-${pad(value.getMonth() + 1)}`; }
function formatLocalDateTime(value: Date): string {
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offset = `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
  return `${formatDate(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}${offset}`;
}
