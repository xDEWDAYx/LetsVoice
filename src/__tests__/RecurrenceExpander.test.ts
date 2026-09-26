import {
  expandOccurrences,
  normalizeRepeat,
} from '../main/dashboard/RecurrenceExpander';

describe('normalizeRepeat', () => {
  it('放行枚举值，大小写与空格不敏感', () => {
    expect(normalizeRepeat('daily')).toBe('daily');
    expect(normalizeRepeat(' WEEKLY ')).toBe('weekly');
  });

  it('容忍模型的自然语言写法', () => {
    expect(normalizeRepeat('every day')).toBe('daily');
    expect(normalizeRepeat('every week')).toBe('weekly');
    expect(normalizeRepeat('every two weeks')).toBe('biweekly');
    expect(normalizeRepeat('工作日')).toBe('weekdays');
  });

  it('空值与无法识别的值一律当作不重复', () => {
    expect(normalizeRepeat(null)).toBeNull();
    expect(normalizeRepeat('none')).toBeNull();
    expect(normalizeRepeat('每隔三天')).toBeNull();
    expect(normalizeRepeat(42)).toBeNull();
  });
});

describe('expandOccurrences', () => {
  it('不重复时只有一条', () => {
    expect(expandOccurrences('2026-08-31', null)).toEqual(['2026-08-31']);
  });

  it('每天：从起点开始逐日铺满', () => {
    const dates = expandOccurrences('2026-08-24', 'daily', 6);
    expect(dates).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ]);
  });

  it('每周五：每个周五都有一条，不只第一个', () => {
    const dates = expandOccurrences('2026-08-21', 'weekly', 28);
    expect(dates).toEqual([
      '2026-08-21',
      '2026-08-28',
      '2026-09-04',
      '2026-09-11',
      '2026-09-18',
    ]);
  });

  it('工作日跳过周六周日', () => {
    // 2026-08-21 是周五
    const dates = expandOccurrences('2026-08-21', 'weekdays', 4);
    expect(dates).toEqual(['2026-08-21', '2026-08-24', '2026-08-25']);
  });

  it('每两周按 14 天推进', () => {
    expect(expandOccurrences('2026-08-24', 'biweekly', 30)).toEqual([
      '2026-08-24',
      '2026-09-07',
      '2026-09-21',
    ]);
  });

  it('每月保持同一号', () => {
    expect(expandOccurrences('2026-08-15', 'monthly', 100)).toEqual([
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
    ]);
  });

  it('每月 31 号跳过没有 31 号的月份，而不是滑到下月 1 号', () => {
    const dates = expandOccurrences('2026-08-31', 'monthly', 130);
    expect(dates).toContain('2026-08-31');
    expect(dates).toContain('2026-10-31');
    expect(dates).toContain('2026-12-31');
    expect(dates).not.toContain('2026-10-01');
    expect(dates).not.toContain('2026-09-30');
  });

  it('默认展开范围有限，不会无休止铺下去', () => {
    expect(expandOccurrences('2026-08-20', 'daily').length).toBeLessThanOrEqual(
      120,
    );
    expect(expandOccurrences('2026-08-20', 'daily').length).toBeGreaterThan(30);
  });

  it('日期非法时退化为单条，不抛异常', () => {
    expect(expandOccurrences('not-a-date', 'daily')).toEqual(['not-a-date']);
  });
});
