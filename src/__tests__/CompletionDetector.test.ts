import {
  annotateCompletedClauses,
  isCompletedClause,
  isEntirelyCompleted,
} from '../main/dashboard/CompletionDetector';

/**
 * 关键取舍：宁可漏判，不可误判。
 * 把真待办误判成已完成会整条丢掉，比留一条多余待办严重得多。
 */

describe('isCompletedClause', () => {
  it('认出明确的完成说法', () => {
    expect(isCompletedClause('昨天已经把报销单交上去了')).toBe(true);
    expect(isCompletedClause('合同也签完了')).toBe(true);
    expect(isCompletedClause('服务器的续费上周就办好了')).toBe(true);
    expect(isCompletedClause('邮件我也回过了')).toBe(true);
    expect(isCompletedClause('这几件事都结了')).toBe(true);
    expect(isCompletedClause('那个需求早就做完了')).toBe(true);
  });

  it('认出英文的完成说法', () => {
    expect(isCompletedClause('already sent the invoice')).toBe(true);
    expect(isCompletedClause('the contract is done')).toBe(true);
  });

  it('光秃秃的「了」不算完成 —— 这是待办的常见语气', () => {
    // 测试 #18：这两条是待办，绝不能被吞掉
    expect(isCompletedClause('记得把打印机的墨盒换了')).toBe(false);
    expect(isCompletedClause('另外把会议室的白板笔补一下')).toBe(false);
    expect(isCompletedClause('明天交周报')).toBe(false);
    expect(isCompletedClause('别忘了那个预算表')).toBe(false);
  });

  it('未来 / 待办语气不算完成', () => {
    expect(isCompletedClause('周五之前把季度报表发给财务')).toBe(false);
    expect(isCompletedClause('下周一要交差旅报销的单子')).toBe(false);
    expect(isCompletedClause('客户那边还等着我们的报价呢')).toBe(false);
    expect(isCompletedClause('保险还没续')).toBe(false);
  });

  it('空白不算', () => {
    expect(isCompletedClause('')).toBe(false);
    expect(isCompletedClause('   ')).toBe(false);
  });
});

describe('annotateCompletedClauses', () => {
  it('只在已完成的句子后面补标记，原文不动', () => {
    const result = annotateCompletedClauses(
      '昨天已经把报销单交上去了，明天要开会。',
    );
    expect(result).toContain('昨天已经把报销单交上去了(已完成)，');
    expect(result).toContain('明天要开会');
    expect(result).not.toContain('明天要开会(已完成)');
  });

  it('保留原有标点与顺序', () => {
    const source = '合同也签完了，白板笔补一下。';
    const result = annotateCompletedClauses(source);
    expect(result.replace(/\(已完成\)/g, '')).toBe(source);
  });

  it('没有完成句时一个字都不改', () => {
    const source = '明天早上给张经理回个电话，下周三跟法务过合同。';
    expect(annotateCompletedClauses(source)).toBe(source);
  });

  it('重复执行不会叠加标记', () => {
    const once = annotateCompletedClauses('合同也签完了。');
    expect(annotateCompletedClauses(once)).toBe(once);
  });

  it('空输入原样返回', () => {
    expect(annotateCompletedClauses('')).toBe('');
  });
});

describe('isEntirelyCompleted', () => {
  it('测试 #15：整段都是已完成的事 —— 应判定为零待办', () => {
    expect(
      isEntirelyCompleted(
        '昨天已经把报销单交上去了，合同也签完了，服务器的续费上周就办好了，邮件我也回过了。这几件事都结了。',
      ),
    ).toBe(true);
  });

  it('混合内容不短路，交给模型判断', () => {
    expect(
      isEntirelyCompleted('昨天已经把报销单交上去了，明天还要交周报。'),
    ).toBe(false);
  });

  it('纯待办不会被误判', () => {
    expect(
      isEntirelyCompleted(
        '记得把打印机的墨盒换了，另外把会议室的白板笔补一下。',
      ),
    ).toBe(false);
    expect(isEntirelyCompleted('明天交周报。')).toBe(false);
  });

  it('纯陈述 / 寒暄不算「全部已完成」，走原来的空数组路径', () => {
    expect(isEntirelyCompleted('好的好的，行，那就这样，辛苦了，再见。')).toBe(
      false,
    );
    expect(
      isEntirelyCompleted('营收比去年同期涨了百分之十二，华东区表现最好。'),
    ).toBe(false);
  });

  it('空输入不短路', () => {
    expect(isEntirelyCompleted('')).toBe(false);
    expect(isEntirelyCompleted('   ')).toBe(false);
  });
});
