/**
 * 把转写文本里的相对日期说法就地标注成具体日期。
 *
 * 光在 prompt 里给对照表还不够：本地小模型在长文本里往往懒得回查，
 * 「周五之前」照样解析不出来。与其指望模型去查表，不如在文本送进模型
 * 之前就把答案写在词的旁边 —— 这一步是纯规则的，不依赖任何模型。
 *
 * 采用「保留原词 + 补注日期」而不是直接替换：
 *   「周五之前交」→「周五(2026-08-21)之前交」
 * 这样即便规则判断错了，原始说法仍在，模型还有纠正的余地；
 * 摘要和待办标题读起来也不会丢失原本的语气。
 *
 * 只作用于送给模型的副本，落库的转写原文保持不变。
 */

import { toLocalDateString } from './DateContext';

/** 周一 = 0。中文里「周日 / 周天 / 周7」都指一周的最后一天。 */
const WEEKDAY_INDEX: Record<string, number> = {
  一: 0,
  二: 1,
  三: 2,
  四: 3,
  五: 4,
  六: 5,
  日: 6,
  天: 6,
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
};

const EN_WEEKDAY_INDEX: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const CN_NUMERALS: Record<string, number> = {
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function daysSinceMonday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function mondayOf(date: Date): Date {
  return addDays(date, -daysSinceMonday(date));
}

function parseCount(raw: string): number {
  const digits = Number(raw);
  if (Number.isFinite(digits)) return digits;
  // 「十五天后」这类：十 + 五
  if (raw.length === 2 && raw[0] === '十')
    return 10 + (CN_NUMERALS[raw[1]] ?? 0);
  if (raw.length === 2 && raw[1] === '十')
    return (CN_NUMERALS[raw[0]] ?? 0) * 10;
  return CN_NUMERALS[raw] ?? Number.NaN;
}

/** 逐位读的数字，用于「二零二六年」这种年份写法。 */
const CN_DIGITS: Record<string, number> = {
  〇: 0,
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 「三十一」「二十」「十二」「八」→ 31 / 20 / 12 / 8。 */
function parseChineseInteger(raw: string): number {
  if (/^[0-9]+$/.test(raw)) return Number(raw);

  const tenAt = raw.indexOf('十');
  if (tenAt === -1) {
    // 无「十」时按单字读，多字则视为逐位（罕见）
    if (raw.length === 1) return CN_NUMERALS[raw] ?? Number.NaN;
    return Number.NaN;
  }
  const high =
    tenAt === 0 ? 1 : (CN_NUMERALS[raw.slice(0, tenAt)] ?? Number.NaN);
  const lowRaw = raw.slice(tenAt + 1);
  const low = lowRaw === '' ? 0 : (CN_NUMERALS[lowRaw] ?? Number.NaN);
  if (Number.isNaN(high) || Number.isNaN(low)) return Number.NaN;
  return high * 10 + low;
}

/** 「二零二六」→ 2026；「2026」→ 2026。 */
function parseChineseYear(raw: string): number {
  if (/^[0-9]{4}$/.test(raw)) return Number(raw);
  const digits = [...raw].map((char) => CN_DIGITS[char]);
  if (digits.length !== 4 || digits.some((d) => d === undefined)) {
    return Number.NaN;
  }
  return digits.reduce((acc, d) => acc * 10 + d, 0);
}

/** 语气词 / 量词的可选前缀，统一在一处维护。 */
const WEEK_WORD = '(?:周|週|星期|禮拜|礼拜)';
const WEEKDAY_CHAR = '[一二三四五六日天1-7]';
const COUNT = '(?:[0-9]+|[一两二三四五六七八九十]{1,2})';

/**
 * 绝对日期：「八月三十一号」「2026年8月31日」「九月四号」。
 *
 * 必须带「月」和「号/日」才算数。只写「三号」不匹配 ——
 * 「三号楼会议室」「三号线」这类会被误标，代价远大于收益。
 */
const CN_MONTH_DAY =
  '(?:(?:[0-9]{4}|[〇零一二三四五六七八九]{4})年)?' +
  '(?:[0-9]{1,2}|[一二三四五六七八九十]{1,3})月' +
  '(?:[0-9]{1,2}|[一二三四五六七八九十]{1,3})[号號日]';

/**
 * 规则按「越具体越靠前」排列。
 *
 * 必须合并成一条大正则做单次扫描：如果逐条 replace，
 * 先处理过的「下周五」会被后面的裸「周五」规则再匹配一次。
 */
/**
 * 周期性说法。必须排在裸「周X」之前：
 * 「每周五」要整体吃掉，否则会被切成「每」+「周五」，重复语义就丢了。
 */
const RECURRENCE = [
  `每${WEEK_WORD}${WEEKDAY_CHAR}`,
  `每(?:个|個)${WEEK_WORD}${WEEKDAY_CHAR}`,
  `每(?:隔)?(?:两|兩|2)${WEEK_WORD}`,
  '隔周|隔週',
  `每(?:个|個)?${WEEK_WORD}`,
  '每(?:个|個)?月(?:[0-9]{1,2}|[一二三四五六七八九十]{1,3})[号號日]',
  '每(?:个|個)?月|每月',
  '每(?:个|個)工作日|每工作日',
  '每天|每日|天天|逐日',
];

/** 旬：上旬 1–10 号、中旬 11–20 号、下旬 21 号至月末。 */
const XUN =
  '(?:(?:[0-9]{1,2}|[一二三四五六七八九十]{1,3})月|下(?:个|個)?月|这(?:个|個)?月|這(?:個)?月|本月|上(?:个|個)?月)?' +
  '(?:上旬|中旬|下旬)';

const MASTER = new RegExp(
  [
    // 周期性排最前：它要整体吃掉「每周五」这类组合
    ...RECURRENCE,
    // 绝对日期次之：它最具体，且不该被其它规则切碎
    CN_MONTH_DAY,
    XUN,
    '(?:今年|明年|去年)?(?:年底|年末|年终|年終)',
    '(?:今年|明年)?年初',
    '大前天|前天|大后天|後天|后天|明天|明日|今天|今日|昨天|昨日',
    `下下${WEEK_WORD}${WEEKDAY_CHAR}`,
    `(?:下个|下個|下)${WEEK_WORD}${WEEKDAY_CHAR}`,
    `(?:上个|上個|上)${WEEK_WORD}${WEEKDAY_CHAR}`,
    `(?:这个|這個|本|这|這)${WEEK_WORD}${WEEKDAY_CHAR}`,
    `${WEEK_WORD}${WEEKDAY_CHAR}`,
    '(?:这个|這個|本|下个|下個|下)?(?:月底|月末)',
    '(?:下个|下個|下)月初',
    '(?:这个|這個|本)?(?:周末|週末)',
    `${COUNT}(?:天|日)(?:之)?[后後]`,
    `${COUNT}(?:个|個)?${WEEK_WORD}(?:之)?[后後]`,
    '(?:下个|下個|下)月',
    // 裸「下周 / 这周」放在「下周X」之后，避免把「下周五」截断
    `(?:下个|下個|下)${WEEK_WORD}`,
    // 英文：next/this + 星期几，以及裸星期几
    '(?:next|this)\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)',
    '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)',
    'the\\s+day\\s+after\\s+tomorrow|tomorrow|today|yesterday',
    'end\\s+of\\s+(?:the\\s+|this\\s+)?month',
    `in\\s+${COUNT}\\s+days?`,
    `in\\s+${COUNT}\\s+weeks?`,
  ].join('|'),
  'gi',
);

/**
 * 裸「周五」：本周还没到就指本周，已经到了或过了就指下周。
 *
 * 「当天」算已经过了 —— 周四说「周四之前」，指的是下周四，不是今天。
 * 今天已经过了大半，把它当成截止日没有意义；口语里
 * 「周四见」在周四当天说，通常也是指下一个周四。
 */
function resolveBareWeekday(now: Date, target: number): Date {
  const monday = mondayOf(now);
  const thisWeek = addDays(monday, target);
  return target > daysSinceMonday(now) ? thisWeek : addDays(thisWeek, 7);
}

/**
 * 「八月三十一号」这类绝对日期。
 *
 * 没写年份时按就近推断：算出来的日期若已过去一个多月，
 * 通常说的是明年（八月说「一月五号」多半指明年一月）。
 */
function resolveAbsoluteDate(phrase: string, now: Date): Date | null {
  const match = phrase.match(
    /^(?:([0-9]{4}|[〇零一二三四五六七八九]{4})年)?([0-9]{1,2}|[一二三四五六七八九十]{1,3})月([0-9]{1,2}|[一二三四五六七八九十]{1,3})[号號日]$/,
  );
  if (!match) return null;

  const month = parseChineseInteger(match[2]);
  const day = parseChineseInteger(match[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let year = match[1] ? parseChineseYear(match[1]) : now.getFullYear();
  if (!Number.isFinite(year)) return null;

  const build = (y: number) => new Date(y, month - 1, day);
  let candidate = build(year);
  // 2月30号这类不存在的日期会被 Date 静默进位，直接放弃标注。
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return null;
  }

  if (!match[1]) {
    const gracePastMs = 45 * 24 * 60 * 60 * 1000;
    if (now.getTime() - candidate.getTime() > gracePastMs) {
      year += 1;
      candidate = build(year);
      if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
        return null;
      }
    }
  }

  return candidate;
}

/**
 * 旬。作为截止日用，统一取该区间的最后一天：
 * 上旬 → 10 号，中旬 → 20 号，下旬 → 当月最后一天。
 * 和「月底」当作 deadline 的处理方式保持一致。
 */
function resolveXun(phrase: string, now: Date): Date | null {
  const match = phrase.match(
    /^((?:[0-9]{1,2}|[一二三四五六七八九十]{1,3})月|下(?:个|個)?月|这(?:个|個)?月|這(?:個)?月|本月|上(?:个|個)?月)?(上旬|中旬|下旬)$/,
  );
  if (!match) return null;

  const scope = match[1] ?? '';
  let year = now.getFullYear();
  let month = now.getMonth();

  if (/^下/.test(scope)) month += 1;
  else if (/^上/.test(scope)) month -= 1;
  else if (/月$/.test(scope) && !/^(这|這|本)/.test(scope)) {
    const explicit = parseChineseInteger(scope.replace(/月$/, ''));
    if (!Number.isFinite(explicit) || explicit < 1 || explicit > 12)
      return null;
    month = explicit - 1;
    // 只写月份时沿用绝对日期那套就近推断
    if (new Date(year, month + 1, 0).getTime() < now.getTime() - 45 * 864e5) {
      year += 1;
    }
  }

  if (match[2] === '上旬') return new Date(year, month, 10);
  if (match[2] === '中旬') return new Date(year, month, 20);
  return new Date(year, month + 1, 0);
}

function resolvePhrase(phrase: string, now: Date): Date | null {
  const text = phrase.toLowerCase();
  const monday = mondayOf(now);

  const absolute = resolveAbsoluteDate(phrase, now);
  if (absolute) return absolute;

  const xun = resolveXun(phrase, now);
  if (xun) return xun;

  // ---- 年底 / 年初 ----
  if (/(年底|年末|年终|年終)$/.test(text)) {
    let offset = 0;
    if (/^明年/.test(text)) offset = 1;
    else if (/^去年/.test(text)) offset = -1;
    return new Date(now.getFullYear() + offset, 11, 31);
  }
  if (/年初$/.test(text)) {
    const offset = /^明年/.test(text) ? 1 : 0;
    return new Date(now.getFullYear() + offset, 0, 1);
  }

  // 裸「下周 / 下个星期」按下周一算起
  if (new RegExp(`^(?:下个|下個|下)${WEEK_WORD}$`).test(phrase)) {
    return addDays(monday, 7);
  }

  // ---- 固定偏移 ----
  if (/^(今天|今日|today)$/.test(text)) return now;
  if (/^(明天|明日|tomorrow)$/.test(text)) return addDays(now, 1);
  if (/^(后天|後天)$/.test(text) || /day\s+after\s+tomorrow/.test(text)) {
    return addDays(now, 2);
  }
  if (text === '大后天' || text === '大後天') return addDays(now, 3);
  if (/^(昨天|昨日|yesterday)$/.test(text)) return addDays(now, -1);
  if (text === '前天') return addDays(now, -2);
  if (text === '大前天') return addDays(now, -3);

  // ---- 月份相关 ----
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (/月初$/.test(text)) return addDays(monthEnd, 1);
  if (/(月底|月末)$/.test(text) || /end\s+of/.test(text)) {
    // 「下月底」指下个月的最后一天
    if (/^(下个|下個|下)/.test(text)) {
      return new Date(now.getFullYear(), now.getMonth() + 2, 0);
    }
    return monthEnd;
  }
  if (/^(下个|下個|下)月$/.test(text)) return addDays(monthEnd, 1);

  // ---- 周末 ----
  if (/(周末|週末)$/.test(text)) return addDays(monday, 5);

  // ---- N 天 / N 周之后 ----
  const daysLater = text.match(
    new RegExp(`^(${COUNT})(?:天|日)(?:之)?[后後]$`),
  );
  if (daysLater) {
    const count = parseCount(daysLater[1]);
    return Number.isNaN(count) ? null : addDays(now, count);
  }
  const inDays = text.match(new RegExp(`^in\\s+(${COUNT})\\s+days?$`));
  if (inDays) {
    const count = parseCount(inDays[1]);
    return Number.isNaN(count) ? null : addDays(now, count);
  }
  const weeksLater = text.match(
    new RegExp(`^(${COUNT})(?:个|個)?${WEEK_WORD}(?:之)?[后後]$`),
  );
  if (weeksLater) {
    const count = parseCount(weeksLater[1]);
    return Number.isNaN(count) ? null : addDays(now, count * 7);
  }
  const inWeeks = text.match(new RegExp(`^in\\s+(${COUNT})\\s+weeks?$`));
  if (inWeeks) {
    const count = parseCount(inWeeks[1]);
    return Number.isNaN(count) ? null : addDays(now, count * 7);
  }

  // ---- 星期几 ----
  const enWeekday = text.match(
    /^(?:(next|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
  );
  if (enWeekday) {
    const target = EN_WEEKDAY_INDEX[enWeekday[2]];
    if (enWeekday[1] === 'next') return addDays(monday, target + 7);
    if (enWeekday[1] === 'this') return addDays(monday, target);
    return resolveBareWeekday(now, target);
  }

  const cnWeekday = phrase.match(
    new RegExp(
      `^(下下|下个|下個|下|上个|上個|上|这个|這個|本|这|這)?${WEEK_WORD}(${WEEKDAY_CHAR})$`,
    ),
  );
  if (cnWeekday) {
    const target = WEEKDAY_INDEX[cnWeekday[2]];
    if (target === undefined) return null;
    const prefix = cnWeekday[1];
    if (prefix === '下下') return addDays(monday, target + 14);
    if (prefix && /^(下个|下個|下)$/.test(prefix)) {
      return addDays(monday, target + 7);
    }
    if (prefix && /^(上个|上個|上)$/.test(prefix)) {
      return addDays(monday, target - 7);
    }
    if (prefix) return addDays(monday, target);
    return resolveBareWeekday(now, target);
  }

  return null;
}

/** 取出文本里所有标注过的日期，按出现顺序去重。 */
export function extractAnnotatedDates(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/\((\d{4}-\d{2}-\d{2})(?:,[^)]*)?\)/g)].map(
        (entry) => entry[1],
      ),
    ),
  ];
}

/**
 * 全文唯一的那个标注日期；有多个或一个都没有时返回 null。
 *
 * 模型偶尔会漏抄标注、把 dueDate 留成 null。若整段话只指向一个日期，
 * 那它就是唯一合理的归属；一律记成「今天」会在日历上凭空多一个点。
 * 有多个日期时无从判断，交给调用方回落。
 */
export function soleAnnotatedDate(text: string): string | null {
  const dates = extractAnnotatedDates(text);
  return dates.length === 1 ? dates[0] : null;
}

/** 周期类型，与 RecurrenceExpander 的取值保持一致。 */
export type RepeatKind =
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly';

/**
 * 周期性说法 → 重复类型 + 首次发生日期。
 *
 * 返回首次日期是关键：模型只要照抄这个起点和重复类型，
 * 后面每一次发生由代码展开，不需要模型逐条列出来。
 */
function resolveRecurrence(
  phrase: string,
  now: Date,
): { kind: RepeatKind; first: Date } | null {
  const monday = mondayOf(now);

  // 每周X / 每个星期X：首次落在最近一个还没过的那天
  const weekly = phrase.match(
    new RegExp(`^每(?:个|個)?${WEEK_WORD}(${WEEKDAY_CHAR})$`),
  );
  if (weekly) {
    const target = WEEKDAY_INDEX[weekly[1]];
    if (target === undefined) return null;
    return { kind: 'weekly', first: resolveBareWeekday(now, target) };
  }

  if (new RegExp(`^每(?:隔)?(?:两|兩|2)${WEEK_WORD}$`).test(phrase)) {
    return { kind: 'biweekly', first: addDays(monday, 7) };
  }
  if (/^(隔周|隔週)$/.test(phrase)) {
    return { kind: 'biweekly', first: addDays(monday, 7) };
  }
  if (new RegExp(`^每(?:个|個)?${WEEK_WORD}$`).test(phrase)) {
    return { kind: 'weekly', first: addDays(monday, 7) };
  }

  // 每月X号：首次落在最近一个还没过的那个 X 号
  const monthlyDay = phrase.match(
    /^每(?:个|個)?月([0-9]{1,2}|[一二三四五六七八九十]{1,3})[号號日]$/,
  );
  if (monthlyDay) {
    const day = parseChineseInteger(monthlyDay[1]);
    if (!Number.isFinite(day) || day < 1 || day > 31) return null;
    let candidate = new Date(now.getFullYear(), now.getMonth(), day);
    if (candidate.getDate() !== day) return null;
    if (candidate.getTime() < now.getTime() - 864e5) {
      candidate = new Date(now.getFullYear(), now.getMonth() + 1, day);
      if (candidate.getDate() !== day) return null;
    }
    return { kind: 'monthly', first: candidate };
  }
  if (/^每(?:个|個)?月$/.test(phrase)) {
    return { kind: 'monthly', first: now };
  }

  if (/^每(?:个|個)?工作日$/.test(phrase)) {
    return { kind: 'weekdays', first: now };
  }
  if (/^(每天|每日|天天|逐日)$/.test(phrase)) {
    return { kind: 'daily', first: now };
  }

  return null;
}

/** 「提前三天」「提前一周」——相对于同句中前一个日期，而不是相对今天。 */
const LEAD_TIME = new RegExp(
  `提前(${COUNT})(?:个|個)?(天|日|${WEEK_WORD})`,
  'g',
);

/**
 * 第二遍扫描：把「提前 N 天」换算成具体日期。
 *
 * 它的基准是同一句里**前面刚提到的那个日期**，所以必须等第一遍
 * 把绝对/相对日期都标注完之后再跑。
 *   「九月十号(2026-09-10)要汇报，提前三天提醒我」
 *     → 「…提前三天(2026-09-07)提醒我」
 *
 * 找不到基准日期就原样留着，交给模型判断，不瞎猜。
 */
function annotateLeadTimes(text: string): string {
  return text.replace(LEAD_TIME, (match, countRaw, unit, offset: number) => {
    const source = text;
    if (/^\(\d{4}-\d{2}-\d{2}\)/.test(source.slice(offset + match.length))) {
      return match;
    }

    const count = parseCount(String(countRaw));
    if (Number.isNaN(count)) return match;
    const days = /天|日/.test(String(unit)) ? count : count * 7;

    // 只在同一句里回看，避免跨句借用不相干的日期。
    const sentenceStart = Math.max(
      ...['。', '！', '？', '\n', '；'].map((mark) =>
        source.lastIndexOf(mark, offset),
      ),
    );
    const before = source.slice(sentenceStart + 1, offset);
    const anchors = [...before.matchAll(/\((\d{4}-\d{2}-\d{2})(?:,[^)]*)?\)/g)];
    if (anchors.length === 0) return match;

    const anchor = new Date(`${anchors[anchors.length - 1][1]}T00:00:00`);
    if (Number.isNaN(anchor.getTime())) return match;

    return `${match}(${toLocalDateString(addDays(anchor, -days))})`;
  });
}

/**
 * 就地补注日期与重复信息。已经带标注的片段不会被重复处理。
 *
 * 两种标注：
 *   一次性  「周五(2026-08-21)」
 *   周期性  「每周五(2026-08-21, REPEAT=weekly)」
 */
export function rewriteRelativeDates(text: string, now: Date): string {
  if (!text) return text;

  const annotated = text.replace(MASTER, (match, ...rest) => {
    const offset = rest[rest.length - 2] as number;
    const source = rest[rest.length - 1] as string;

    // 紧跟着已有标注说明这段处理过了，别叠加。
    if (
      /^\((?:\d{4}-\d{2}-\d{2}|REPEAT=)/.test(
        source.slice(offset + match.length),
      )
    ) {
      return match;
    }

    const recurring = resolveRecurrence(match, now);
    if (recurring) {
      const first = toLocalDateString(recurring.first);
      return `${match}(${first}, REPEAT=${recurring.kind})`;
    }

    const resolved = resolvePhrase(match, now);
    if (!resolved) return match;
    return `${match}(${toLocalDateString(resolved)})`;
  });

  // 「提前N天」要等上面标完才有基准可回看。
  return annotateLeadTimes(annotated);
}
