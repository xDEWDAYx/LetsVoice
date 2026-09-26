/**
 * TTS 峰值内存随文本长度的变化。
 *
 * 内存探针（tts-memory-probe.ts）证明了三个模型重复合成同一段文本都会走平，
 * 都不是无界泄漏。但主基准里 MOSS 跑完 36 条语料的峰值 RSS 高达约 19 GiB，
 * 而单看 315 字那一段只有约 6 GiB —— 说明真正的变量是**文本长度**，
 * 不是调用次数。这个脚本就是把这条曲线量出来。
 *
 * 做法：按长度递增依次合成，每次合成期间以 50 ms 采样 RSS 取最大值，
 * 合成结束后强制 GC 再采一次基线，把「单次瞬时开销」和「常驻占用」分开。
 *
 *   npm run bench:tts:length
 *   npm run bench:tts:length -- --model moss-tts-nano-100m-onnx
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

function rssAfterGc(): number {
  const collect = (globalThis as { gc?: () => void }).gc;
  if (collect) {
    collect();
    collect();
  }
  return process.memoryUsage().rss;
}

/**
 * 长度阶梯：从语料里按字符数挑出跨度尽量大的一组，
 * 覆盖极短句到最长段落，同一模型内保持同一批文本。
 */
function ladder(): CorpusCase[] {
  const sorted = [...corpus].sort((a, b) => a.text.length - b.text.length);
  const wanted = [
    sorted[0],
    sorted[Math.floor(sorted.length * 0.25)],
    sorted[Math.floor(sorted.length * 0.5)],
    sorted[Math.floor(sorted.length * 0.75)],
    ...sorted.slice(-3),
  ];
  const seen = new Set<string>();
  return wanted.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function probeModel(modelId: string): Promise<void> {
  const modelDir = resolveTTSModelDir(modelId);
  if (!modelDir) throw new Error(`模型目录不存在: ${modelId}`);
  const catalogItem = TTS_MODEL_CATALOG.find((item) => item.id === modelId);
  const engine = new TTSEngine();
  const cases = ladder();

  // 先热身一次，把模型加载和一次性分配排除在曲线之外。
  await engine.generate(
    modelId,
    modelDir,
    cases[0].text,
    speakerFor(modelId, cases[0].language),
    1,
  );
  const warmRss = rssAfterGc();

  const samples: {
    id: string;
    language: string;
    text_length: number;
    audio_seconds: number;
    peak_rss_bytes: number;
    settled_rss_bytes: number;
    transient_bytes: number;
    bytes_per_character: number;
    synthesis_ms: number;
    error: string | null;
  }[] = [];

  for (const testCase of cases) {
    let peakRss = process.memoryUsage().rss;
    const sampler = setInterval(() => {
      const current = process.memoryUsage().rss;
      if (current > peakRss) peakRss = current;
    }, 50);
    const started = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      const audio = await engine.generate(
        modelId,
        modelDir,
        testCase.text,
        speakerFor(modelId, testCase.language),
        1,
      );
      const synthesisMs = Date.now() - started;
      clearInterval(sampler);
      const settled = rssAfterGc();
      samples.push({
        id: testCase.id,
        language: testCase.language,
        text_length: testCase.text.length,
        audio_seconds: (audio.channels[0]?.length ?? 0) / audio.sampleRate,
        peak_rss_bytes: peakRss,
        settled_rss_bytes: settled,
        transient_bytes: Math.max(0, peakRss - settled),
        bytes_per_character: peakRss / testCase.text.length,
        synthesis_ms: synthesisMs,
        error: null,
      });
      process.stdout.write(
        `  ${testCase.id.padEnd(18)} ${String(testCase.text.length).padStart(5)} 字  ` +
          `峰值 ${(peakRss / 1048576).toFixed(0).padStart(6)} MiB  ` +
          `回落 ${(settled / 1048576).toFixed(0).padStart(5)} MiB\n`,
      );
    } catch (caught) {
      clearInterval(sampler);
      const message = caught instanceof Error ? caught.message : String(caught);
      samples.push({
        id: testCase.id,
        language: testCase.language,
        text_length: testCase.text.length,
        audio_seconds: 0,
        peak_rss_bytes: peakRss,
        settled_rss_bytes: rssAfterGc(),
        transient_bytes: 0,
        bytes_per_character: 0,
        synthesis_ms: Date.now() - started,
        error: message,
      });
      process.stdout.write(`  ${testCase.id.padEnd(18)} 失败: ${message}\n`);
    }
  }

  engine.dispose();
  const successful = samples.filter((item) => item.error === null);
  const shortest = successful[0];
  const longest = successful[successful.length - 1];
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
    machine_memory_bytes: os.totalmem(),
    warm_rss_bytes: warmRss,
    min_text_length: shortest?.text_length ?? 0,
    max_text_length: longest?.text_length ?? 0,
    min_peak_rss_bytes: shortest?.peak_rss_bytes ?? 0,
    max_peak_rss_bytes: longest?.peak_rss_bytes ?? 0,
    peak_growth_ratio:
      shortest && longest && shortest.peak_rss_bytes > 0
        ? longest.peak_rss_bytes / shortest.peak_rss_bytes
        : null,
    samples,
  };
  const resultsRoot = benchmarkResultsRoot();
  fs.mkdirSync(resultsRoot, { recursive: true });
  fs.writeFileSync(
    path.join(resultsRoot, `tts-length-${modelId}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.stdout.write(
    `${result.model_name}: ${result.min_text_length} 字 ${(
      result.min_peak_rss_bytes / 1048576
    ).toFixed(0)} MiB → ${result.max_text_length} 字 ${(
      result.max_peak_rss_bytes / 1048576
    ).toFixed(0)} MiB（${result.peak_growth_ratio?.toFixed(1)}×）\n`,
  );
}

function runChild(modelId: string): boolean {
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
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    },
  );
  return result.status === 0;
}

async function main(): Promise<void> {
  const requested = flagValue('--model');
  if (process.argv.includes('--worker')) {
    if (!requested) throw new Error('worker 模式必须带 --model');
    await probeModel(requested);
    return;
  }
  process.stdout.write(
    `峰值内存 vs 文本长度。机器内存 ${(os.totalmem() / 1073741824).toFixed(1)} GiB\n` +
      `长度阶梯: ${ladder()
        .map((item) => `${item.id}(${item.text.length})`)
        .join(', ')}\n`,
  );
  const available = TTS_MODEL_CATALOG.filter(
    (item) =>
      (!requested || item.id === requested) &&
      resolveTTSModelDir(item.id) !== null,
  );
  const failed = available
    .filter((item) => !runChild(item.id))
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
