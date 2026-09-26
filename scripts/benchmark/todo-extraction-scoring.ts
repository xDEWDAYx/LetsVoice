/**
 * 待办提取评测的解析与打分。
 *
 * 单独拎出来是为了让两个消费方共用同一套判定：
 *   - scripts/benchmark/todo-extraction-eval.ts  出报告用的聚合指标
 *   - src/__tests__/todoExtraction.eval.ts       Jest 里的通过/失败回归门禁
 * 否则两边的口径迟早会漂移，报告里的数字就解释不清了。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { normalizeDueDate } from '../../src/main/dashboard/DateContext';
import { normalizeRepeat } from '../../src/main/dashboard/RecurrenceExpander';
import type { RepeatKind } from '../../src/main/dashboard/RecurrenceExpander';
import type { EvalCase, GoldTask } from './todo-extraction-corpus';

export type Extracted = {
  title: string;
  dueDate: string;
  repeat: RepeatKind | null;
};

/**
 * 复刻线上的解析与后处理：截取 JSON 数组 → 规范化日期 →
 * 只认文本里真的标注过的重复类型 → 标题+日期相同的视为同一条。
 */
export function parseModelOutput(
  raw: string,
  annotated: string,
  today: string,
): Extracted[] | null {
  const grounded = new Set(
    [...annotated.matchAll(/REPEAT=([a-z]+)/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  let content = raw;
  if (content.startsWith('{') && content.endsWith('}'))
    content = `[${content}]`;
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.title === 'string' &&
          item.title.trim().length > 0,
      )
      .map((item) => ({
        title: String(item.title).trim(),
        dueDate: normalizeDueDate(item.dueDate, today),
        repeat: (() => {
          // 文本里没标注过这个周期就不认，防止模型脑补出 weekly
          const kind = normalizeRepeat(item.repeat);
          return kind && grounded.has(kind) ? kind : null;
        })(),
      }))
      .filter((item, index, all) => {
        const key = `${item.title.toLocaleLowerCase()}@${item.dueDate}`;
        return (
          all.findIndex(
            (other) =>
              `${other.title.toLocaleLowerCase()}@${other.dueDate}` === key,
          ) === index
        );
      });
  } catch {
    return null;
  }
}

function matchesKeywords(item: Extracted, gold: GoldTask): boolean {
  const title = item.title.toLocaleLowerCase();
  return gold.keywords.some((word) => title.includes(word.toLocaleLowerCase()));
}

function dateMatches(item: Extracted, gold: GoldTask): boolean | null {
  if (gold.anyDueDate) return gold.anyDueDate.includes(item.dueDate);
  if (gold.dueDate === undefined || gold.dueDate === null) return null;
  return item.dueDate === gold.dueDate;
}

export type CaseScore = {
  id: string;
  split: string;
  scenario: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  dateChecked: number;
  dateCorrect: number;
  repeatChecked: number;
  repeatCorrect: number;
  duplicateCount: number;
  /** 金标任务被并进了另一条已匹配的任务里，而不是彻底没抽到。 */
  mergedIntoOther: number;
  forbiddenDateHits: number;
  parseFailed: boolean;
  passed: boolean;
  predicted: Extracted[];
  problems: string[];
};

/**
 * 贪心一一匹配：标题命中金标关键词即算同一条任务。
 * 匹配不上的预测项计为假阳性，没被匹配到的金标任务计为漏检。
 * optionalTasks 只吸收预测项，两头都不计分——用于语义本身有歧义的边界用例。
 */
export function scoreCase(
  testCase: EvalCase,
  items: Extracted[] | null,
): CaseScore {
  const base = {
    id: testCase.id,
    split: testCase.split,
    scenario: testCase.scenario,
  };
  if (items === null) {
    return {
      ...base,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: testCase.tasks.length,
      dateChecked: 0,
      dateCorrect: 0,
      repeatChecked: 0,
      repeatCorrect: 0,
      duplicateCount: 0,
      mergedIntoOther: 0,
      forbiddenDateHits: 0,
      parseFailed: true,
      passed: false,
      predicted: [],
      problems: ['模型输出无法解析为 JSON 数组'],
    };
  }

  const problems: string[] = [];
  const used = new Set<number>();
  let truePositives = 0;
  let falseNegatives = 0;
  let dateChecked = 0;
  let dateCorrect = 0;
  let repeatChecked = 0;
  let repeatCorrect = 0;
  let mergedIntoOther = 0;

  for (const gold of testCase.tasks) {
    const index = items.findIndex(
      (item, position) => !used.has(position) && matchesKeywords(item, gold),
    );
    if (index === -1) {
      falseNegatives += 1;
      // 「合并」和「彻底漏掉」都算召回失败，但产品影响完全不同：
      // 合并后用户至少还看得见这件事，只是没有独立的条目和独立的日期。
      // 分开统计，才看得出模型到底是漏读了，还是把并列分句压成了一条。
      const mergedInto = items.find(
        (item, position) => used.has(position) && matchesKeywords(item, gold),
      );
      if (mergedInto) {
        mergedIntoOther += 1;
        problems.push(
          `合并进其他任务: ${gold.keywords.join('/')} → 「${mergedInto.title}」`,
        );
      } else {
        problems.push(`漏检: ${gold.keywords.join('/')}`);
      }
      continue;
    }
    used.add(index);
    truePositives += 1;
    const item = items[index];

    const dateVerdict = dateMatches(item, gold);
    if (dateVerdict !== null) {
      dateChecked += 1;
      if (dateVerdict) dateCorrect += 1;
      else {
        problems.push(
          `日期错误: ${gold.keywords[0]} 期望 ${
            gold.anyDueDate?.join('/') ?? gold.dueDate
          }，得到 ${item.dueDate}`,
        );
      }
    }
    if (gold.repeat !== undefined) {
      repeatChecked += 1;
      if (item.repeat === gold.repeat) repeatCorrect += 1;
      else {
        problems.push(
          `重复类型错误: ${gold.keywords[0]} 期望 ${gold.repeat}，得到 ${item.repeat}`,
        );
      }
    }
  }

  for (const gold of testCase.optionalTasks ?? []) {
    const index = items.findIndex(
      (item, position) => !used.has(position) && matchesKeywords(item, gold),
    );
    if (index !== -1) used.add(index);
  }

  const spurious = items.filter((_, position) => !used.has(position));
  if (spurious.length > 0) {
    problems.push(
      `多抽 ${spurious.length} 条: ${spurious.map((item) => item.title).join(' / ')}`,
    );
  }

  const titleCounts = new Map<string, number>();
  for (const item of items) {
    const key = item.title.toLocaleLowerCase();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const duplicateCount = [...titleCounts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  if (duplicateCount > 0) problems.push(`重复标题 ${duplicateCount} 条`);

  const forbidden = new Set(testCase.forbiddenDates ?? []);
  const forbiddenDateHits = items.filter((item) =>
    forbidden.has(item.dueDate),
  ).length;
  if (forbiddenDateHits > 0) {
    problems.push(`出现了禁止日期 ${forbiddenDateHits} 次`);
  }

  return {
    ...base,
    truePositives,
    falsePositives: spurious.length,
    falseNegatives,
    dateChecked,
    dateCorrect,
    repeatChecked,
    repeatCorrect,
    duplicateCount,
    mergedIntoOther,
    forbiddenDateHits,
    parseFailed: false,
    passed: problems.length === 0,
    predicted: items,
    problems,
  };
}

export function aggregate(scores: CaseScore[], cases: EvalCase[]) {
  const truePositives = scores.reduce((sum, s) => sum + s.truePositives, 0);
  const falsePositives = scores.reduce((sum, s) => sum + s.falsePositives, 0);
  const falseNegatives = scores.reduce((sum, s) => sum + s.falseNegatives, 0);
  const precision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : null;
  const recall =
    truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

  const dateChecked = scores.reduce((sum, s) => sum + s.dateChecked, 0);
  const dateCorrect = scores.reduce((sum, s) => sum + s.dateCorrect, 0);
  const repeatChecked = scores.reduce((sum, s) => sum + s.repeatChecked, 0);
  const repeatCorrect = scores.reduce((sum, s) => sum + s.repeatCorrect, 0);

  const zeroTaskIds = new Set(
    cases.filter((item) => item.tasks.length === 0).map((item) => item.id),
  );
  const zeroTaskScores = scores.filter((s) => zeroTaskIds.has(s.id));
  const zeroTaskViolations = zeroTaskScores.filter(
    (s) => s.falsePositives > 0,
  ).length;
  const predictionTotal = scores.reduce(
    (sum, s) => sum + s.predicted.length,
    0,
  );

  return {
    case_count: scores.length,
    passed_cases: scores.filter((s) => s.passed).length,
    case_pass_rate: scores.length
      ? scores.filter((s) => s.passed).length / scores.length
      : null,
    true_positives: truePositives,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
    precision,
    recall,
    f1,
    date_accuracy: dateChecked > 0 ? dateCorrect / dateChecked : null,
    date_checked: dateChecked,
    repeat_accuracy: repeatChecked > 0 ? repeatCorrect / repeatChecked : null,
    repeat_checked: repeatChecked,
    zero_task_case_count: zeroTaskScores.length,
    zero_task_false_positive_rate:
      zeroTaskScores.length > 0
        ? zeroTaskViolations / zeroTaskScores.length
        : null,
    duplicate_rate:
      predictionTotal > 0
        ? scores.reduce((sum, s) => sum + s.duplicateCount, 0) / predictionTotal
        : 0,
    merged_into_other: scores.reduce((sum, s) => sum + s.mergedIntoOther, 0),
    merged_share_of_misses:
      falseNegatives > 0
        ? scores.reduce((sum, s) => sum + s.mergedIntoOther, 0) / falseNegatives
        : null,
    forbidden_date_hits: scores.reduce(
      (sum, s) => sum + s.forbiddenDateHits,
      0,
    ),
    parse_failure_rate: scores.length
      ? scores.filter((s) => s.parseFailed).length / scores.length
      : null,
    prediction_total: predictionTotal,
  };
}

export type Aggregate = ReturnType<typeof aggregate>;
