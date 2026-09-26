/**
 * 外层脚手架（harness）的消融实验。
 *
 * 提示词调优那一轮的结论是：改提示词文字只救回一个模型。剩下的失败模式是结构性的，
 * 需要换层级去治。这个脚本把四种手段单独和组合地跑一遍，**逐项归因** ——
 * 不能一锅端说「加了一堆东西之后变好了」，那样既不知道哪项有用，
 * 也不知道代价（门控多一次调用，投票多两次）花得值不值。
 *
 * **纪律与提示词调优完全一致**：组合的选择只在开发集 22 条上做，
 * `--split dev` 写死在命令里；保留集 32 条选定后才用于一次性验收。
 *
 *   npm run bench:harness
 *   npm run bench:harness -- --models qwen2.5:1.5b-instruct,phi4-mini:latest
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { describeHarness, parseHarness } from './extraction-harness';
import { benchmarkResultsRoot, PROJECT_ROOT } from './tts-paths';

type Json = Record<string, any>;

const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const RESULTS = benchmarkResultsRoot();
const FALSE_POSITIVE_PENALTY = 0.5;

/**
 * 组合按「从便宜到贵」排列。
 * 每次调用都要花时间和显存，所以能用一次调用解决就不要用三次 ——
 * 报告里必须能说清楚多花的代价换回了多少。
 */
const COMBOS = [
  'off',
  'dedup',
  'date',
  'date,dedup',
  'gate',
  'gate2',
  'gate2,date,dedup',
  'gate,date,dedup',
  'vote3',
  'gate,vote3,date,dedup',
];

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeName(value: string): string {
  return value.replace(/[^\w.-]+/g, '_');
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

function chosenVariant(model: string): string {
  const file = path.join(RESULTS, 'prompt-profiles.json');
  if (!fs.existsSync(file)) return 'baseline';
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    chosen?: Record<string, string>;
  };
  return data.chosen?.[model] ?? 'baseline';
}

function runDev(model: string, variant: string, harness: string): boolean {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = [
    'run',
    'bench:todo',
    '--',
    '--model',
    model,
    '--prompt-variant',
    variant,
    '--split',
    'dev',
    '--rounds',
    '1',
  ];
  if (harness !== 'off') args.push('--harness', harness);
  const result = spawnSync(npm, args, {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function readDev(model: string, variant: string, harness: string): Json | null {
  const variantPart = variant === 'baseline' ? '' : `--${variant}`;
  const harnessPart = harness === 'off' ? '' : `--h_${safeName(harness)}`;
  const file = path.join(
    RESULTS,
    `todo-extraction-eval-${safeName(model)}${variantPart}${harnessPart}--dev.json`,
  );
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Json;
}

async function main(): Promise<void> {
  const requested = flagValue('--models');
  const installed = await listInstalled();
  const models = (
    requested
      ? requested.split(',').map((name) => name.trim())
      : installed
          .map((item) => String(item.name))
          .filter((name) => !/bge|embed/i.test(name))
  ).filter(Boolean);
  if (models.length === 0) throw new Error('没有可测的模型');

  process.stdout.write(
    `外层脚手架消融\n模型 ${models.length} 个 × 组合 ${COMBOS.length} 个\n` +
      `**只在开发集 22 条上跑，保留集全程冻结**\n` +
      `选择准则：F1 − ${FALSE_POSITIVE_PENALTY} × 零任务假阳性率\n\n`,
  );

  const perModel: Json[] = [];
  const chosen: Record<string, string> = {};

  for (const model of models) {
    const variant = chosenVariant(model);
    process.stdout.write(`=== ${model}（提示词变体 ${variant}）===\n`);
    const trials: Json[] = [];
    for (const harness of COMBOS) {
      const ok = runDev(model, variant, harness);
      const result = ok ? readDev(model, variant, harness) : null;
      if (!result) {
        process.stdout.write(`  ${harness.padEnd(24)} 运行失败\n`);
        continue;
      }
      const dev = result.mean_across_rounds.dev as Json;
      const overall = result.mean_across_rounds.overall as Json;
      const f1 = Number(dev.f1 ?? 0);
      const falsePositive = Number(overall.zero_task_false_positive_rate ?? 0);
      const score = f1 - FALSE_POSITIVE_PENALTY * falsePositive;
      trials.push({
        harness,
        describe: describeHarness(parseHarness(harness)),
        dev_f1: f1,
        dev_precision: dev.precision,
        dev_recall: dev.recall,
        dev_case_pass_rate: dev.case_pass_rate,
        date_accuracy: overall.date_accuracy,
        zero_task_false_positive_rate: falsePositive,
        elapsed_ms: result.rounds?.[0]?.elapsed_ms ?? null,
        score,
      });
      process.stdout.write(
        `  ${harness.padEnd(24)} F1 ${(f1 * 100).toFixed(1)}%  ` +
          `P ${(Number(dev.precision ?? 0) * 100).toFixed(1)}%  ` +
          `假阳性 ${(falsePositive * 100).toFixed(1)}%  ` +
          `日期 ${(Number(overall.date_accuracy ?? 0) * 100).toFixed(1)}%  ` +
          `耗时 ${(Number(result.rounds?.[0]?.elapsed_ms ?? 0) / 1000).toFixed(0)}s  ` +
          `→ ${score.toFixed(4)}\n`,
      );
    }

    if (trials.length === 0) {
      chosen[model] = 'off';
      perModel.push({ model, variant, trials, chosen: 'off' });
      continue;
    }
    const best = trials.reduce((a, b) =>
      Number(b.score) > Number(a.score) ? b : a,
    );
    const off = trials.find((item) => item.harness === 'off');
    const improvement =
      off === undefined
        ? Number.POSITIVE_INFINITY
        : Number(best.score) - Number(off.score);
    // 脚手架都有额外调用成本，提升不明显就不值得开
    const keep = improvement > 0.02 ? String(best.harness) : 'off';
    chosen[model] = keep;
    perModel.push({
      model,
      variant,
      trials,
      chosen: keep,
      off_score: off?.score ?? null,
      best_score: best.score,
      improvement,
      reason:
        keep === 'off'
          ? '最佳组合相对不开脚手架提升不足 0.02，不值得多花调用'
          : `相对不开脚手架提升 ${improvement.toFixed(4)}`,
    });
    process.stdout.write(
      `  → 选定 ${keep}（${keep === 'off' ? '提升不足' : `提升 ${improvement.toFixed(4)}`}）\n\n`,
    );
  }

  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    tuned_on: 'dev split only (22 cases)；保留集 32 条在消融期间未被读取',
    selection_rule: `score = dev F1 − ${FALSE_POSITIVE_PENALTY} × zero_task_false_positive_rate；相对 off 提升需大于 0.02 才采纳（脚手架有额外调用成本）`,
    combos: COMBOS,
    chosen,
    per_model: perModel,
  };
  fs.mkdirSync(RESULTS, { recursive: true });
  const outputPath = path.join(RESULTS, 'harness-profiles.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write('===== 选定结果 =====\n');
  for (const [model, harness] of Object.entries(chosen)) {
    process.stdout.write(`  ${model.padEnd(36)} ${harness}\n`);
  }
  process.stdout.write(`\n档案：${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
