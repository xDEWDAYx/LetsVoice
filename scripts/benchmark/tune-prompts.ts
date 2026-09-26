/**
 * 逐模型提示词调优。
 *
 * 目的：消除横向扫描第一轮最大的局限 —— 所有模型共用一套为 `qwen2.5` 调过的
 * 提示词，导致「模型能力差」和「模型不适应这套提示词」分不开。
 *
 * **纪律（这个脚本的存在意义）**：
 *  1. 调优**只在开发集**（22 条）上跑，命令行写死 `--split dev`，无法绕过；
 *  2. 保留集（32 条）全程不被读取，选完变体后才用它做一次性验收；
 *  3. 选择依据写进结果文件，报告里可以逐条复核「为什么给这个模型选了这个变体」。
 *
 * 选择准则不是单看 F1。待办应用里凭空造任务比漏掉更糟，所以用一个组合分：
 *   score = F1 − 0.5 × 零任务假阳性率
 * 系数 0.5 是主观的，但它被明确写出来了，而不是藏在「综合表现最好」这种话里。
 *
 *   npm run bench:tune
 *   npm run bench:tune -- --models qwen2.5:1.5b-instruct
 *   npm run bench:tune -- --variants baseline,strict-empty
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { PROMPT_VARIANTS } from './model-prompt-profiles';
import { benchmarkResultsRoot, PROJECT_ROOT } from './tts-paths';

type Json = Record<string, any>;

const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const RESULTS = benchmarkResultsRoot();
/** 假阳性的惩罚系数。写在这里而不是藏在措辞里，报告可以直接引用。 */
const FALSE_POSITIVE_PENALTY = 0.5;

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeName(model: string): string {
  return model.replace(/[^\w.-]+/g, '_');
}

function listInstalled(): Promise<Json[]> {
  return new Promise((resolve, reject) => {
    http
      .get(`${HOST}/api/tags`, (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          try {
            resolve((JSON.parse(raw) as { models?: Json[] }).models ?? []);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function runDev(model: string, variantId: string, rounds: string): boolean {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npm,
    [
      'run',
      'bench:todo',
      '--',
      '--model',
      model,
      '--prompt-variant',
      variantId,
      // 写死 dev：调优绝不允许看保留集
      '--split',
      'dev',
      '--rounds',
      rounds,
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    },
  );
  return result.status === 0;
}

function readDevResult(model: string, variantId: string): Json | null {
  const suffix = variantId === 'baseline' ? '' : `--${variantId}`;
  const file = path.join(
    RESULTS,
    // 调优跑的是 --split dev，文件名带 --dev 后缀
    `todo-extraction-eval-${safeName(model)}${suffix}--dev.json`,
  );
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
}

async function main(): Promise<void> {
  const requested = flagValue('--models');
  const variantFilter = flagValue('--variants');
  const rounds = flagValue('--rounds') ?? '1';

  const installed = await listInstalled();
  const models = (
    requested
      ? requested.split(',').map((name) => name.trim())
      : installed
          .map((item) => String(item.name))
          .filter((name) => !/bge|embed/i.test(name))
  ).filter(Boolean);
  const variants = variantFilter
    ? PROMPT_VARIANTS.filter((item) =>
        variantFilter
          .split(',')
          .map((value) => value.trim())
          .includes(item.id),
      )
    : PROMPT_VARIANTS;
  if (models.length === 0 || variants.length === 0) {
    throw new Error('没有可调优的模型或变体');
  }

  process.stdout.write(
    `逐模型提示词调优\n` +
      `模型 ${models.length} 个 × 变体 ${variants.length} 个 × ${rounds} 轮\n` +
      `**只在开发集 22 条上跑，保留集全程冻结**\n` +
      `选择准则：F1 − ${FALSE_POSITIVE_PENALTY} × 零任务假阳性率\n\n`,
  );

  const perModel: Json[] = [];
  const chosen: Record<string, string> = {};

  for (const model of models) {
    process.stdout.write(`=== ${model} ===\n`);
    const trials: Json[] = [];
    for (const variant of variants) {
      const ok = runDev(model, variant.id, rounds);
      const result = ok ? readDevResult(model, variant.id) : null;
      if (!result) {
        process.stdout.write(`  ${variant.id.padEnd(24)} 运行失败\n`);
        trials.push({ variant: variant.id, error: '运行失败' });
        continue;
      }
      const dev = result.mean_across_rounds.dev as Json;
      const overall = result.mean_across_rounds.overall as Json;
      const f1 = Number(dev.f1 ?? 0);
      const falsePositive = Number(overall.zero_task_false_positive_rate ?? 0);
      const score = f1 - FALSE_POSITIVE_PENALTY * falsePositive;
      trials.push({
        variant: variant.id,
        describe: variant.describe,
        dev_f1: f1,
        dev_precision: dev.precision,
        dev_recall: dev.recall,
        dev_case_pass_rate: dev.case_pass_rate,
        date_accuracy: overall.date_accuracy,
        zero_task_false_positive_rate: falsePositive,
        parse_failure_rate: overall.parse_failure_rate,
        score,
      });
      process.stdout.write(
        `  ${variant.id.padEnd(24)} F1 ${(f1 * 100).toFixed(1)}%  ` +
          `假阳性 ${(falsePositive * 100).toFixed(1)}%  ` +
          `解析失败 ${(Number(overall.parse_failure_rate ?? 0) * 100).toFixed(1)}%  ` +
          `→ 分数 ${score.toFixed(4)}\n`,
      );
    }

    const scored = trials.filter((item) => item.score !== undefined);
    if (scored.length === 0) {
      process.stdout.write('  全部失败，回落 baseline\n\n');
      chosen[model] = 'baseline';
      perModel.push({
        model,
        trials,
        chosen: 'baseline',
        reason: '全部变体运行失败',
      });
      continue;
    }
    const best = scored.reduce((a, b) =>
      Number(b.score) > Number(a.score) ? b : a,
    );
    const baseline = scored.find((item) => item.variant === 'baseline');
    // 分数没有实质提升就留在 baseline：避免为了 0.1 个百分点引入额外规则
    const improvement =
      baseline === undefined
        ? Number.POSITIVE_INFINITY
        : Number(best.score) - Number(baseline.score);
    const keep = improvement > 0.01 ? String(best.variant) : 'baseline';
    chosen[model] = keep;
    perModel.push({
      model,
      trials,
      chosen: keep,
      baseline_score: baseline?.score ?? null,
      best_score: best.score,
      improvement,
      reason:
        keep === 'baseline'
          ? '最佳变体相对 baseline 提升不足 0.01，保持不变'
          : `相对 baseline 提升 ${improvement.toFixed(4)}`,
    });
    process.stdout.write(
      `  → 选定 ${keep}（${keep === 'baseline' ? '提升不足，保持原样' : `提升 ${improvement.toFixed(4)}`}）\n\n`,
    );
  }

  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    tuned_on: 'dev split only (22 cases)；保留集 32 条在调优期间未被读取',
    rounds: Number(rounds),
    selection_rule: `score = dev F1 − ${FALSE_POSITIVE_PENALTY} × zero_task_false_positive_rate；相对 baseline 提升需大于 0.01 才采纳`,
    variants: PROMPT_VARIANTS.map((item) => ({
      id: item.id,
      describe: item.describe,
      targets: item.targets,
    })),
    chosen,
    per_model: perModel,
  };
  fs.mkdirSync(RESULTS, { recursive: true });
  const outputPath = path.join(RESULTS, 'prompt-profiles.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  process.stdout.write('===== 选定结果 =====\n');
  for (const [model, variant] of Object.entries(chosen)) {
    process.stdout.write(`  ${model.padEnd(36)} ${variant}\n`);
  }
  process.stdout.write(
    `\n档案：${outputPath}\n` +
      '接下来用 `npm run bench:sweep -- --use-profile --with-agent` 在保留集上做一次性验收。\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
