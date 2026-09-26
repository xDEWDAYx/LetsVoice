/**
 * 「这条到底要不要我干」的复核环节。
 *
 * 抽取那一步是生成式的：模型要同时找任务、判归属、判是否已完成、抄日期、
 * 定周期。五件事糅在一个 prompt 里，3B 模型顾此失彼 —— 实测反复失手的
 * 恰恰是筛选，而不是抽取。所以拆成两步，这里只问一件事。
 *
 * 但实测也说明：不是每种判断都能信。同一个模型在这四类里的表现差很多：
 *   OTHER_PERSON  可靠。「小刘去对接」「老王负责」「这块我不管」都判对了
 *   ALREADY_DONE  不可靠。把「周五之前把季度报表发给财务」判成已完成
 *   NOT_A_TASK    不可靠。把「更换打印机墨盒」判成不是任务
 *
 * 误删是真丢事情，误留用户划掉就行 —— 风险不对称。
 * 所以**只采信 OTHER_PERSON**，另外两类照样收集但不据此删除，
 * 留在日志里供以后换大模型时重新评估。
 */

export type TodoVerdictCode =
  | 'MINE'
  | 'OTHER_PERSON'
  | 'ALREADY_DONE'
  | 'NOT_A_TASK';

export type TodoVerdict = {
  index: number;
  /** 模型给出的分类；解析不出来是 UNPARSED。 */
  reason: TodoVerdictCode | 'UNPARSED';
  /** 是否真的据此删除。目前只有 OTHER_PERSON 会为 true。 */
  drop: boolean;
};

const REASON_CODES: TodoVerdictCode[] = [
  'MINE',
  'OTHER_PERSON',
  'ALREADY_DONE',
  'NOT_A_TASK',
];

/** 唯一被采信、可以据此删除的分类。 */
const TRUSTED_DROP_CODES: TodoVerdictCode[] = ['OTHER_PERSON'];

/**
 * 说话人明确「这事不归我」的说法。
 *
 * 只靠模型判归属不行：实测「这个报价我来跟，物流那块让小刘去对接」
 * 会被判反，「客户还等着我们的报价」也被当成别人的活 —— 误删率一半。
 *
 * 所以加一道确定性闸门：只有转录里出现下面这类明确甩手的说法，
 * 才允许按模型判定删除。没有这句话时整个复核都不跑，
 * 既避免误删，也省掉一次模型调用。
 */
const OPT_OUT_MARKERS =
  /(我就不管|我不管|不归我管|不用我管|不用我跟|我不参与|我不掺和|与我无关|跟我没关系|我这边不用|不用我负责|我就不插手)/;

/** 转录里有没有明确的甩手表述 —— 有才允许据此删除。 */
export function allowsOwnershipDrops(transcript: string): boolean {
  return OPT_OUT_MARKERS.test(transcript);
}

/**
 * 整批都判成「别人的」时，超过这个条数就当模型塌缩，整批保留。
 * 一两条全是别人的活很常见（「小刘去对接，老王负责接待」），
 * 一次五六条全甩给别人则更像模型跑飞了。
 */
const COLLAPSE_THRESHOLD = 4;

export function buildOwnershipPrompt(
  transcript: string,
  titles: string[],
): string {
  const list = titles.map((title, i) => `${i + 1}. ${title}`).join('\n');
  return `你在帮说话人整理待办清单。下面是一段转录，和从中提取的候选事项。

对每一条候选，只判断一件事：这件事该由谁来做？

  OTHER_PERSON  转录里明说是别人负责，或说话人明说不归自己管。
                例：「小刘去对接物流」「老王负责接待」「这两块我就不管了」
  MINE          其余全部算 MINE —— 只要没有明确指派给别人，就当成说话人自己的事。

拿不准就写 MINE。宁可多留，不要误删。

转录原文：
"""
${transcript}
"""

候选事项：
${list}

每条输出一行，严格如下格式，不要输出别的内容：
编号|分类

例如：
1|OTHER_PERSON
2|MINE`;
}

/**
 * 解析逐行判定。
 *
 * 兼容模型常见的跑偏写法：多一个 KEEP/DROP 字段、用全角竖线、
 * 分类后面拖一段解释。任何解析不出来的行都保留该条。
 */
export function parseOwnershipVerdicts(
  raw: string,
  count: number,
): TodoVerdict[] {
  const verdicts: TodoVerdict[] = Array.from({ length: count }, (_, i) => ({
    index: i,
    reason: 'UNPARSED' as const,
    drop: false,
  }));

  raw.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(\d+)\s*[|｜]\s*(.+)$/);
    if (!match) return;
    const index = Number(match[1]) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= count) return;

    // 整行里第一个出现的已知分类码为准：模型有时会写成
    // 「1|DROP|OTHER_PERSON」，KEEP/DROP 那格是多余的。
    const upper = match[2].toUpperCase();
    const code = REASON_CODES.find((candidate) => upper.includes(candidate));
    if (!code) return;

    verdicts[index] = {
      index,
      reason: code,
      drop: TRUSTED_DROP_CODES.includes(code),
    };
  });

  return verdicts;
}

/** 全批被判成别人的活，且条数偏多 —— 更像模型跑飞，别当真。 */
export function isSuspiciousVerdictSet(verdicts: TodoVerdict[]): boolean {
  return (
    verdicts.length >= COLLAPSE_THRESHOLD &&
    verdicts.every((verdict) => verdict.drop)
  );
}
