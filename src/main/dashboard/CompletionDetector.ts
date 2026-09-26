/**
 * 识别「已经做完」的句子，别把它们变成待办。
 *
 * 「服务器的续费上周就办好了」这种句子，模型会照样抽成「续费服务器」，
 * 而且因为没有日期，dueDate 回落到今天 —— 于是一件上周就结束的事
 * 出现在今天的日历上。提示词里写了四版规则都压不住，所以改成规则判定。
 *
 * 两级处理：
 *   1. 逐句标注 (已完成)，把信号放到词的旁边，模型不必回想全局规则；
 *   2. 整段都是已完成时直接短路，连模型都不用问。
 *
 * 判定刻意收得很紧：只认明确的完成标记，不认光秃秃的「了」。
 * 「把墨盒换了」「把白板笔补一下」是待办不是完成，
 * 误判成已完成会把真待办整条吞掉，代价比漏判大得多。
 */

/** 明确的完成标记。全部要求动词后带「完 / 好 / 过 / 掉」或前置「已经」。 */
const COMPLETION_PATTERNS: RegExp[] = [
  /已经[^，。；！？]*了/,
  /已[^，。；！？]{0,6}(完|好|过)了/,
  /[^，。；！？](完|好|过|掉)了/,
  /都(结|完|好)了/,
  /搞定了/,
  /结束了/,
  /完成了/,
  /(上周|上个月|昨天|前天|之前|早就)[^，。；！？]*就[^，。；！？]*了/,
  /\b(already|done|finished|completed|submitted|sent)\b/i,
];

/** 断句：中英文标点都算，口语转写里的空格不算，免得把短语切碎。 */
const CLAUSE_SPLIT = /[，,。.；;！!？?\n]+/;

export function isCompletedClause(clause: string): boolean {
  const text = clause.trim();
  if (text.length === 0) return false;
  return COMPLETION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 逐句在已完成的句子后面补 (已完成)，供模型直接参考。
 * 不改动原句，和日期标注保持同一套做法。
 */
export function annotateCompletedClauses(text: string): string {
  if (!text) return text;

  let result = '';
  let cursor = 0;
  const matches = [...text.matchAll(new RegExp(CLAUSE_SPLIT, 'g'))];

  const emit = (clause: string, tail: string) => {
    const done =
      isCompletedClause(clause) && !/\(已完成\)$/.test(clause.trim());
    result += done ? `${clause}(已完成)${tail}` : `${clause}${tail}`;
  };

  matches.forEach((match) => {
    const start = match.index ?? 0;
    emit(text.slice(cursor, start), match[0]);
    cursor = start + match[0].length;
  });
  emit(text.slice(cursor), '');

  return result;
}

/**
 * 整段是否只剩已完成的事。
 *
 * 要求：至少有一句带完成标记，且没有任何一句是「还没做」的。
 * 只有这种情况才敢直接判定为零待办 —— 有一句没完成就交给模型，
 * 避免把混合内容里的真待办一起吞掉。
 */
export function isEntirelyCompleted(text: string): boolean {
  const clauses = text
    .split(CLAUSE_SPLIT)
    .map((clause) => clause.trim())
    // 太短的碎片（语气词、「对」「嗯」）不作数
    .filter((clause) => clause.length >= 3);

  if (clauses.length === 0) return false;
  return clauses.every(isCompletedClause);
}
