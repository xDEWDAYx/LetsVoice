/**
 * 把「调优前 / 调优后」两条臂合成一份可出图的对比数据。
 *
 * 实验设计：
 *  - 变体的**选择**只在开发集（22 条）上做，见 tune-prompts.ts；
 *  - 保留集（32 条）用来**评估**对照臂和实验臂 —— 这正是保留集的用途，
 *    选择和评估分开，才能看出开发集上的提升有多少真的迁移过去了。
 *
 * 这份数据最重要的信息往往是负面的：某个模型开发集涨了、保留集却掉了，
 * 说明那次「提升」只是拟合了那 22 条。不把这种情况报出来，
 * 逐模型调优就会变成又一个「20/22」。
 *
 *   npm run bench:tuning-diff
 */

/* eslint-disable no-restricted-syntax, no-continue */

import fs from 'fs';
import path from 'path';
import { Json, RESULTS } from './report-format';

function safeName(model: string): string {
  return model.replace(/[^\w.-]+/g, '_');
}

function read(file: string): Json | null {
  const full = path.join(RESULTS, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8')) as Json;
}

function main(): void {
  const profiles = read('prompt-profiles.json');
  if (!profiles) {
    throw new Error('缺少 prompt-profiles.json，先跑 npm run bench:tune');
  }
  const chosen = profiles.chosen as Record<string, string>;

  const models = Object.entries(chosen).map(([model, variant]) => {
    const baseline = read(`todo-extraction-eval-${safeName(model)}.json`);
    const suffix = variant === 'baseline' ? '' : `--${variant}`;
    const tuned = read(`todo-extraction-eval-${safeName(model)}${suffix}.json`);
    const trial = (profiles.per_model as Json[]).find(
      (item) => item.model === model,
    );
    const pick = (source: Json | null) =>
      source
        ? {
            holdout_f1: source.mean_across_rounds.holdout.f1,
            holdout_case_pass_rate:
              source.mean_across_rounds.holdout.case_pass_rate,
            holdout_precision: source.mean_across_rounds.holdout.precision,
            holdout_recall: source.mean_across_rounds.holdout.recall,
            dev_f1: source.mean_across_rounds.dev.f1,
            date_accuracy: source.mean_across_rounds.overall.date_accuracy,
            zero_task_false_positive_rate:
              source.mean_across_rounds.overall.zero_task_false_positive_rate,
            parse_failure_rate:
              source.mean_across_rounds.overall.parse_failure_rate,
          }
        : null;
    const before = pick(baseline);
    const after = pick(tuned);
    const delta =
      before && after
        ? {
            holdout_f1: Number(after.holdout_f1) - Number(before.holdout_f1),
            holdout_case_pass_rate:
              Number(after.holdout_case_pass_rate) -
              Number(before.holdout_case_pass_rate),
            zero_task_false_positive_rate:
              Number(after.zero_task_false_positive_rate) -
              Number(before.zero_task_false_positive_rate),
            dev_f1: Number(after.dev_f1) - Number(before.dev_f1),
          }
        : null;
    // 开发集涨、保留集掉 —— 这就是过拟合的信号，单独标出来
    const overfitted =
      delta !== null && delta.dev_f1 > 0.01 && delta.holdout_f1 < 0;
    return {
      model,
      chosen_variant: variant,
      variant_describe:
        (profiles.variants as Json[]).find((item) => item.id === variant)
          ?.describe ?? null,
      selection_reason: trial?.reason ?? null,
      dev_trials: trial?.trials ?? null,
      before,
      after,
      delta,
      overfitted,
    };
  });

  const improved = models.filter(
    (item) => item.delta && item.delta.holdout_f1 > 0.005,
  ).length;
  const regressed = models.filter(
    (item) => item.delta && item.delta.holdout_f1 < -0.005,
  ).length;

  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    design:
      '变体在开发集 22 条上选择；对照臂与实验臂都在冻结的保留集 32 条上评估',
    selection_rule: profiles.selection_rule,
    summary: {
      model_count: models.length,
      holdout_f1_improved: improved,
      holdout_f1_regressed: regressed,
      overfitted_to_dev: models.filter((item) => item.overfitted).length,
    },
    models,
  };
  const outputPath = path.join(RESULTS, 'llm-tuning-comparison.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  const signed = (value: unknown) => {
    const number = Number(value) * 100;
    return `${number >= 0 ? '+' : ''}${number.toFixed(1)}`;
  };
  process.stdout.write('调优前后对比（均在冻结的保留集上评估）\n\n');
  for (const item of models) {
    if (!item.delta) {
      process.stdout.write(`  ${item.model} 缺数据\n`);
      continue;
    }
    process.stdout.write(
      `  ${item.model.padEnd(36)} ${String(item.chosen_variant).padEnd(14)} ` +
        `F1 ${signed(item.delta.holdout_f1)}  ` +
        `通过率 ${signed(item.delta.holdout_case_pass_rate)}  ` +
        `假阳性 ${signed(item.delta.zero_task_false_positive_rate)}` +
        `${item.overfitted ? '   ← 开发集涨、保留集掉，过拟合' : ''}\n`,
    );
  }
  process.stdout.write(
    `\n保留集 F1 改善 ${improved}/${models.length}，退步 ${regressed}/${models.length}\n` +
      `结果：${outputPath}\n`,
  );
}

main();
