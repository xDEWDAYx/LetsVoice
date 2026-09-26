import {
  extractAnnotatedDates,
  rewriteRelativeDates,
  soleAnnotatedDate,
} from '../main/dashboard/RelativeDateRewriter';

/** 2026-08-20 是星期四，用户报的问题就发生在这一天。 */
const THURSDAY = new Date(2026, 7, 20, 14, 30);

function rewrite(text: string, now: Date = THURSDAY): string {
  return rewriteRelativeDates(text, now);
}

describe('用户实测失败的那句话', () => {
  it('三个日期全部就地标注出来', () => {
    const source =
      '周五之前把季度报表发给财务那边，下周一要交差旅报销的单子，' +
      '然后八月三十一号之前必须把服务器的续费办完。';

    const result = rewrite(source);

    expect(result).toContain('周五(2026-08-21)之前');
    expect(result).toContain('下周一(2026-08-24)要交');
    // 绝对日期原本交给模型自己换算，结果换不出来就回落到今天，
    // 所以现在同样在这里标注好。
    expect(result).toContain('八月三十一号(2026-08-31)之前');
  });

  it('不动原句其余部分', () => {
    expect(rewrite('周五之前交')).toBe('周五(2026-08-21)之前交');
  });
});

describe('星期几', () => {
  it('裸周X：本周还没到就算本周', () => {
    // 周四说「周五」指明天
    expect(rewrite('周五')).toBe('周五(2026-08-21)');
  });

  it('裸周X：本周已经过了就顺延到下周', () => {
    // 周四说「周二」，本周二已过，指下周二
    expect(rewrite('周二')).toBe('周二(2026-08-25)');
  });

  it('裸周X：当天算已过，顺延到下周', () => {
    // 周四说「周四」指的是下一个周四，今天已经过了大半，当截止日没意义
    expect(rewrite('周四')).toBe('周四(2026-08-27)');
  });

  it('用户实测：周四当天说「周四之前」应落在下周四', () => {
    const spoken =
      '如果方便的话 麻烦 周四之前帮我看一眼那份合同 不着急 但最好别拖到 下周.';
    expect(rewrite(spoken)).toContain('周四(2026-08-27)之前');
  });

  it('本周还没到的那天仍然算本周', () => {
    // 周四说「周五」＝明天，不该跳到下周五
    expect(rewrite('周五')).toBe('周五(2026-08-21)');
    expect(rewrite('周六')).toBe('周六(2026-08-22)');
  });

  it('「本周四」显式写本周时仍是今天', () => {
    // 加了「本」就是明确指本周，不适用顺延规则
    expect(rewrite('本周四')).toBe('本周四(2026-08-20)');
  });

  it('下周X 一律指下一周', () => {
    expect(rewrite('下周一')).toBe('下周一(2026-08-24)');
    expect(rewrite('下周五')).toBe('下周五(2026-08-28)');
    expect(rewrite('下个星期三')).toBe('下个星期三(2026-08-26)');
  });

  it('本周X 指当前这一周', () => {
    expect(rewrite('本周一')).toBe('本周一(2026-08-17)');
    expect(rewrite('这周五')).toBe('这周五(2026-08-21)');
  });

  it('上周X 指上一周', () => {
    expect(rewrite('上周五')).toBe('上周五(2026-08-14)');
  });

  it('下下周X 再往后推一周', () => {
    expect(rewrite('下下周一')).toBe('下下周一(2026-08-31)');
  });

  it('下周X 不会被裸周X规则二次匹配', () => {
    // 单次扫描保证「下周五」整体消费，内部的「周五」不再单独标注
    expect(rewrite('下周五')).toBe('下周五(2026-08-28)');
    expect(rewrite('下周五')).not.toContain('周五(2026-08-21)');
  });

  it('星期 / 礼拜 / 周7 等写法都认', () => {
    expect(rewrite('星期一')).toBe('星期一(2026-08-24)');
    expect(rewrite('礼拜三')).toBe('礼拜三(2026-08-26)');
    expect(rewrite('周日')).toBe('周日(2026-08-23)');
    expect(rewrite('周天')).toBe('周天(2026-08-23)');
    // 语音转写偶尔会输出数字
    expect(rewrite('周5')).toBe('周5(2026-08-21)');
  });
});

describe('日 / 月 / 周期', () => {
  it('今明后昨前天', () => {
    expect(rewrite('今天')).toBe('今天(2026-08-20)');
    expect(rewrite('明天')).toBe('明天(2026-08-21)');
    expect(rewrite('后天')).toBe('后天(2026-08-22)');
    expect(rewrite('大后天')).toBe('大后天(2026-08-23)');
    expect(rewrite('昨天')).toBe('昨天(2026-08-19)');
    expect(rewrite('前天')).toBe('前天(2026-08-18)');
  });

  it('大后天优先于后天匹配', () => {
    expect(rewrite('大后天')).not.toContain('大后天(2026-08-22)');
  });

  it('月底 / 下月初 / 下个月', () => {
    expect(rewrite('月底')).toBe('月底(2026-08-31)');
    expect(rewrite('这个月底')).toBe('这个月底(2026-08-31)');
    expect(rewrite('下月初')).toBe('下月初(2026-09-01)');
    expect(rewrite('下个月')).toBe('下个月(2026-09-01)');
  });

  it('N 天后 / N 周后，中文数字和阿拉伯数字都认', () => {
    expect(rewrite('三天后')).toBe('三天后(2026-08-23)');
    expect(rewrite('3天后')).toBe('3天后(2026-08-23)');
    expect(rewrite('两周后')).toBe('两周后(2026-09-03)');
    expect(rewrite('十天之后')).toBe('十天之后(2026-08-30)');
  });

  it('本周末指周六', () => {
    expect(rewrite('周末')).toBe('周末(2026-08-22)');
  });
});

describe('英文', () => {
  it('today / tomorrow / yesterday', () => {
    expect(rewrite('tomorrow')).toBe('tomorrow(2026-08-21)');
    expect(rewrite('Today')).toBe('Today(2026-08-20)');
  });

  it('next / this + 星期几', () => {
    expect(rewrite('next Monday')).toBe('next Monday(2026-08-24)');
    expect(rewrite('this Friday')).toBe('this Friday(2026-08-21)');
  });

  it('裸星期几沿用中文那套就近规则', () => {
    expect(rewrite('Friday')).toBe('Friday(2026-08-21)');
  });

  it('中英混杂', () => {
    const result = rewrite(
      '这个 sprint 的 retro 排在 next Tuesday，明天先同步一下',
    );
    expect(result).toContain('next Tuesday(2026-08-25)');
    expect(result).toContain('明天(2026-08-21)');
  });
});

describe('边界与幂等', () => {
  it('空输入原样返回', () => {
    expect(rewrite('')).toBe('');
  });

  it('没有相对日期时一个字都不改', () => {
    const source = '营收比去年同期涨了百分之十二，华东区表现最好。';
    expect(rewrite(source)).toBe(source);
  });

  it('重复执行不会叠加标注', () => {
    const once = rewrite('周五之前交');
    expect(rewrite(once)).toBe(once);
  });

  it('一句话里多个相对日期各自标注', () => {
    const result = rewrite('明天给张经理回电话，后天下午培训，下周三过合同。');
    expect(result).toContain('明天(2026-08-21)');
    expect(result).toContain('后天(2026-08-22)');
    expect(result).toContain('下周三(2026-08-26)');
  });

  it('跨月跨年时正确进位', () => {
    // 2026-12-31 是星期四
    const yearEnd = new Date(2026, 11, 31);
    expect(rewriteRelativeDates('明天', yearEnd)).toBe('明天(2027-01-01)');
    expect(rewriteRelativeDates('下周一', yearEnd)).toBe('下周一(2027-01-04)');
  });

  it('数字串不会被当成日期', () => {
    const source = '项目编号是二零二六零八一七，联系电话尾号三三七八。';
    expect(rewrite(source)).toBe(source);
  });
});

describe('绝对日期（用户实测里 8/31 没生效的那条）', () => {
  it('八月三十一号 —— 中文数字月日', () => {
    expect(rewrite('八月三十一号之前必须把服务器的续费办完')).toBe(
      '八月三十一号(2026-08-31)之前必须把服务器的续费办完',
    );
  });

  it('整句三个日期现在全部标注', () => {
    const source =
      '周五之前把季度报表发给财务那边，下周一要交差旅报销的单子，' +
      '然后八月三十一号之前必须把服务器的续费办完。';
    const result = rewrite(source);
    expect(result).toContain('周五(2026-08-21)');
    expect(result).toContain('下周一(2026-08-24)');
    expect(result).toContain('八月三十一号(2026-08-31)');
  });

  it('阿拉伯数字与中英混写', () => {
    expect(rewrite('8月31号')).toBe('8月31号(2026-08-31)');
    expect(rewrite('9月4日')).toBe('9月4日(2026-09-04)');
    expect(rewrite('九月四号')).toBe('九月四号(2026-09-04)');
    expect(rewrite('十二月二十五号')).toBe('十二月二十五号(2026-12-25)');
  });

  it('带年份时以年份为准', () => {
    expect(rewrite('2027年3月14日')).toBe('2027年3月14日(2027-03-14)');
    expect(rewrite('二零二六年八月三十一号')).toBe(
      '二零二六年八月三十一号(2026-08-31)',
    );
  });

  it('没写年份且日期已过很久时顺延到明年', () => {
    // 8月20日说「一月五号」，通常指明年
    expect(rewrite('一月五号')).toBe('一月五号(2027-01-05)');
  });

  it('刚过去不久的日期仍算今年', () => {
    expect(rewrite('八月十号')).toBe('八月十号(2026-08-10)');
  });

  it('不存在的日期不做标注', () => {
    expect(rewrite('二月三十号')).toBe('二月三十号');
    expect(rewrite('13月1号')).toBe('13月1号');
  });

  it('「三号楼」这类不是日期，绝不能被标注', () => {
    const source = '地点在三号楼会议室，走三号线过去。';
    expect(rewrite(source)).toBe(source);
  });

  it('绝对日期不会被裸周X等规则切碎', () => {
    expect(rewrite('八月三十一号')).not.toContain('(2026-08-2');
  });
});

describe('模糊时间范围（测试 #4）', () => {
  it('旬：上旬 / 中旬 / 下旬 取该区间最后一天', () => {
    expect(rewrite('下个月上旬')).toBe('下个月上旬(2026-09-10)');
    expect(rewrite('下月中旬')).toBe('下月中旬(2026-09-20)');
    expect(rewrite('本月下旬')).toBe('本月下旬(2026-08-31)');
    expect(rewrite('九月上旬')).toBe('九月上旬(2026-09-10)');
  });

  it('年底 / 年初', () => {
    expect(rewrite('年底')).toBe('年底(2026-12-31)');
    expect(rewrite('今年年底')).toBe('今年年底(2026-12-31)');
    expect(rewrite('明年年初')).toBe('明年年初(2027-01-01)');
  });

  it('测试 #4 整句：三个时间点全部标注', () => {
    const result = rewrite(
      '这个月底前要把新人的入职材料整理好，下个月上旬安排一次团队复盘，' +
        '年底之前争取把这套流程文档补全。',
    );
    expect(result).toContain('这个月底(2026-08-31)');
    expect(result).toContain('下个月上旬(2026-09-10)');
    expect(result).toContain('年底(2026-12-31)');
  });
});

describe('周期性事项（测试 #5）', () => {
  it('每天标成 daily，并给出首次日期', () => {
    expect(rewrite('每天')).toBe('每天(2026-08-20, REPEAT=daily)');
  });

  it('每周五标成 weekly，首次落在最近的周五', () => {
    expect(rewrite('每周五')).toBe('每周五(2026-08-21, REPEAT=weekly)');
  });

  it('每周X 不会被裸周X规则切碎', () => {
    expect(rewrite('每周五')).not.toContain('每周五(2026-08-21)之');
    expect(rewrite('每星期一')).toBe('每星期一(2026-08-24, REPEAT=weekly)');
  });

  it('每月X号 / 每两周 / 每个工作日', () => {
    expect(rewrite('每月15号')).toBe('每月15号(2026-09-15, REPEAT=monthly)');
    expect(rewrite('每两周')).toBe('每两周(2026-08-24, REPEAT=biweekly)');
    expect(rewrite('每个工作日')).toBe(
      '每个工作日(2026-08-20, REPEAT=weekdays)',
    );
  });

  it('测试 #5 整句：两个周期任务各自标注，下周也解析出来', () => {
    const result = rewrite(
      '从下周开始我每天早上九点半都要过一遍值班群的消息，每周五下班前发一次周报。',
    );
    expect(result).toContain('下周(2026-08-24)');
    expect(result).toContain('每天(2026-08-20, REPEAT=daily)');
    expect(result).toContain('每周五(2026-08-21, REPEAT=weekly)');
  });

  it('重复执行不会叠加重复标注', () => {
    const once = rewrite('每周五发周报');
    expect(rewrite(once)).toBe(once);
  });
});

describe('提前 N 天（相对另一个日期，测试 #6 / #7）', () => {
  it('以同句里前一个日期为基准往回推', () => {
    expect(
      rewrite('我九月十号要去客户现场做汇报，麻烦提前三天提醒我准备材料。'),
    ).toContain('提前三天(2026-09-07)');
  });

  it('提前一周按 7 天算', () => {
    expect(rewrite('截止时间是九月十五号，我打算提前一周就开始弄。')).toContain(
      '提前一周(2026-09-08)',
    );
  });

  it('同句里有多个日期时取最近的那个作基准', () => {
    const result = rewrite('八月十号开会，九月十号汇报，提前两天准备。');
    expect(result).toContain('提前两天(2026-09-08)');
  });

  it('句子里没有基准日期就不标注，不拿今天硬凑', () => {
    expect(rewrite('记得提前三天准备材料。')).toBe('记得提前三天准备材料。');
  });

  it('跨句不借用上一句的日期', () => {
    const result = rewrite('九月十号汇报。提前三天准备材料。');
    expect(result).toContain('九月十号(2026-09-10)');
    expect(result).not.toContain('提前三天(');
  });

  it('重复执行不会叠加', () => {
    const once = rewrite('九月十号汇报，提前三天提醒我。');
    expect(rewrite(once)).toBe(once);
  });
});

describe('标注日期的兜底（模型漏抄 dueDate 时）', () => {
  it('全文只有一个标注日期时能取出来', () => {
    const annotated = rewrite(
      '小刘说他明天去对接物流，老王负责周五的客户接待，这两块我就不管了。',
    );
    // 周四说「明天」和「周五」都指 8/21，全文其实只有一个日期
    expect(extractAnnotatedDates(annotated)).toEqual(['2026-08-21']);
    expect(soleAnnotatedDate(annotated)).toBe('2026-08-21');
  });

  it('有多个不同日期时不猜，返回 null', () => {
    const annotated = rewrite('明天给张经理回电话，下周三跟法务过合同。');
    expect(extractAnnotatedDates(annotated)).toEqual([
      '2026-08-21',
      '2026-08-26',
    ]);
    expect(soleAnnotatedDate(annotated)).toBeNull();
  });

  it('一个日期都没标注时返回 null', () => {
    expect(soleAnnotatedDate(rewrite('记得把打印机的墨盒换了。'))).toBeNull();
  });

  it('重复标注也算同一个日期', () => {
    const annotated = rewrite('每周五发周报，周五之前也要交材料。');
    // 「每周五(…, REPEAT=weekly)」和「周五(…)」指向同一天
    expect(soleAnnotatedDate(annotated)).toBe('2026-08-21');
  });
});
