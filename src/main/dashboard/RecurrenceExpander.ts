/**
 * 把「每天」「每周五」这类重复待办展开成一条条具体日期。
 *
 * 为什么由代码展开而不是让模型逐条输出：
 * 「每天」在半年里就是 180 条，让本地小模型把它们一条条写成 JSON，
 * 既慢又必然在中途跑偏或截断。模型只需要给出**起点 + 重复类型**，
 * 剩下的日期推算交给这里，结果是确定的。
 *
 * todos 表没有重复字段，日历也是按 date_string 逐日渲染，
 * 所以「每次重复都要出现在日历上」只能落成多行。
 */

import { toLocalDateString } from './DateContext';

export type RepeatKind =
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly';

const REPEAT_KINDS: RepeatKind[] = [
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
];

/**
 * 各类重复展开多久。
 *
 * 高频的排短一点，否则一条「每天」就能把日历铺满一年。
 * 低频的排长一点，不然月度事项只剩两三条没什么用。
 */
const HORIZON_DAYS: Record<RepeatKind, number> = {
  daily: 90,
  weekdays: 90,
  weekly: 182,
  biweekly: 182,
  monthly: 365,
};

/** 单条重复任务最多展开多少次，防止异常输入把库写爆。 */
const MAX_OCCURRENCES = 120;

/** 模型可能给出 "WEEKLY"、"every week" 等写法，统一收敛到枚举。 */
export function normalizeRepeat(raw: unknown): RepeatKind | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === '' || value === 'none' || value === 'null') return null;
  if (REPEAT_KINDS.includes(value as RepeatKind)) return value as RepeatKind;

  if (/every\s*day|daily/.test(value)) return 'daily';
  if (/weekday|工作日/.test(value)) return 'weekdays';
  if (/bi-?weekly|fortnight|every\s*two\s*weeks/.test(value)) return 'biweekly';
  if (/every\s*week|weekly/.test(value)) return 'weekly';
  if (/every\s*month|monthly/.test(value)) return 'monthly';
  return null;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 从 start 起按 repeat 展开出所有发生日期（含 start）。
 *
 * repeat 为 null 时返回单条，调用方不必分支处理。
 * 月度按「同一号」推进；遇到 31 号这种月份里不存在的日期直接跳过该月，
 * 而不是滑到下月 1 号 —— 后者会让待办出现在明显不对的日子。
 */
export function expandOccurrences(
  start: string,
  repeat: RepeatKind | null,
  horizonDays: number = HORIZON_DAYS[repeat ?? 'daily'],
): string[] {
  if (!repeat) return [start];

  const first = new Date(`${start}T00:00:00`);
  if (Number.isNaN(first.getTime())) return [start];

  const limit = addDays(first, horizonDays);
  const dates: string[] = [];

  if (repeat === 'monthly') {
    const day = first.getDate();
    for (
      let index = 0;
      dates.length < MAX_OCCURRENCES && index < 400;
      index += 1
    ) {
      const candidate = new Date(
        first.getFullYear(),
        first.getMonth() + index,
        day,
      );
      if (candidate.getTime() > limit.getTime()) break;
      // 2 月没有 30 号：Date 会进位到 3 月，跳过这种月份。
      if (candidate.getDate() === day) dates.push(toLocalDateString(candidate));
    }
    return dates.length > 0 ? dates : [start];
  }

  const STEP_DAYS: Record<string, number> = { biweekly: 14, weekly: 7 };
  const step = STEP_DAYS[repeat] ?? 1;
  let cursor = first;
  while (
    cursor.getTime() <= limit.getTime() &&
    dates.length < MAX_OCCURRENCES
  ) {
    if (repeat !== 'weekdays' || !isWeekend(cursor)) {
      dates.push(toLocalDateString(cursor));
    }
    cursor = addDays(cursor, step);
  }

  return dates.length > 0 ? dates : [start];
}
