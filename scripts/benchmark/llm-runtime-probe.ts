/**
 * 本地 LLM 的推理速度与硬件占用。
 *
 * 准确率评测（bench:todo / bench:agent）只回答「答得对不对」，回答不了
 * 「多小的模型还够用」——那需要另一根轴：吞吐、延迟、显存、以及**到底有没有跑在 GPU 上**。
 * 对一个本地优先的产品来说，后者往往才是选型的硬约束。
 *
 * 数据来源分三路，互相印证：
 *  1. Ollama `/api/generate` 的计时字段（load_duration / prompt_eval_* / eval_*）——
 *     这是引擎自己报的，最准，不受采样间隔影响。
 *  2. Ollama `/api/ps` 的 `size` 与 `size_vram`——两者之比就是 GPU 卸载比例，
 *     直接回答「这个模型有没有真的用上 CUDA」。6 GiB 显存放不下的模型会部分回落到 CPU。
 *  3. `nvidia-smi` 采样——真实显存占用与 GPU 利用率，用来验证第 2 路的自报数据。
 *
 *   npm run bench:llm
 *   npm run bench:llm -- --models qwen2.5:0.5b-instruct,qwen2.5:7b-instruct
 *   npm run bench:llm -- --repeats 5
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { benchmarkResultsRoot } from './tts-paths';

type Json = Record<string, any>;

const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const REPEATS = Number(flagValue('--repeats') ?? 3);

/**
 * 探针提示词。刻意用与待办提取同量级的长度，
 * 让吞吐数字对得上真实使用场景，而不是用一句「你好」测出漂亮的空转速度。
 */
const PROBES = [
  {
    id: 'short',
    prompt: '用一句话说明什么是本地优先（local-first）软件。',
    maxTokens: 128,
  },
  {
    id: 'medium',
    prompt:
      '下面是一段会议记录，请提取其中的待办事项，用 JSON 数组输出，每项包含 title 和 dueDate：\n' +
      '“这周的安排我说一下。周五之前把季度报表发给财务那边，下周一要交差旅报销的单子，' +
      '然后八月三十一号之前必须把服务器的续费办完，不然要停机。另外新人的入职材料这个月底前整理好。”',
    maxTokens: 384,
  },
  {
    id: 'long',
    prompt:
      '请阅读下面这段较长的项目周会记录，先用三句话总结，再列出所有待办事项：\n' +
      '“这次评审我先把背景交代一下。上半年我们把语音笔记的转写链路整个重写了一遍，主要解决三个问题：' +
      '一是长录音的内存占用过高，二是中英混合场景下的断句不稳定，三是任务提取会把别人的事情算到用户头上。' +
      '重写之后，转写的峰值内存下降了大约四成，断句错误明显减少，任务归属也加了一道复核。' +
      '下半年的重点会转到检索这一侧，我们打算把关键词检索和向量检索合并成一路混合召回，再用倒数排名融合来排序。' +
      '这块的难点不在算法本身，而在于本地设备的算力有限，嵌入模型必须足够小，同时又不能牺牲中文的召回质量。' +
      '另外还有一个容易被忽略的问题，就是用户的笔记数量增长以后，全库检索的延迟会明显上升，' +
      '所以我们需要提前设计增量索引和缓存策略。行动项方面：我周五之前把埋点方案文档发出去，' +
      '小张下周一给出检索延迟的压测报告，采购那边八月二十八号之前提交服务器报价单。”',
    maxTokens: 768,
  },
];

type OllamaGenerateResponse = {
  response?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

function request(
  method: 'GET' | 'POST',
  urlText: string,
  body?: string,
  timeoutMs = 300000,
): Promise<string> {
  const url = new URL(urlText);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        timeout: timeoutMs,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            }
          : {},
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => resolve(raw));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Ollama 请求超时')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** nvidia-smi 快照。没有 N 卡或驱动缺失时返回 null，不让整轮失败。 */
function gpuSnapshot(): {
  memory_used_mib: number;
  memory_total_mib: number;
  utilisation_percent: number;
} | null {
  const result = spawnSync(
    'nvidia-smi',
    [
      '--query-gpu=memory.used,memory.total,utilization.gpu',
      '--format=csv,noheader,nounits',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0 || !result.stdout) return null;
  const [used, total, utilisation] = result.stdout
    .trim()
    .split('\n')[0]
    .split(',')
    .map((value) => Number(value.trim()));
  if (!Number.isFinite(used)) return null;
  return {
    memory_used_mib: used,
    memory_total_mib: total,
    utilisation_percent: utilisation,
  };
}

/**
 * Ollama 自己报告的驻留情况。
 * `size_vram / size` 就是 GPU 卸载比例：1 表示整个模型都在显存里，
 * 0 表示纯 CPU 推理，介于两者之间说明显存放不下、部分层回落到了 CPU。
 */
async function residency(model: string): Promise<{
  size_bytes: number;
  size_vram_bytes: number;
  gpu_offload_ratio: number;
} | null> {
  try {
    const raw = await request('GET', `${HOST}/api/ps`, undefined, 10000);
    const data = JSON.parse(raw) as {
      models?: { name: string; size: number; size_vram: number }[];
    };
    const entry = data.models?.find(
      (item) => item.name === model || item.name.startsWith(model),
    );
    if (!entry) return null;
    return {
      size_bytes: entry.size,
      size_vram_bytes: entry.size_vram,
      gpu_offload_ratio: entry.size > 0 ? entry.size_vram / entry.size : 0,
    };
  } catch {
    return null;
  }
}

async function listModels(): Promise<
  { name: string; size: number; details?: Record<string, unknown> }[]
> {
  const raw = await request('GET', `${HOST}/api/tags`, undefined, 10000);
  return (
    (
      JSON.parse(raw) as {
        models?: {
          name: string;
          size: number;
          details?: Record<string, unknown>;
        }[];
      }
    ).models ?? []
  );
}

async function probeModel(model: string): Promise<Json> {
  process.stdout.write(`\n=== ${model} ===\n`);
  const runs: Json[] = [];

  for (const probe of PROBES) {
    for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
      const gpuBefore = gpuSnapshot();
      const started = Date.now();
      const raw = await request(
        'POST',
        `${HOST}/api/generate`,
        JSON.stringify({
          model,
          prompt: probe.prompt,
          stream: false,
          options: { temperature: 0.1, num_predict: probe.maxTokens },
        }),
      );
      const wallMs = Date.now() - started;
      const data = JSON.parse(raw) as OllamaGenerateResponse;
      // 生成刚结束时采样，此时模型一定还驻留着
      const gpuDuring = gpuSnapshot();
      const resident = await residency(model);

      const nanosToMs = (value: number | undefined) =>
        value === undefined ? null : value / 1e6;
      const evalMs = nanosToMs(data.eval_duration);
      const promptMs = nanosToMs(data.prompt_eval_duration);
      runs.push({
        probe: probe.id,
        repeat,
        wall_ms: wallMs,
        // Ollama 自报的分段耗时，比外部计时更能区分「加载」「读提示词」「生成」
        load_ms: nanosToMs(data.load_duration),
        prompt_tokens: data.prompt_eval_count ?? null,
        prompt_eval_ms: promptMs,
        // 首 token 延迟的近似：加载 + 读完提示词
        first_token_latency_ms:
          (nanosToMs(data.load_duration) ?? 0) + (promptMs ?? 0),
        output_tokens: data.eval_count ?? null,
        eval_ms: evalMs,
        tokens_per_second:
          data.eval_count && evalMs ? data.eval_count / (evalMs / 1000) : null,
        prompt_tokens_per_second:
          data.prompt_eval_count && promptMs
            ? data.prompt_eval_count / (promptMs / 1000)
            : null,
        gpu_before: gpuBefore,
        gpu_during: gpuDuring,
        residency: resident,
      });
      process.stdout.write(
        `  ${probe.id.padEnd(7)} #${repeat}  ` +
          `${(runs[runs.length - 1].tokens_per_second ?? 0).toFixed(1)} tok/s  ` +
          `首token ${(runs[runs.length - 1].first_token_latency_ms ?? 0).toFixed(0)} ms  ` +
          `GPU卸载 ${((resident?.gpu_offload_ratio ?? 0) * 100).toFixed(0)}%  ` +
          `显存 ${gpuDuring?.memory_used_mib ?? '?'} MiB\n`,
      );
    }
  }

  const median = (values: number[]): number | null => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const byProbe: Json = {};
  for (const probe of PROBES) {
    const subset = runs.filter((run) => run.probe === probe.id);
    byProbe[probe.id] = {
      median_tokens_per_second: median(
        subset.map((run) => Number(run.tokens_per_second)),
      ),
      median_first_token_latency_ms: median(
        subset.map((run) => Number(run.first_token_latency_ms)),
      ),
      median_wall_ms: median(subset.map((run) => Number(run.wall_ms))),
      median_output_tokens: median(
        subset.map((run) => Number(run.output_tokens)),
      ),
    };
  }

  const lastResidency = runs
    .map((run) => run.residency)
    .filter(Boolean)
    .pop() as Json | undefined;
  const peakGpuMemory = Math.max(
    0,
    ...runs
      .map((run) => Number((run.gpu_during as Json)?.memory_used_mib ?? 0))
      .filter(Number.isFinite),
  );

  return {
    model,
    repeats: REPEATS,
    median_tokens_per_second: median(
      runs.map((run) => Number(run.tokens_per_second)),
    ),
    median_prompt_tokens_per_second: median(
      runs.map((run) => Number(run.prompt_tokens_per_second)),
    ),
    median_first_token_latency_ms: median(
      runs.map((run) => Number(run.first_token_latency_ms)),
    ),
    resident_size_bytes: lastResidency?.size_bytes ?? null,
    resident_vram_bytes: lastResidency?.size_vram_bytes ?? null,
    gpu_offload_ratio: lastResidency?.gpu_offload_ratio ?? null,
    peak_gpu_memory_mib: peakGpuMemory || null,
    by_probe: byProbe,
    runs,
  };
}

async function main(): Promise<void> {
  const requested = flagValue('--models');
  const installed = await listModels();
  const embeddingLike = /bge|embed/i;
  const targets = (
    requested
      ? requested.split(',').map((name) => name.trim())
      : installed
          .map((item) => item.name)
          .filter((name) => !embeddingLike.test(name))
  ).filter(Boolean);
  if (targets.length === 0) throw new Error('没有可测的模型');

  const gpu = gpuSnapshot();
  process.stdout.write(
    `待测模型 ${targets.length} 个：${targets.join('、')}\n` +
      `GPU：${gpu ? `${gpu.memory_total_mib} MiB 显存` : '未检测到 nvidia-smi'}\n` +
      `每个模型 ${PROBES.length} 种长度 × ${REPEATS} 次\n`,
  );

  const results: Json[] = [];
  for (const model of targets) {
    try {
      results.push(await probeModel(model));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`  失败：${message}\n`);
      results.push({ model, error: message });
    }
    // 卸载当前模型，下一个模型才能拿到干净的显存
    try {
      await request(
        'POST',
        `${HOST}/api/generate`,
        JSON.stringify({ model, keep_alive: 0 }),
        30000,
      );
    } catch {
      /* 卸载失败不影响结果，只是下一个模型的显存基线会偏高 */
    }
  }

  const sizeByName = new Map(installed.map((item) => [item.name, item]));
  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    ollama_host: HOST,
    platform: {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cpu_threads: os.cpus().length,
      total_memory_bytes: os.totalmem(),
      node: process.version,
    },
    gpu: (() => {
      const info = spawnSync(
        'nvidia-smi',
        [
          '--query-gpu=name,memory.total,driver_version',
          '--format=csv,noheader',
        ],
        { encoding: 'utf8' },
      );
      return info.status === 0 && info.stdout
        ? info.stdout.trim().split('\n')[0]
        : null;
    })(),
    probes: PROBES.map((probe) => ({
      id: probe.id,
      max_tokens: probe.maxTokens,
      prompt_characters: probe.prompt.length,
    })),
    models: results.map((item) => ({
      ...item,
      disk_size_bytes: sizeByName.get(String(item.model))?.size ?? null,
      details: sizeByName.get(String(item.model))?.details ?? null,
    })),
  };

  const resultsRoot = benchmarkResultsRoot();
  fs.mkdirSync(resultsRoot, { recursive: true });
  const outputPath = path.join(resultsRoot, 'llm-runtime.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`\n结果：${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
