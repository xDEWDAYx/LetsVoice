/**
 * 本地 LLM 横向扫描：把准确率、推理速度与硬件占用合到一张表上。
 *
 * 对本地优先的产品来说，选型不是「哪个模型最准」，而是
 * **「多小的模型还够用」** —— 这需要两根轴：
 *   纵轴 准确率  由 bench:todo 在同一套 54 条语料上给出（语料与判定完全不变，holdout 仍有效）
 *   横轴 代价    由 bench:llm 给出 tokens/s、首 token 延迟、显存、GPU 卸载比例
 * 两者合起来才能画出速度-精度帕累托曲线，找到拐点。
 *
 * 关键约束：**逐个模型串行跑，中间不做别的事**。速度和显存是时间敏感量，
 * 并行会直接让数据作废（TTS 那轮实测过：并行一次 tsc 让 RTF 从 0.79 掉到 4.4）。
 *
 *   npm run bench:sweep                       # 扫描本机全部指令模型
 *   npm run bench:sweep -- --models a,b,c
 *   npm run bench:sweep -- --skip-todo        # 只测速度与显存
 *   npm run bench:sweep -- --with-agent       # 额外跑 Agent 端到端（每个模型多花 15-20 分钟）
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { benchmarkResultsRoot, PROJECT_ROOT } from './tts-paths';

type Json = Record<string, any>;

const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const RESULTS = benchmarkResultsRoot();

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

/** 跑一个 npm script 并等它结束。串行是刻意的，见文件头注释。 */
function run(script: string, args: string[]): boolean {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  process.stdout.write(`\n  $ npm run ${script} -- ${args.join(' ')}\n`);
  const result = spawnSync(npm, ['run', script, '--', ...args], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

async function main(): Promise<void> {
  const requested = flagValue('--models');
  const skipTodo = process.argv.includes('--skip-todo');
  const withAgent = process.argv.includes('--with-agent');
  const useProfile = process.argv.includes('--use-profile');
  const rounds = flagValue('--rounds') ?? '3';

  const installed = await listInstalled();
  const embeddingLike = /bge|embed/i;
  const models = (
    requested
      ? requested.split(',').map((name) => name.trim())
      : installed
          .map((item) => String(item.name))
          .filter((name) => !embeddingLike.test(name))
  ).filter(Boolean);
  if (models.length === 0) throw new Error('没有可扫描的模型');

  process.stdout.write(
    `横向扫描 ${models.length} 个模型：${models.join('、')}\n` +
      `准确率 ${skipTodo ? '跳过' : `bench:todo，${rounds} 轮`}` +
      ` · 速度与显存 bench:llm · Agent ${withAgent ? '要跑' : '跳过'}\n` +
      '整个过程串行，请不要同时做别的事。\n',
  );

  const failures: string[] = [];

  /*
   * 速度与显存必须一次性跑完全部模型，而且放在最前面：
   *  - bench:llm 每次运行都会重写 llm-runtime.json，逐个模型调用只会留下最后一个；
   *  - 它是唯一时间敏感的一步，必须独占机器，不能和准确率评测穿插。
   */
  process.stdout.write(
    '\n========== 速度 / 显存 / GPU（独占运行）==========\n',
  );
  if (!run('bench:llm', ['--models', models.join(',')])) {
    failures.push('bench:llm');
  }

  // 准确率评测对并发不敏感（用例彼此独立），放在速度测量之后
  for (const model of models) {
    process.stdout.write(`\n========== ${model} 准确率 ==========\n`);
    if (
      !skipTodo &&
      !run('bench:todo', [
        '--model',
        model,
        '--rounds',
        rounds,
        ...(useProfile ? ['--use-profile'] : []),
      ])
    ) {
      failures.push(`${model}: bench:todo`);
    }
    if (withAgent && !run('bench:agent', ['--model', model])) {
      failures.push(`${model}: bench:agent`);
    }
  }

  // 汇总：把每个模型散落的结果文件合成一份，供出图和报告使用
  const runtime = fs.existsSync(path.join(RESULTS, 'llm-runtime.json'))
    ? (JSON.parse(
        fs.readFileSync(path.join(RESULTS, 'llm-runtime.json'), 'utf8'),
      ) as Json)
    : null;

  const combined = models.map((model) => {
    const todoPath = path.join(
      RESULTS,
      `todo-extraction-eval-${safeName(model)}.json`,
    );
    const todo = fs.existsSync(todoPath)
      ? (JSON.parse(fs.readFileSync(todoPath, 'utf8')) as Json)
      : null;
    const speed =
      (runtime?.models as Json[] | undefined)?.find(
        (item) => item.model === model,
      ) ?? null;
    const agentPath = path.join(RESULTS, `agent-eval-${safeName(model)}.json`);
    const agent = fs.existsSync(agentPath)
      ? (JSON.parse(fs.readFileSync(agentPath, 'utf8')) as Json)
      : null;
    const installedEntry = installed.find((item) => item.name === model);
    return {
      model,
      parameter_size: installedEntry?.details?.parameter_size ?? null,
      quantization: installedEntry?.details?.quantization_level ?? null,
      disk_size_bytes: installedEntry?.size ?? null,
      accuracy: todo
        ? {
            holdout_case_pass_rate:
              todo.mean_across_rounds.holdout.case_pass_rate,
            holdout_precision: todo.mean_across_rounds.holdout.precision,
            holdout_recall: todo.mean_across_rounds.holdout.recall,
            holdout_f1: todo.mean_across_rounds.holdout.f1,
            overall_f1: todo.mean_across_rounds.overall.f1,
            date_accuracy: todo.mean_across_rounds.overall.date_accuracy,
            zero_task_false_positive_rate:
              todo.mean_across_rounds.overall.zero_task_false_positive_rate,
            parse_failure_rate:
              todo.mean_across_rounds.overall.parse_failure_rate,
          }
        : null,
      runtime: speed
        ? {
            median_tokens_per_second: speed.median_tokens_per_second,
            median_first_token_latency_ms: speed.median_first_token_latency_ms,
            gpu_offload_ratio: speed.gpu_offload_ratio,
            resident_vram_bytes: speed.resident_vram_bytes,
            peak_gpu_memory_mib: speed.peak_gpu_memory_mib,
          }
        : null,
      agent: agent
        ? {
            task_count: agent.dataset?.task_count ?? null,
            rounds_run: agent.rounds_run ?? null,
            case_pass_rate: agent.mean_across_rounds.overall.case_pass_rate,
            holdout_case_pass_rate:
              agent.mean_across_rounds.holdout?.case_pass_rate ?? null,
            fact_coverage: agent.mean_across_rounds.overall.fact_coverage,
            answer_mode_accuracy:
              agent.mean_across_rounds.overall.answer_mode_accuracy,
            recall_at_8: agent.mean_across_rounds.overall.recall_at_8,
            mean_tool_calls: agent.mean_across_rounds.overall.mean_tool_calls,
            mean_model_turns: agent.mean_across_rounds.overall.mean_model_turns,
            scope_violation_rate:
              agent.mean_across_rounds.overall.scope_violation_rate,
          }
        : null,
    };
  });

  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    gpu: runtime?.gpu ?? null,
    platform: runtime?.platform ?? null,
    rounds: Number(rounds),
    corpus:
      '与 bench:todo 相同的 54 条用例（dev 22 / holdout 32），语料与判定未改动',
    models: combined,
  };
  fs.mkdirSync(RESULTS, { recursive: true });
  const outputPath = path.join(RESULTS, 'llm-sweep.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  process.stdout.write('\n===== 扫描汇总 =====\n');
  for (const item of combined) {
    process.stdout.write(
      `  ${item.model.padEnd(24)} ` +
        `holdout F1 ${item.accuracy ? `${(item.accuracy.holdout_f1 * 100).toFixed(1)}%` : 'n/a'}  ` +
        `${item.runtime?.median_tokens_per_second?.toFixed(1) ?? 'n/a'} tok/s  ` +
        `GPU ${item.runtime ? `${((item.runtime.gpu_offload_ratio ?? 0) * 100).toFixed(0)}%` : 'n/a'}\n`,
    );
  }
  process.stdout.write(`\n结果：${outputPath}\n`);
  if (failures.length > 0) {
    process.stdout.write(`\n以下步骤失败：\n${failures.join('\n')}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
