/**
 * 待办提取的外层脚手架（harness）。
 *
 * 提示词调优那一轮的结论是：改提示词文字只救回了一个模型，
 * 有两个还过拟合到开发集上。剩下的失败模式是**结构性**的，
 * 靠在同一次调用里多写几条规则治不好：
 *
 *   - `qwen2.5:1.5b` 在无任务文本上 63.6% 会凭空造任务 —— 六个变体全试过，降不下来
 *   - `phi4-mini` 把「截止日」和「提前量」拆成两条、同一件事抽两遍、日期挂错
 *
 * 所以这里换一个层级：不改模型看到的那段话，改**它外面的流程**。
 * 四个手段各自对准一个已测出的失败模式，可以自由组合，都能单独开关，
 * 这样才能测出每一项各自贡献了多少，而不是一锅端说「加了一堆东西变好了」。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { extractAnnotatedDates } from '../../src/main/dashboard/RelativeDateRewriter';
import type { Extracted } from './todo-extraction-scoring';

export type HarnessOptions = {
  /** 先做一次 yes/no 判断，说没有承诺就直接返回空，不进抽取。 */
  gate: boolean;
  /** 门控用哪一版提示词：v1 抽象规则，v2 少样本对照。 */
  gateVariant: 1 | 2;
  /** 采样次数；>1 时只保留出现次数达到 voteThreshold 的任务。 */
  voteSamples: number;
  /** 投票阈值，默认过半。 */
  voteThreshold: number;
  /** 预测日期必须是文本里真的标注过的日期之一。 */
  dateBind: boolean;
  /** 一条标题被另一条包含时合并，治「同一件事抽两遍」。 */
  semanticDedup: boolean;
};

export const HARNESS_OFF: HarnessOptions = {
  gate: false,
  gateVariant: 1,
  voteSamples: 1,
  voteThreshold: 1,
  dateBind: false,
  semanticDedup: false,
};

/** 从 `--harness gate,vote3,date,dedup` 这种写法解析出配置。 */
export function parseHarness(spec: string | undefined): HarnessOptions {
  if (!spec || spec === 'off') return { ...HARNESS_OFF };
  const parts = spec.split(',').map((item) => item.trim().toLowerCase());
  const voteToken = parts.find((item) => /^vote\d*$/.test(item));
  const samples = voteToken ? Number(voteToken.slice(4) || 3) : 1;
  return {
    gate: parts.includes('gate') || parts.includes('gate2'),
    gateVariant: parts.includes('gate2') ? 2 : 1,
    voteSamples: Math.max(1, samples),
    // 过半即可：3 次里出现 2 次就算稳定
    voteThreshold: Math.max(1, Math.ceil(Math.max(1, samples) / 2)),
    dateBind: parts.includes('date'),
    semanticDedup: parts.includes('dedup'),
  };
}

export function describeHarness(options: HarnessOptions): string {
  const parts: string[] = [];
  if (options.gate) {
    parts.push(
      options.gateVariant === 2 ? '二段式门控（少样本）' : '二段式门控',
    );
  }
  if (options.voteSamples > 1) {
    parts.push(`自洽性投票 ${options.voteSamples} 取 ${options.voteThreshold}`);
  }
  if (options.dateBind) parts.push('日期绑定');
  if (options.semanticDedup) parts.push('语义去重');
  return parts.length > 0 ? parts.join(' + ') : '无（对照组）';
}

/* ------------------------------ 二段式门控 ------------------------------ */

/**
 * 只问一个是非题。
 *
 * 为什么这样有用：让模型「在没有任务时返回空数组」是一个**生成**任务，
 * 它天然倾向于生成点什么；而「这段话里有没有人承诺要做某件事」是一个**判断**任务，
 * 小模型在后者上明显更可靠。把两件事拆开，抽取那一步就只在确实有任务时才跑。
 */
/**
 * 门控 v2：改成少样本对照。
 *
 * v1 用一段抽象规则描述「什么算任务」，实测下来 `ministral-3` 对所有输入都答 NO，
 * `granite4` 也会把「明天交周报。」判成 NO —— 抽象规则对小模型太难。
 * v2 换成三个具体示例，让模型照着对照，而不是自己去理解定义。
 * 探测结果：ministral-3 从全 NO 变成 3/5，granite4 与 qwen2.5:3b 到 4/5。
 */
export function buildFewShotGatePrompt(annotated: string): string {
  return `Decide whether a transcript contains an outstanding action.

Example 1
Transcript: "好的好的，行，那就这样，辛苦了，再见。"
Answer: NO

Example 2
Transcript: "明天交周报。"
Answer: YES

Example 3
Transcript: "今天的会主要是同步一下上半年情况，营收涨了百分之十二。"
Answer: NO

Example 4
Transcript: "唉，李工那边的接口文档拖了快两周了，我这边一直卡着动不了。"
Answer: YES

Now answer for the transcript below. Reply with exactly one word: YES or NO.

Transcript: "${annotated}"
Answer:`;
}

export function buildGatePrompt(annotated: string): string {
  return `Read the transcript below and answer ONE question.

Question: does the speaker commit to doing something that is NOT yet finished?

Answer YES only if there is a real outstanding action. Answer NO for:
- descriptions of what a meeting covered, statistics, or results
- greetings, small talk, and closing pleasantries
- room numbers, phone numbers, order codes, amounts of money
- work that is already finished
- other people's tasks that the speaker explicitly hands off

Reply with exactly one word: YES or NO.

Transcript:
"""
${annotated}
"""`;
}

export function readGate(raw: string): boolean {
  const text = raw.trim().toLowerCase();
  // 只在明确说 NO 时拦截。模型答得含糊时放行，让抽取那一步去判断，
  // 免得门控本身变成新的漏检来源。
  if (/^\s*no\b/.test(text)) return false;
  if (/\bno\b/.test(text) && !/\byes\b/.test(text)) return false;
  return true;
}

/* ------------------------------ 自洽性投票 ------------------------------ */

function normalizeTitle(title: string): string {
  return title
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .slice(0, 24);
}

/**
 * 多次采样后只保留稳定出现的任务。
 *
 * 依据：幻觉出来的任务在多次采样之间不稳定，真实任务稳定。
 * 日期取该任务在各次采样里出现最多的那个，同样按多数决。
 */
export function voteAcrossSamples(
  samples: Extracted[][],
  threshold: number,
): Extracted[] {
  const buckets = new Map<
    string,
    { items: Extracted[]; sampleIndexes: Set<number> }
  >();
  samples.forEach((sample, index) => {
    for (const item of sample) {
      const key = normalizeTitle(item.title);
      if (!key) continue;
      const bucket = buckets.get(key) ?? {
        items: [],
        sampleIndexes: new Set<number>(),
      };
      bucket.items.push(item);
      bucket.sampleIndexes.add(index);
      buckets.set(key, bucket);
    }
  });

  const survivors: Extracted[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.sampleIndexes.size < threshold) continue;
    // 日期也投票：取出现次数最多的那个
    const dateCounts = new Map<string, number>();
    for (const item of bucket.items) {
      dateCounts.set(item.dueDate, (dateCounts.get(item.dueDate) ?? 0) + 1);
    }
    const dueDate = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const repeatCounts = new Map<string, number>();
    for (const item of bucket.items) {
      const key = String(item.repeat);
      repeatCounts.set(key, (repeatCounts.get(key) ?? 0) + 1);
    }
    const repeatKey = [...repeatCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0][0];
    survivors.push({
      // 标题取最短的那条：模型复述同一件事时，短的通常是本体
      title: [...bucket.items].sort(
        (a, b) => a.title.length - b.title.length,
      )[0].title,
      dueDate,
      repeat: repeatKey === 'null' ? null : (repeatKey as Extracted['repeat']),
    });
  }
  return survivors;
}

/* ------------------------------- 日期绑定 ------------------------------- */

/**
 * 预测日期必须是这段文本里真的被标注过的日期之一。
 *
 * 线上流程已经把每个可解析的相对日期就地标成 `周五(2026-08-21)`，
 * 模型只需要照抄。`phi4-mini` 的日期准确率只有 63%，错法是自己另算一个 ——
 * 这类错误不需要更好的提示词，用代码挡掉即可：
 * 不在标注集合里的日期一律回落到全文唯一的标注日期，没有唯一解就回落到今天。
 */
export function bindDates(
  items: Extracted[],
  annotated: string,
  today: string,
): Extracted[] {
  const allowed = new Set(extractAnnotatedDates(annotated));
  if (allowed.size === 0) return items;
  const sole = allowed.size === 1 ? [...allowed][0] : null;
  return items.map((item) => {
    if (allowed.has(item.dueDate)) return item;
    // 没有唯一解时回落到今天，与线上 normalizeDueDate 的兜底一致
    return { ...item, dueDate: sole ?? today };
  });
}

/* ------------------------------- 语义去重 ------------------------------- */

/**
 * 一条标题被另一条包含时合并，保留较短的那条。
 *
 * 线上的去重是「标题 + 日期完全相同」，挡不住
 * 「修改预算表」和「确保在周三前完成修改预算表」这种复述 ——
 * `phi4-mini` 最常见的多抽就是这一类。
 */
export function subsumptionDedup(items: Extracted[]): Extracted[] {
  const normalized = items.map((item) => ({
    item,
    key: item.title.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''),
  }));
  const dropped = new Set<number>();
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = 0; j < normalized.length; j += 1) {
      if (i === j || dropped.has(i) || dropped.has(j)) continue;
      const a = normalized[i];
      const b = normalized[j];
      if (a.key.length === 0 || b.key.length === 0) continue;
      // b 包含 a：b 是复述，丢掉长的那条
      if (b.key.length > a.key.length && b.key.includes(a.key)) {
        dropped.add(j);
      }
    }
  }
  return normalized
    .filter((_, index) => !dropped.has(index))
    .map((entry) => entry.item);
}
