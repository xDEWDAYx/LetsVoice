/**
 * 读取盲审模板中的标签，计算 Judge—盲审一致率与 κ。
 * 模板没有标签时只写 pending 状态，不伪造审阅结论。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import { benchmarkResultsRoot } from './tts-paths';

type Json = Record<string, any>;

function cohenKappa(left: boolean[], right: boolean[]): number | null {
  if (left.length < 2 || left.length !== right.length) return null;
  const observed =
    left.filter((value, index) => value === right[index]).length / left.length;
  const leftPositive = left.filter(Boolean).length / left.length;
  const rightPositive = right.filter(Boolean).length / right.length;
  const expected =
    leftPositive * rightPositive + (1 - leftPositive) * (1 - rightPositive);
  if (expected === 1) return observed === 1 ? 1 : null;
  return (observed - expected) / (1 - expected);
}

function groundednessBand(value: number): number {
  if (value < 1 / 3) return 0;
  if (value < 2 / 3) return 1;
  return 2;
}

/** 三档 groundedness 的二次加权 κ。 */
function weightedKappa(left: number[], right: number[]): number | null {
  if (left.length < 2 || left.length !== right.length) return null;
  const categories = 3;
  const observed = Array.from({ length: categories }, () =>
    Array.from({ length: categories }, () => 0),
  );
  left.forEach((value, index) => {
    observed[value][right[index]] += 1;
  });
  const leftMargins = observed.map((row) =>
    row.reduce((sum, value) => sum + value, 0),
  );
  const rightMargins = Array.from({ length: categories }, (_, column) =>
    observed.reduce((sum, row) => sum + row[column], 0),
  );
  let weightedObserved = 0;
  let weightedExpected = 0;
  for (let row = 0; row < categories; row += 1) {
    for (let column = 0; column < categories; column += 1) {
      const weight = ((row - column) / (categories - 1)) ** 2;
      weightedObserved += weight * (observed[row][column] / left.length);
      weightedExpected +=
        weight * ((leftMargins[row] * rightMargins[column]) / left.length ** 2);
    }
  }
  if (weightedExpected === 0) return weightedObserved === 0 ? 1 : null;
  return 1 - weightedObserved / weightedExpected;
}

function main(): void {
  const results = benchmarkResultsRoot();
  const reviewPath = path.join(results, 'agent-eval-human-review.json');
  const evalPath = path.join(results, 'agent-eval.json');
  if (!fs.existsSync(reviewPath) || !fs.existsSync(evalPath)) {
    throw new Error('请先运行 npm run bench:agent 生成评测结果和盲审模板。');
  }
  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8')) as Json;
  const evaluation = JSON.parse(fs.readFileSync(evalPath, 'utf8')) as Json;
  const firstRoundById = new Map<string, Json>(
    (evaluation.rounds[0].cases as Json[]).map((item) => [
      String(item.task.id),
      item,
    ]),
  );
  const labelled = (review.items as Json[]).filter(
    (item) =>
      typeof item.human_pass === 'boolean' &&
      typeof item.human_groundedness === 'number' &&
      item.human_groundedness >= 0 &&
      item.human_groundedness <= 1 &&
      firstRoundById.has(String(item.task_id)),
  );
  const humanPass = labelled.map((item) => Boolean(item.human_pass));
  const judgePass = labelled.map((item) => {
    const source = firstRoundById.get(String(item.task_id)) as Json;
    return (
      source.score.judge.correctness >= 2 && source.score.judge.answer_mode_pass
    );
  });
  const humanGroundedness = labelled.map((item) =>
    groundednessBand(Number(item.human_groundedness)),
  );
  const judgeGroundedness = labelled.map((item) => {
    const source = firstRoundById.get(String(item.task_id)) as Json;
    return groundednessBand(Number(source.score.judge.groundedness));
  });
  const agreement = labelled.length
    ? humanPass.filter((value, index) => value === judgePass[index]).length /
      labelled.length
    : null;
  const blindReviewPassRate = labelled.length
    ? humanPass.filter(Boolean).length / labelled.length
    : null;
  const blindReviewGroundednessMean = labelled.length
    ? labelled.reduce((sum, item) => sum + Number(item.human_groundedness), 0) /
      labelled.length
    : null;
  let status = 'partial';
  if (labelled.length === 0) status = 'pending';
  else if (labelled.length === review.items.length) status = 'complete';
  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    dataset_hash: evaluation.dataset.hash,
    review_provenance: review.review_provenance ?? null,
    status,
    labelled_count: labelled.length,
    requested_count: review.items.length,
    blind_review_pass_rate: blindReviewPassRate,
    blind_review_groundedness_mean: blindReviewGroundednessMean,
    raw_pass_agreement: agreement,
    cohen_kappa: cohenKappa(humanPass, judgePass),
    groundedness_weighted_kappa: weightedKappa(
      humanGroundedness,
      judgeGroundedness,
    ),
    disagreements: labelled
      .filter((item, index) => humanPass[index] !== judgePass[index])
      .map((item) => ({
        task_id: item.task_id,
        human_pass: item.human_pass,
        judge_pass: judgePass[labelled.indexOf(item)],
        human_notes: item.human_notes ?? '',
      })),
  };
  const outputPath = path.join(results, 'agent-eval-human-agreement.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(
    `盲审标签 ${output.labelled_count}/${output.requested_count} · 状态 ${output.status}\n` +
      `结果: ${outputPath}\n`,
  );
}

main();
