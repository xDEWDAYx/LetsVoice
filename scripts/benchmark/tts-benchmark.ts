/**
 * TTS 模型基准测试。
 *
 * 走的是应用真实的 TTSEngine（Kokoro / MeloTTS 经 sherpa-onnx，MOSS 经
 * onnxruntime-node），所以测到的就是用户实际会用到的那条链路，不是另写一套推理。
 *
 * 用法：
 *   npm run bench:tts                       # 所有已就绪的模型，各起一个子进程
 *   npm run bench:tts -- --repeats 5
 *   npm run bench:tts -- --model vits-melo-tts-zh_en   # 只跑一个（内部也用它起子进程）
 *
 * 每个模型单独一个进程，峰值内存才不会互相污染。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import TTSEngine from '../../src/main/tts/TTSEngine';
import {
  KOKORO_TTS_MODEL_ID,
  MOSS_TTS_MODEL_ID,
  TTS_MODEL_CATALOG,
} from '../../src/main/tts/TTSModelCatalog';
import {
  benchmarkResultsRoot,
  directorySizeBytes,
  resolveTTSModelDir,
} from './tts-paths';

type CorpusCase = {
  id: string;
  language: 'zh' | 'en' | 'zh-en';
  category: string;
  text: string;
  asr_references?: string[];
};

type RunMetrics = {
  repeat: number;
  synthesis_ms: number;
  audio_seconds: number;
  rtf: number;
  characters_per_second: number;
  sample_rate_hz: number;
  channel_count: number;
  samples_per_channel: number;
  peak_absolute: number;
  rms: number;
  clipping_ratio: number;
  non_finite_samples: number;
};

type CaseResult = {
  id: string;
  language: string;
  category: string;
  text_length: number;
  speaker_id: string;
  wav_path: string | null;
  error: string | null;
  median_synthesis_ms: number | null;
  median_rtf: number | null;
  median_audio_seconds: number | null;
  runs: RunMetrics[];
};

const allCases: CorpusCase[] = (
  JSON.parse(
    fs.readFileSync(path.join(__dirname, 'tts-corpus.json'), 'utf8'),
  ) as { cases: CorpusCase[] }
).cases;

/** --only 用于冒烟：按 id、语言或类别过滤，逗号分隔。 */
function selectedCases(): CorpusCase[] {
  const index = process.argv.indexOf('--only');
  if (index < 0) return allCases;
  const wanted = new Set(
    process.argv[index + 1].split(',').map((value) => value.trim()),
  );
  return allCases.filter(
    (item) =>
      wanted.has(item.id) ||
      wanted.has(item.language) ||
      wanted.has(item.category),
  );
}

/** 与 2026-08-13 那轮保持同一套音色，纵向可比。 */
function speakerFor(modelId: string, testCase: CorpusCase): string {
  if (modelId === KOKORO_TTS_MODEL_ID) {
    return testCase.language === 'en' ? '0' : '45';
  }
  if (modelId === MOSS_TTS_MODEL_ID) return 'Junhao';
  return '0';
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signalMetrics(channels: Float32Array[]): {
  peak_absolute: number;
  rms: number;
  clipping_ratio: number;
  non_finite_samples: number;
} {
  let squareSum = 0;
  let peak = 0;
  let clipped = 0;
  let nonFinite = 0;
  let finiteCount = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const sample = channel[index];
      if (!Number.isFinite(sample)) {
        nonFinite += 1;
        continue;
      }
      finiteCount += 1;
      const absolute = Math.abs(sample);
      if (absolute > peak) peak = absolute;
      squareSum += sample * sample;
      if (absolute >= 0.999) clipped += 1;
    }
  }
  return {
    peak_absolute: peak,
    rms: finiteCount ? Math.sqrt(squareSum / finiteCount) : 0,
    clipping_ratio: finiteCount ? clipped / finiteCount : 0,
    non_finite_samples: nonFinite,
  };
}

/** 交错写入 PCM16 WAV，支持单声道和双声道（MOSS 返回两条声道）。 */
function writeWav(
  filePath: string,
  channels: Float32Array[],
  sampleRate: number,
): void {
  const channelCount = channels.length;
  const frameCount = channels[0]?.length ?? 0;
  const dataBytes = frameCount * channelCount * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * 2, 28);
  buffer.writeUInt16LE(channelCount * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const raw = channels[channel][frame];
      const clamped = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      buffer.writeInt16LE(Math.round(clamped * 32767), offset);
      offset += 2;
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/* ------------------------------ 单模型执行 ------------------------------ */

async function runOneModel(modelId: string, repeats: number): Promise<void> {
  const modelDir = resolveTTSModelDir(modelId);
  if (!modelDir) throw new Error(`模型目录不存在: ${modelId}`);
  const resultsRoot = benchmarkResultsRoot();
  const wavRoot = path.join(resultsRoot, 'wav', modelId);
  fs.mkdirSync(wavRoot, { recursive: true });

  // 每 100ms 采一次 RSS：Windows 上没有 /usr/bin/time -l，只能自己采样。
  let sampledPeakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    const current = process.memoryUsage().rss;
    if (current > sampledPeakRss) sampledPeakRss = current;
  }, 100);

  const engine = new TTSEngine();
  const catalogItem = TTS_MODEL_CATALOG.find((item) => item.id === modelId);

  // 加载耗时单独计一次：用最短的一条文本触发引擎创建，减去它自身的合成时间。
  const warmupCase = selectedCases().reduce((shortest, candidate) =>
    candidate.text.length < shortest.text.length ? candidate : shortest,
  );
  const loadStarted = performance.now();
  await engine.generate(
    modelId,
    modelDir,
    warmupCase.text,
    speakerFor(modelId, warmupCase),
    1,
  );
  const loadPlusFirstSynthesisMs = performance.now() - loadStarted;

  const caseResults: CaseResult[] = [];
  for (const testCase of selectedCases()) {
    const speakerId = speakerFor(modelId, testCase);
    const runs: RunMetrics[] = [];
    let wavPath: string | null = null;
    let error: string | null = null;

    for (let repeat = 0; repeat < repeats; repeat += 1) {
      try {
        const started = performance.now();
        // eslint-disable-next-line no-await-in-loop
        const audio = await engine.generate(
          modelId,
          modelDir,
          testCase.text,
          speakerId,
          1,
        );
        const synthesisMs = performance.now() - started;
        const samplesPerChannel = audio.channels[0]?.length ?? 0;
        const audioSeconds = samplesPerChannel / audio.sampleRate;
        runs.push({
          repeat: repeat + 1,
          synthesis_ms: synthesisMs,
          audio_seconds: audioSeconds,
          rtf: audioSeconds > 0 ? synthesisMs / 1000 / audioSeconds : NaN,
          characters_per_second: testCase.text.length / (synthesisMs / 1000),
          sample_rate_hz: audio.sampleRate,
          channel_count: audio.channels.length,
          samples_per_channel: samplesPerChannel,
          ...signalMetrics(audio.channels),
        });
        if (repeat === 0) {
          wavPath = path.join(wavRoot, `${testCase.id}.wav`);
          writeWav(wavPath, audio.channels, audio.sampleRate);
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        break;
      }
    }

    caseResults.push({
      id: testCase.id,
      language: testCase.language,
      category: testCase.category,
      text_length: testCase.text.length,
      speaker_id: speakerId,
      wav_path: wavPath,
      error,
      median_synthesis_ms: percentile(
        runs.map((run) => run.synthesis_ms),
        0.5,
      ),
      median_rtf: percentile(
        runs.map((run) => run.rtf),
        0.5,
      ),
      median_audio_seconds: percentile(
        runs.map((run) => run.audio_seconds),
        0.5,
      ),
      runs,
    });
    process.stdout.write(
      `  ${testCase.id.padEnd(20)} ${
        error
          ? `失败: ${error}`
          : `RTF ${(
              percentile(
                runs.map((run) => run.rtf),
                0.5,
              ) ?? 0
            ).toFixed(3)}`
      }\n`,
    );
  }

  engine.dispose();
  clearInterval(sampler);

  const allRtf = caseResults
    .flatMap((item) => item.runs.map((run) => run.rtf))
    .filter((value) => Number.isFinite(value));
  const byLanguage: Record<string, unknown> = {};
  for (const language of ['zh', 'en', 'zh-en']) {
    const values = caseResults
      .filter((item) => item.language === language)
      .flatMap((item) => item.runs.map((run) => run.rtf))
      .filter((value) => Number.isFinite(value));
    byLanguage[language] = {
      case_count: caseResults.filter((item) => item.language === language)
        .length,
      p50_rtf: percentile(values, 0.5),
      p95_rtf: percentile(values, 0.95),
      mean_rtf: mean(values),
    };
  }
  const byCategory: Record<string, unknown> = {};
  for (const category of [
    ...new Set(caseResults.map((item) => item.category)),
  ]) {
    const values = caseResults
      .filter((item) => item.category === category)
      .flatMap((item) => item.runs.map((run) => run.rtf))
      .filter((value) => Number.isFinite(value));
    byCategory[category] = {
      p50_rtf: percentile(values, 0.5),
      p95_rtf: percentile(values, 0.95),
    };
  }

  const failures = caseResults.filter((item) => item.error !== null);
  const result = {
    schema_version: 2,
    measured_at: new Date().toISOString(),
    model_id: modelId,
    model_name: catalogItem?.name ?? modelId,
    engine: catalogItem?.engine ?? 'unknown',
    model_dir: modelDir,
    model_size_bytes: directorySizeBytes(modelDir),
    platform: {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cpu_threads: os.cpus().length,
      total_memory_bytes: os.totalmem(),
      node: process.version,
    },
    repeat_count: repeats,
    case_count: caseResults.length,
    failure_count: failures.length,
    load_plus_first_synthesis_ms: loadPlusFirstSynthesisMs,
    peak_rss_bytes: sampledPeakRss,
    max_rss_bytes: process.resourceUsage().maxRSS * 1024,
    overall: {
      p50_rtf: percentile(allRtf, 0.5),
      p95_rtf: percentile(allRtf, 0.95),
      mean_rtf: mean(allRtf),
      total_audio_seconds: caseResults.reduce(
        (sum, item) => sum + (item.median_audio_seconds ?? 0),
        0,
      ),
      non_finite_sample_total: caseResults.reduce(
        (sum, item) =>
          sum +
          item.runs.reduce((inner, run) => inner + run.non_finite_samples, 0),
        0,
      ),
      max_clipping_ratio: Math.max(
        0,
        ...caseResults.flatMap((item) =>
          item.runs.map((run) => run.clipping_ratio),
        ),
      ),
      sample_rate_hz: caseResults.find((item) => item.runs.length > 0)?.runs[0]
        ?.sample_rate_hz,
      channel_count: caseResults.find((item) => item.runs.length > 0)?.runs[0]
        ?.channel_count,
    },
    by_language: byLanguage,
    by_category: byCategory,
    cases: caseResults,
  };

  const resultPath = path.join(resultsRoot, `tts-${modelId}.json`);
  fs.mkdirSync(resultsRoot, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `完成 ${result.model_name}: P50 RTF ${result.overall.p50_rtf?.toFixed(3)}, ` +
      `P95 RTF ${result.overall.p95_rtf?.toFixed(3)}, ` +
      `峰值 RSS ${(sampledPeakRss / 1024 / 1024).toFixed(1)} MiB, ` +
      `失败 ${failures.length}/${caseResults.length}\n` +
      `结果: ${resultPath}\n`,
  );
}

/* -------------------------------- 驱动 -------------------------------- */

function runChild(modelId: string, repeats: number): boolean {
  process.stdout.write(`\n=== ${modelId} ===\n`);
  const only = flagValue('--only');
  const result = spawnSync(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      __filename,
      '--worker',
      '--model',
      modelId,
      '--repeats',
      String(repeats),
      ...(only ? ['--only', only] : []),
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    },
  );
  return result.status === 0;
}

async function main(): Promise<void> {
  const repeats = Number(flagValue('--repeats') ?? 3);
  const requested = flagValue('--model');
  const isWorker = process.argv.includes('--worker');

  if (isWorker) {
    if (!requested) throw new Error('worker 模式必须带 --model');
    await runOneModel(requested, repeats);
    return;
  }

  const available = TTS_MODEL_CATALOG.filter(
    (item) =>
      (!requested || item.id === requested) &&
      resolveTTSModelDir(item.id) !== null,
  );
  const missing = TTS_MODEL_CATALOG.filter(
    (item) =>
      (!requested || item.id === requested) &&
      resolveTTSModelDir(item.id) === null,
  );
  if (missing.length > 0) {
    process.stdout.write(
      `跳过未安装的模型: ${missing.map((item) => item.id).join(', ')}\n` +
        `先跑 npm run bench:tts:fetch 下载。\n`,
    );
  }
  if (available.length === 0) throw new Error('没有可用的 TTS 模型');

  const failed: string[] = [];
  for (const item of available) {
    if (!runChild(item.id, repeats)) failed.push(item.id);
  }
  if (failed.length > 0) {
    process.stdout.write(`\n以下模型执行失败: ${failed.join(', ')}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
