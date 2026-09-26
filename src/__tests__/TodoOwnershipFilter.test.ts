import {
  allowsOwnershipDrops,
  buildOwnershipPrompt,
  isSuspiciousVerdictSet,
  parseOwnershipVerdicts,
} from '../main/dashboard/TodoOwnershipFilter';

/**
 * 归属复核。风险不对称：误删是真丢事情，误留用户划掉就行，
 * 所以下面的用例大多在验证「拿不准时不删」。
 */

describe('allowsOwnershipDrops（确定性闸门）', () => {
  it('有明确甩手表述时才放行', () => {
    expect(allowsOwnershipDrops('这两块我就不管了。')).toBe(true);
    expect(allowsOwnershipDrops('那个不归我管。')).toBe(true);
    expect(allowsOwnershipDrops('这事跟我没关系。')).toBe(true);
  });

  it('只是提到别人的名字不算甩手', () => {
    // 实测模型会把这句判反，所以必须靠闸门拦住
    expect(allowsOwnershipDrops('这个报价我来跟，物流那块让小刘去对接。')).toBe(
      false,
    );
    expect(allowsOwnershipDrops('小刘明天去对接物流。')).toBe(false);
  });

  it('普通任务句一律不放行', () => {
    expect(allowsOwnershipDrops('记得把打印机的墨盒换了。')).toBe(false);
    expect(allowsOwnershipDrops('客户那边还等着我们的报价呢。')).toBe(false);
  });
});

describe('parseOwnershipVerdicts', () => {
  it('解析标准格式', () => {
    const v = parseOwnershipVerdicts('1|OTHER_PERSON\n2|MINE', 2);
    expect(v[0]).toMatchObject({ reason: 'OTHER_PERSON', drop: true });
    expect(v[1]).toMatchObject({ reason: 'MINE', drop: false });
  });

  it('兼容模型多写一个 KEEP/DROP 字段', () => {
    // 实测输出：「1|DROP|OTHER_PERSON」
    const v = parseOwnershipVerdicts('1|DROP|OTHER_PERSON\n2|KEEP|MINE', 2);
    expect(v[0].drop).toBe(true);
    expect(v[1].drop).toBe(false);
  });

  it('兼容全角竖线和拖在后面的解释', () => {
    const v = parseOwnershipVerdicts(
      '1｜MINE 需要说话人自己去做\n2|OTHER_PERSON',
      2,
    );
    expect(v[0].reason).toBe('MINE');
    expect(v[1].drop).toBe(true);
  });

  it('解析不出来的行保留该条', () => {
    const v = parseOwnershipVerdicts('乱七八糟的输出', 2);
    expect(v.every((item) => !item.drop)).toBe(true);
    expect(v.every((item) => item.reason === 'UNPARSED')).toBe(true);
  });

  it('越界编号被忽略，不影响其它条目', () => {
    const v = parseOwnershipVerdicts('5|OTHER_PERSON\n1|OTHER_PERSON', 2);
    expect(v[0].drop).toBe(true);
    expect(v[1].drop).toBe(false);
  });

  it('ALREADY_DONE / NOT_A_TASK 记录下来但不据此删除', () => {
    // 这两类实测误判率高：把「发季度报表」判成已完成、
    // 把「换墨盒」判成不是任务，所以只记不删。
    const v = parseOwnershipVerdicts('1|ALREADY_DONE\n2|NOT_A_TASK', 2);
    expect(v[0]).toMatchObject({ reason: 'ALREADY_DONE', drop: false });
    expect(v[1]).toMatchObject({ reason: 'NOT_A_TASK', drop: false });
  });
});

describe('isSuspiciousVerdictSet（塌缩保护）', () => {
  const drops = (n: number) =>
    Array.from({ length: n }, (_, index) => ({
      index,
      reason: 'OTHER_PERSON' as const,
      drop: true,
    }));

  it('两三条全判成别人的活是正常的', () => {
    // 「小刘去对接，老王负责接待，这两块我不管」确实该全删
    expect(isSuspiciousVerdictSet(drops(2))).toBe(false);
    expect(isSuspiciousVerdictSet(drops(3))).toBe(false);
  });

  it('四条以上全删更像模型跑飞', () => {
    expect(isSuspiciousVerdictSet(drops(4))).toBe(true);
  });

  it('只要有保留项就不算塌缩', () => {
    const mixed = [
      ...drops(4),
      { index: 4, reason: 'MINE' as const, drop: false },
    ];
    expect(isSuspiciousVerdictSet(mixed)).toBe(false);
  });
});

describe('buildOwnershipPrompt', () => {
  it('候选按编号列出，原文原样带上', () => {
    const prompt = buildOwnershipPrompt('小刘去对接物流，我不管。', [
      '对接物流',
      '写周报',
    ]);
    expect(prompt).toContain('1. 对接物流');
    expect(prompt).toContain('2. 写周报');
    expect(prompt).toContain('小刘去对接物流，我不管。');
  });

  it('明确写出「拿不准就 MINE」，倾向保留', () => {
    expect(buildOwnershipPrompt('x', ['a'])).toContain('宁可多留');
  });
});
