import {
  buildDateAnchors,
  buildDateReference,
  normalizeDueDate,
  toLocalDateString,
} from '../main/dashboard/DateContext';

/** 2026-08-20 是星期四，用户报的问题就发生在这一天。 */
const THURSDAY = new Date(2026, 7, 20, 14, 30);

function anchor(now: Date, label: string): string | undefined {
  return buildDateAnchors(now).find((item) => item.label.startsWith(label))
    ?.date;
}

describe('toLocalDateString', () => {
  it('取本地日期，不受 UTC 换日影响', () => {
    // 东八区的凌晨换算成 UTC 是前一天，toISOString() 在这里会差一天。
    const earlyMorning = new Date(2026, 7, 20, 0, 30);
    expect(toLocalDateString(earlyMorning)).toBe('2026-08-20');
  });

  it('月末和年末的补零正确', () => {
    expect(toLocalDateString(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toLocalDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('相对日期锚点', () => {
  it('用户实测漏掉的三个日期都在表里', () => {
    // 「周五之前」「下周一」原本解析不出来，只能退回今天。
    expect(anchor(THURSDAY, '本周五')).toBe('2026-08-21');
    expect(anchor(THURSDAY, '下周一')).toBe('2026-08-24');
    expect(anchor(THURSDAY, '本月底')).toBe('2026-08-31');
  });

  it('今天 / 明天 / 后天', () => {
    expect(anchor(THURSDAY, '今天')).toBe('2026-08-20');
    expect(anchor(THURSDAY, '明天')).toBe('2026-08-21');
    expect(anchor(THURSDAY, '后天')).toBe('2026-08-22');
  });

  it('本周以周一为起点', () => {
    expect(anchor(THURSDAY, '本周一')).toBe('2026-08-17');
    expect(anchor(THURSDAY, '本周日')).toBe('2026-08-23');
  });

  it('下周整体后移七天', () => {
    expect(anchor(THURSDAY, '下周一')).toBe('2026-08-24');
    expect(anchor(THURSDAY, '下周日')).toBe('2026-08-30');
  });

  it('周日当天不会被算进下一周', () => {
    const sunday = new Date(2026, 7, 23);
    expect(anchor(sunday, '本周一')).toBe('2026-08-17');
    expect(anchor(sunday, '本周日')).toBe('2026-08-23');
    expect(anchor(sunday, '下周一')).toBe('2026-08-24');
  });

  it('周一当天的本周一就是自己', () => {
    const monday = new Date(2026, 7, 24);
    expect(anchor(monday, '本周一')).toBe('2026-08-24');
    expect(anchor(monday, '下周一')).toBe('2026-08-31');
  });

  it('跨月与跨年的月底 / 下月初', () => {
    expect(anchor(new Date(2026, 1, 10), '本月底')).toBe('2026-02-28');
    expect(anchor(new Date(2028, 1, 10), '本月底')).toBe('2028-02-29');
    expect(anchor(new Date(2026, 11, 15), '本月底')).toBe('2026-12-31');
    expect(anchor(new Date(2026, 11, 15), '下月初')).toBe('2027-01-01');
  });

  it('「一个月后」在月末会夹到有效日期', () => {
    expect(anchor(new Date(2026, 0, 31), '一个月后')).toBe('2026-02-28');
  });
});

describe('buildDateReference', () => {
  it('写明今天的星期，模型不必自己推算', () => {
    const reference = buildDateReference(THURSDAY);
    expect(reference).toContain('TODAY is 2026-08-20');
    expect(reference).toContain('Thursday');
    expect(reference).toContain('周四');
  });

  it('明确要求查表而不是自己算', () => {
    expect(buildDateReference(THURSDAY)).toContain('Do NOT calculate');
  });

  it('把失败案例里的对照行整行列出来', () => {
    const reference = buildDateReference(THURSDAY);
    expect(reference).toContain('下周一 / next Monday = 2026-08-24');
    expect(reference).toContain('本周五 / this Friday = 2026-08-21');
  });
});

describe('normalizeDueDate', () => {
  const today = '2026-08-20';

  it('放行合法日期', () => {
    expect(normalizeDueDate('2026-09-04', today)).toBe('2026-09-04');
  });

  it('null / 空值回落到今天', () => {
    expect(normalizeDueDate(null, today)).toBe(today);
    expect(normalizeDueDate(undefined, today)).toBe(today);
    expect(normalizeDueDate('', today)).toBe(today);
  });

  it('挡掉不存在的日历日期', () => {
    expect(normalizeDueDate('2026-02-31', today)).toBe(today);
    expect(normalizeDueDate('2026-13-45', today)).toBe(today);
  });

  it('挡掉格式不对的输出', () => {
    expect(normalizeDueDate('下周一', today)).toBe(today);
    expect(normalizeDueDate('2026/09/04', today)).toBe(today);
    expect(normalizeDueDate('九月四号', today)).toBe(today);
    expect(normalizeDueDate(20260904, today)).toBe(today);
  });

  it('挡掉年份离谱的幻觉', () => {
    expect(normalizeDueDate('0202-08-17', today)).toBe(today);
    expect(normalizeDueDate('2099-01-01', today)).toBe(today);
  });

  it('允许近期的过去日期（补录已逾期事项）', () => {
    expect(normalizeDueDate('2026-08-01', today)).toBe('2026-08-01');
  });
});
