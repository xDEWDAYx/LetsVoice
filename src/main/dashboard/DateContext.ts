/**
 * 待办提取的日期基准。
 *
 * 之前 prompt 只塞了一个 `2026-08-20` 给模型，于是有三个问题：
 *
 * 1. 只给日期不给星期。模型无从知道 2026-08-20 是星期四，
 *    「周五之前」「下周一」这类说法根本没法算，只能退回它唯一见过的
 *    那个日期 —— 也就是今天。用户看到的「凭空多出今天」就是这么来的。
 * 2. 用了 toISOString()，那是 UTC。UTC+8 的用户在早上八点前，
 *    取到的是前一天，整条时间线差一天。
 * 3. 本地小模型的日期算术本来就不可靠，不该让它算。
 *
 * 所以这里改成：把常见相对说法**预先算好**列成对照表塞进 prompt，
 * 模型只需要查表，不需要做任何日期推算。
 */

/** 周一为一周之首，符合中文语境下「本周 / 下周」的习惯。 */
const WEEKDAY_LABELS = [
  { zh: '周一', en: 'Monday' },
  { zh: '周二', en: 'Tuesday' },
  { zh: '周三', en: 'Wednesday' },
  { zh: '周四', en: 'Thursday' },
  { zh: '周五', en: 'Friday' },
  { zh: '周六', en: 'Saturday' },
  { zh: '周日', en: 'Sunday' },
];

/**
 * 本地时区的 YYYY-MM-DD。
 * 不能用 toISOString()：那是 UTC，会让东八区的清晨差一天。
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** 距离本周一过了几天（周一 = 0）。 */
function daysSinceMonday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function addMonthsClamped(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const targetMonthEnd = new Date(
    date.getFullYear(),
    date.getMonth() + months + 1,
    0,
  ).getDate();
  // 1月31日加一个月没有对应日期，夹到当月最后一天。
  next.setDate(Math.min(date.getDate(), targetMonthEnd));
  next.setMonth(date.getMonth() + months);
  return next;
}

export type DateAnchor = { label: string; date: string };

/** 预先算好的相对日期锚点，供 prompt 与测试共用。 */
export function buildDateAnchors(now: Date): DateAnchor[] {
  const monday = addDays(now, -daysSinceMonday(now));
  const anchors: DateAnchor[] = [
    { label: '今天 / today', date: toLocalDateString(now) },
    { label: '明天 / tomorrow', date: toLocalDateString(addDays(now, 1)) },
    {
      label: '后天 / the day after tomorrow',
      date: toLocalDateString(addDays(now, 2)),
    },
    { label: '大后天', date: toLocalDateString(addDays(now, 3)) },
    { label: '昨天 / yesterday', date: toLocalDateString(addDays(now, -1)) },
  ];

  WEEKDAY_LABELS.forEach((weekday, index) => {
    anchors.push({
      label: `本${weekday.zh} / this ${weekday.en}`,
      date: toLocalDateString(addDays(monday, index)),
    });
  });

  WEEKDAY_LABELS.forEach((weekday, index) => {
    anchors.push({
      label: `下${weekday.zh} / next ${weekday.en}`,
      date: toLocalDateString(addDays(monday, index + 7)),
    });
  });

  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  anchors.push(
    {
      label: '本周末 / this weekend',
      date: toLocalDateString(addDays(monday, 5)),
    },
    { label: '一周后 / in a week', date: toLocalDateString(addDays(now, 7)) },
    {
      label: '两周后 / in two weeks',
      date: toLocalDateString(addDays(now, 14)),
    },
    { label: '本月底 / end of this month', date: toLocalDateString(monthEnd) },
    {
      label: '下月初 / start of next month',
      date: toLocalDateString(addDays(monthEnd, 1)),
    },
    {
      label: '一个月后 / in a month',
      date: toLocalDateString(addMonthsClamped(now, 1)),
    },
  );

  return anchors;
}

/**
 * 塞进 prompt 的日期参考块。
 *
 * 明确写出「查表，不要自己算」——本地小模型一旦开始推算星期几就会出错。
 */
export function buildDateReference(now: Date): string {
  const weekdayLabel = WEEKDAY_LABELS[daysSinceMonday(now)];
  const rows = buildDateAnchors(now)
    .map((anchor) => `  ${anchor.label} = ${anchor.date}`)
    .join('\n');

  return [
    `TODAY is ${toLocalDateString(now)}, which is a ${weekdayLabel.en} (${weekdayLabel.zh}).`,
    '',
    'Resolve every relative date by LOOKING IT UP in this table.',
    'Do NOT calculate weekdays or date arithmetic yourself.',
    rows,
    '',
    'Notes on weekday wording:',
    '  - A bare 周X / "on Friday" means THIS week only if that day is still',
    '    AHEAD of today. Today itself counts as passed, so a bare weekday naming',
    '    today means NEXT week.',
    '  - 下周X / "next Monday" always means the following week, never this week.',
    '  - "X之前 / by X / before X" still uses X itself as the dueDate.',
  ].join('\n');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 校验模型给出的日期。
 *
 * 只接受真实存在的日历日期，并把年份限制在合理区间，
 * 挡掉 `2026-13-45` 或把项目编号当日期这类幻觉。
 * 无法采信时回落到今天，与建表时 dateString 非空的约束保持一致。
 */
export function normalizeDueDate(raw: unknown, today: string): string {
  if (typeof raw !== 'string' || !ISO_DATE.test(raw.trim())) return today;

  const value = raw.trim();
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return today;
  // 借助往返比对排除 2026-02-31 这种会被 Date 静默进位的日期。
  if (toLocalDateString(parsed) !== value) return today;

  const currentYear = Number(today.slice(0, 4));
  const year = parsed.getFullYear();
  if (year < currentYear - 1 || year > currentYear + 5) return today;

  return value;
}
