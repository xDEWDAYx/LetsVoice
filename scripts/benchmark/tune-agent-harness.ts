/**
 * Agent 外层脚手架的消融实验。
 *
 * 纪律与前两轮完全一致：组合只在**开发集 8 个任务**上选择，
 * `--split dev` 写死在命令里；保留集 20 个任务选定后才用于一次性验收。
 *
 * 注意开发集只有 8 条，比待办那边的 22 条更小，过拟合风险更高。
 * 所以这里的采纳门槛定得更严（相对 off 提升需大于 0.10），
 * 并且报告里必须同时给出保留集结果 —— 开发集单独说明不了任何问题。
 *
 *   npm run bench:agent:harness
 *   npm run bench:agent:harness -- --models qwen2.5:3b-instruct
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { describeAgentHarness, parseAgentHarness } from './agent-harness';
import { benchmarkResultsRoot, PROJECT_ROOT } from './tts-paths';

type Json = Record<string, any>;

const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const RESULTS = benchmarkResultsRoot();
/** 开发集只有 8 条，一条就是 12.5 个百分点，门槛必须比待办那轮严。 */
const MIN_IMPROVEMENT = 0.1;

/** 从便宜到贵。预载要多两次工具调用，路由和核查各多一次模型调用。 */
const COMBOS = [
  'off',
  'router',
  'preload2',
  'preload2,evidence',
  'preload2,router',
  'preload2,router,evidence',
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

function runDev(model: string, harness: string): boolean {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = [
    'run',
    'bench:agent',
    '--',
    '--model',
    model,
    '--split',
    'dev',
    '--rounds',
    '1',
    // 消融阶段关掉 Judge：它未经人类校准，不能用来做选择，
    // 而且每个任务多一次调用会让这一轮慢一倍。
    '--no-judge',
  ];
  if (harness !== 'off') args.push('--harness', harness);
  const result = spawnSync(npm, args, {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function readDev(model: string, harness: string): Json | null {
  const harnessPart = harness === 'off' ? '' : `--h_${safeName(harness)}`;
  const file = path.join(
    RESULTS,
    `agent-eval-${safeName(model)}${harnessPart}--dev.json`,
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
    `Agent 脚手架消融\n模型 ${models.length} 个 × 组合 ${COMBOS.length} 个\n` +
      '**只在开发集 8 个任务上跑，保留集 20 个全程冻结**\n' +
      `采纳门槛：相对 off 的严格完成率提升需大于 ${MIN_IMPROVEMENT}\n\n`,
  );

  const perModel: Json[] = [];
  const chosen: Record<string, string> = {};

  for (const model of models) {
    process.stdout.write(`=== ${model} ===\n`);
    const trials: Json[] = [];
    for (const harness of COMBOS) {
      const ok = runDev(model, harness);
      const result = ok ? readDev(model, harness) : null;
      if (!result) {
        process.stdout.write(`  ${harness.padEnd(26)} 运行失败\n`);
        continue;
      }
      const overall = result.mean_across_rounds.overall as Json;
      trials.push({
        harness,
        describe: describeAgentHarness(parseAgentHarness(harness)),
        case_pass_rate: overall.case_pass_rate,
        fact_coverage: overall.fact_coverage,
        answer_mode_accuracy: overall.answer_mode_accuracy,
        mean_tool_calls: overall.mean_tool_calls,
        scope_violation_rate: overall.scope_violation_rate,
        elapsed_ms: result.rounds?.[0]?.elapsed_ms ?? null,
      });
      process.stdout.write(
        `  ${harness.padEnd(26)} 通过 ${(Number(overall.case_pass_rate) * 100).toFixed(1)}%  ` +
          `事实 ${(Number(overall.fact_coverage) * 100).toFixed(1)}%  ` +
          `模式 ${(Number(overall.answer_mode_accuracy) * 100).toFixed(1)}%  ` +
          `工具 ${Number(overall.mean_tool_calls).toFixed(2)}  ` +
          `耗时 ${(Number(result.rounds?.[0]?.elapsed_ms ?? 0) / 1000).toFixed(0)}s\n`,
      );
    }

    if (trials.length === 0) {
      chosen[model] = 'off';
      perModel.push({ model, trials, chosen: 'off' });
      continue;
    }
    const best = trials.reduce((a, b) =>
      Number(b.case_pass_rate) > Number(a.case_pass_rate) ? b : a,
    );
    const off = trials.find((item) => item.harness === 'off');
    const improvement =
      off === undefined
        ? Number.POSITIVE_INFINITY
        : Number(best.case_pass_rate) - Number(off.case_pass_rate);
    const keep = improvement > MIN_IMPROVEMENT ? String(best.harness) : 'off';
    chosen[model] = keep;
    perModel.push({
      model,
      trials,
      chosen: keep,
      off_pass_rate: off?.case_pass_rate ?? null,
      best_pass_rate: best.case_pass_rate,
      improvement,
      reason:
        keep === 'off'
          ? `最佳组合相对 off 提升 ${improvement.toFixed(3)}，未达门槛 ${MIN_IMPROVEMENT}`
          : `相对 off 提升 ${improvement.toFixed(3)}`,
    });
    process.stdout.write(
      `  → 选定 ${keep}（${keep === 'off' ? '提升不足' : `提升 ${improvement.toFixed(3)}`}）\n\n`,
    );
  }

  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    tuned_on: 'dev split only (8 tasks)；保留集 20 个任务在消融期间未被读取',
    caveat:
      '开发集仅 8 条，一条任务即 12.5 个百分点；这里的选择噪声很大，必须以保留集结果为准',
    selection_rule: `严格完成率最高者；相对 off 提升需大于 ${MIN_IMPROVEMENT} 才采纳`,
    combos: COMBOS,
    chosen,
    per_model: perModel,
  };
  fs.mkdirSync(RESULTS, { recursive: true });
  const outputPath = path.join(RESULTS, 'agent-harness-profiles.json');
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
