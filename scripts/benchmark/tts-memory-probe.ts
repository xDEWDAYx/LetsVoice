/**
 * TTS 引擎的内存增长探针。
 *
 * 主基准只报一个「整个进程的峰值 RSS」，回答不了一个关键问题：
 * 那个峰值是**单次合成的瞬时开销**，还是**随合成次数不断累积**？
 * 两者的部署结论完全不同 —— 前者只要机器内存够就行，后者是泄漏，长会话必然崩。
 *
 * 做法：同一个引擎实例连续合成同一段文本 N 次，每次之后先强制 GC 再采 RSS。
 * 强制 GC 之后仍然单调上升，才能说是累积占用，而不是等待回收的垃圾。
 *
 *   npm run bench:tts:memory
 *   npm run bench:tts:memory -- --iterations 12
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import TTSEngine from '../../src/main/tts/TTSEngine';
import {
  KOKORO_TTS_MODEL_ID,
  MOSS_TTS_MODEL_ID,
  TTS_MODEL_CATALOG,
} from '../../src/main/tts/TTSModelCatalog';
import { benchmarkResultsRoot, resolveTTSModelDir } from './tts-paths';

type CorpusCase = {
  id: string;
  language: string;
  category: string;
  text: string;
};

const corpus: CorpusCase[] = (
  JSON.parse(
    fs.readFileSync(path.join(__dirname, 'tts-corpus.json'), 'utf8'),
  ) as { cases: CorpusCase[] }
).cases;

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function speakerFor(modelId: string, language: string): string {
  if (modelId === KOKORO_TTS_MODEL_ID) return language === 'en' ? '0' : '45';
  if (modelId === MOSS_TTS_MODEL_ID) return 'Junhao';
  return '0';
}

/**
 * 单段文本内部的增长趋势。
 *
 * 三个坑，都是实测踩出来的：
 *  1. 每次增长必须**在同一段文本内部**算。跨短句→长文本的边界会有一次阶跃，
 *     把它算进去会把明明走平的 Kokoro 误判成持续增长。
 *  2. 丢掉每段的第一次 —— 那一次包含该长度的一次性分配。
 *  3. 用最小二乘斜率而不是首尾差。MOSS 的长文本 RSS 在约 5.8～6.2 GiB 之间来回震荡
 *     （疑似分配器 arena 复用），首尾差会把震荡读成累积。
 *
 * 震荡幅度超过整体漂移两倍时判为 oscillating，不叫累积 —— 数据不支持那个结论。
 */
function analysePhase(samples: { rss_bytes: number }[]): {
  slope: number;
  range: number;
  drift: number;
  oscillating: boolean;
} {
  const settled = samples.slice(1).map((item) => item.rss_bytes);
  if (settled.length < 2) {
    return { slope: 0, range: 0, drift: 0, oscillating: false };
  }
  const meanX = (settled.length - 1) / 2;
  const meanY = settled.reduce((sum, value) => sum + value, 0) / settled.length;
  let sxy = 0;
  let sxx = 0;
  settled.forEach((value, index) => {
    sxy += (index - meanX) * (value - meanY);
    sxx += (index - meanX) ** 2;
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const range = Math.max(...settled) - Math.min(...settled);
  const drift = Math.abs(slope) * (settled.length - 1);
  return { slope, range, drift, oscillating: range > 2 * drift && range > 0 };
}

function verdictFor(analysis: {
  slope: number;
  oscillating: boolean;
}): 'stable' | 'oscillating' | 'slow-growth' | 'accumulating' {
  if (analysis.oscillating) return 'oscillating';
  if (analysis.slope > 8 * 1024 * 1024) return 'accumulating';
  if (analysis.slope > 1024 * 1024) return 'slow-growth';
  return 'stable';
}

/** 强制回收后再采样，把「还没回收的垃圾」和「真占着的内存」分开。 */
function rssAfterGc(): number {
  const collect = (globalThis as { gc?: () => void }).gc;
  if (collect) {
    collect();
    collect();
  }
  return process.memoryUsage().rss;
}

async function probeModel(modelId: string, iterations: number): Promise<void> {
  const modelDir = resolveTTSModelDir(modelId);
  if (!modelDir) throw new Error(`模型目录不存在: ${modelId}`);
  const catalogItem = TTS_MODEL_CATALOG.find((item) => item.id === modelId);

  // 两段文本：短句代表常规使用，长文本代表单次开销最大的情况。
  const shortCase = corpus.find((item) => item.id === 'zh_short')!;
  const longCase = corpus.find((item) => item.id === 'zh_long_01')!;

  const engine = new TTSEngine();
  const baselineRss = rssAfterGc();

  const phases: {
    phase: string;
    case_id: string;
    text_length: number;
    samples: { iteration: number; rss_bytes: number; synthesis_ms: number }[];
  }[] = [];

  for (const [phaseName, testCase] of [
    ['short', shortCase],
    ['long', longCase],
  ] as const) {
    const samples: {
      iteration: number;
      rss_bytes: number;
      synthesis_ms: number;
    }[] = [];
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      await engine.generate(
        modelId,
        modelDir,
        testCase.text,
        speakerFor(modelId, testCase.language),
        1,
      );
      const synthesisMs = Date.now() - started;
      samples.push({
        iteration,
        rss_bytes: rssAfterGc(),
        synthesis_ms: synthesisMs,
      });
      process.stdout.write(
        `  ${phaseName} #${String(iteration).padStart(2)} RSS ${(
          samples[samples.length - 1].rss_bytes /
          1024 /
          1024
        ).toFixed(0)} MiB\n`,
      );
    }
    phases.push({
      phase: phaseName,
      case_id: testCase.id,
      text_length: testCase.text.length,
      samples,
    });
  }

  // 释放引擎之后再看一次：能不能降下来，决定了「切换模型」是否安全。
  engine.dispose();
  await new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });
  const afterDisposeRss = rssAfterGc();

  const allSamples = phases.flatMap((item) => item.samples);
  const first = allSamples[0].rss_bytes;
  const last = allSamples[allSamples.length - 1].rss_bytes;
  const growthPerIteration =
    allSamples.length > 1 ? (last - first) / (allSamples.length - 1) : 0;

  const perPhase = phases.map((phase) => analysePhase(phase.samples));
  const worst = perPhase.reduce((a, b) => (b.slope > a.slope ? b : a));
  const secondHalfGrowth = worst.slope;

  const result = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    platform: {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cpu_threads: os.cpus().length,
      total_memory_bytes: os.totalmem(),
    },
    model_id: modelId,
    model_name: catalogItem?.name ?? modelId,
    engine: catalogItem?.engine ?? 'unknown',
    gc_exposed: typeof (globalThis as { gc?: () => void }).gc === 'function',
    iterations_per_phase: iterations,
    baseline_rss_bytes: baselineRss,
    final_rss_bytes: last,
    after_dispose_rss_bytes: afterDisposeRss,
    growth_per_iteration_bytes: growthPerIteration,
    second_half_growth_per_iteration_bytes: secondHalfGrowth,
    per_phase_analysis: phases.map((phase, index) => ({
      phase: phase.phase,
      ...perPhase[index],
    })),
    verdict: verdictFor(worst),
    verdict_note:
      '趋势在同一段文本内部用最小二乘斜率计算，并丢弃每段第一次；震荡幅度超过整体漂移两倍时判为 oscillating。',
    phases,
  };

  const resultsRoot = benchmarkResultsRoot();
  fs.mkdirSync(resultsRoot, { recursive: true });
  fs.writeFileSync(
    path.join(resultsRoot, `tts-memory-${modelId}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.stdout.write(
    `${result.model_name}: 基线 ${(baselineRss / 1048576).toFixed(0)} MiB → ` +
      `末次 ${(last / 1048576).toFixed(0)} MiB，释放后 ${(afterDisposeRss / 1048576).toFixed(0)} MiB，` +
      `后半程每次 ${(secondHalfGrowth / 1048576).toFixed(1)} MiB → ${result.verdict}\n`,
  );
}

function runChild(modelId: string, iterations: number): boolean {
  process.stdout.write(`\n=== ${modelId} ===\n`);
  const result = spawnSync(
    process.execPath,
    [
      '--expose-gc',
      '-r',
      'ts-node/register/transpile-only',
      __filename,
      '--worker',
      '--model',
      modelId,
      '--iterations',
      String(iterations),
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    },
  );
  return result.status === 0;
}

async function main(): Promise<void> {
  const iterations = Number(flagValue('--iterations') ?? 10);
  const requested = flagValue('--model');

  if (process.argv.includes('--worker')) {
    if (!requested) throw new Error('worker 模式必须带 --model');
    await probeModel(requested, iterations);
    return;
  }

  process.stdout.write(
    `内存探针：每个模型、每段文本连续合成 ${iterations} 次，每次强制 GC 后采样 RSS。\n` +
      `机器内存 ${(os.totalmem() / 1073741824).toFixed(1)} GiB\n`,
  );
  const available = TTS_MODEL_CATALOG.filter(
    (item) =>
      (!requested || item.id === requested) &&
      resolveTTSModelDir(item.id) !== null,
  );
  const failed = available
    .filter((item) => !runChild(item.id, iterations))
    .map((item) => item.id);
  if (failed.length > 0) {
    process.stdout.write(`\n执行失败: ${failed.join(', ')}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
