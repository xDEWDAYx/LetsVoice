/**
 * TTS 输出的回转录可懂度代理。
 *
 * 用本机已装的 whisper.cpp 把每个模型合成出来的 WAV 再转写回文字，
 * 计算归一化 CER。它只是低置信度代理，不能替代人工听测：
 * ASR 自身的错误会算进 CER，中英混合尤其容易被高估。
 *
 * 依赖 tts-benchmark.ts 先跑完（需要 results/wav/<model>/*.wav）。
 *
 *   npm run bench:tts:asr
 *   npm run bench:tts:asr -- --whisper-model <path-to-ggml.bin>
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { benchmarkResultsRoot, resolveWhisper } from './tts-paths';

type CorpusCase = {
  id: string;
  language: 'zh' | 'en' | 'zh-en';
  category: string;
  text: string;
  asr_references?: string[];
};

const corpus: CorpusCase[] = (
  JSON.parse(
    fs.readFileSync(path.join(__dirname, 'tts-corpus.json'), 'utf8'),
  ) as { cases: CorpusCase[] }
).cases;

/**
 * 归一化：NFKC → 小写 → 去掉所有空白与标点。
 * 中英文标点都去掉，避免把标点差异算成识别错误。
 */
function normalize(value: string): string {
  return (
    value
      .normalize('NFKC')
      .toLowerCase()
      // \s 在 Unicode 模式下已经包含全角空格 U+3000，不必再单列
      .replace(/\s/gu, '')
      .replace(/[\p{P}\p{S}]/gu, '')
  );
}

/** 字符级编辑距离，滚动数组实现。 */
function editDistance(reference: string, hypothesis: string): number {
  const rows = reference.length;
  const columns = hypothesis.length;
  if (rows === 0) return columns;
  if (columns === 0) return rows;
  let previous = Array.from({ length: columns + 1 }, (_, index) => index);
  for (let row = 1; row <= rows; row += 1) {
    const current = new Array<number>(columns + 1);
    current[0] = row;
    for (let column = 1; column <= columns; column += 1) {
      const substitution =
        previous[column - 1] +
        (reference[row - 1] === hypothesis[column - 1] ? 0 : 1);
      current[column] = Math.min(
        substitution,
        previous[column] + 1,
        current[column - 1] + 1,
      );
    }
    previous = current;
  }
  return previous[columns];
}

/**
 * 口语读法与书面形式不一致的用例（数字、日期）在语料里给了 asr_references，
 * 取所有可接受写法里最小的那个 CER，避免把正字法差异算成发音错误。
 */
function characterErrorRate(
  testCase: CorpusCase,
  hypothesis: string,
): { cer: number; reference_used: string } {
  const candidates = [testCase.text, ...(testCase.asr_references ?? [])];
  let best = { cer: Number.POSITIVE_INFINITY, reference_used: testCase.text };
  const normalizedHypothesis = normalize(hypothesis);
  for (const candidate of candidates) {
    const reference = normalize(candidate);
    if (reference.length === 0) continue;
    const cer =
      editDistance(reference, normalizedHypothesis) / reference.length;
    if (cer < best.cer) best = { cer, reference_used: candidate };
  }
  return best;
}

function whisperLanguage(language: CorpusCase['language']): string {
  if (language === 'zh') return 'zh';
  if (language === 'en') return 'en';
  // 中英混合没有单一正确答案，交给 whisper 自己判定，和应用里的行为一致。
  return 'auto';
}

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toSixteenKiloHertzMono(
  ffmpeg: string,
  input: string,
  output: string,
): boolean {
  const result = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-ac',
      '1',
      '-ar',
      '16000',
      output,
    ],
    { stdio: 'ignore' },
  );
  return result.status === 0 && fs.existsSync(output);
}

function resolveFfmpeg(): string | null {
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const roots =
    process.platform === 'win32'
      ? [process.env.APPDATA ?? '']
      : [path.join(os.homedir(), 'Library', 'Application Support')];
  const names = [
    'SpeakSpace Local',
    'SpeakSpace',
    'electron-react-boilerplate',
  ];
  const candidate = roots
    .flatMap((root) =>
      names.map((name) =>
        path.join(root, name, 'runtimes', 'ffmpeg', 'bin', executable),
      ),
    )
    .find((item) => fs.existsSync(item));
  return candidate ?? null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function main(): void {
  const resultsRoot = benchmarkResultsRoot();
  const wavRoot = path.join(resultsRoot, 'wav');
  if (!fs.existsSync(wavRoot)) {
    throw new Error(
      `没有找到合成音频，先跑 npm run bench:tts。缺少 ${wavRoot}`,
    );
  }
  const whisper = resolveWhisper();
  if (!whisper.binary) throw new Error('没有找到 whisper.cpp 可执行文件');
  const whisperModel = flagValue('--whisper-model') ?? whisper.models[0];
  if (!whisperModel) throw new Error('没有找到已安装的 whisper ggml 模型');
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) throw new Error('没有找到应用自带的 ffmpeg');

  const threadCount = Math.max(1, Math.min(os.cpus().length - 1, 8));
  const workRoot = path.join(resultsRoot, 'asr-work');
  fs.mkdirSync(workRoot, { recursive: true });

  process.stdout.write(
    `whisper: ${whisper.binary}\n模型: ${whisperModel}\n线程: ${threadCount}\n`,
  );

  const models = fs
    .readdirSync(wavRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const perModel: Record<string, unknown> = {};
  for (const modelId of models) {
    process.stdout.write(`\n=== ${modelId} ===\n`);
    const entries: {
      id: string;
      language: string;
      category: string;
      transcript: string;
      cer: number | null;
      reference_used: string | null;
      error: string | null;
    }[] = [];

    for (const testCase of corpus) {
      const sourceWav = path.join(wavRoot, modelId, `${testCase.id}.wav`);
      if (!fs.existsSync(sourceWav)) {
        entries.push({
          id: testCase.id,
          language: testCase.language,
          category: testCase.category,
          transcript: '',
          cer: null,
          reference_used: null,
          error: '缺少合成音频',
        });
        continue;
      }
      const prepared = path.join(workRoot, `${modelId}-${testCase.id}-16k.wav`);
      if (!toSixteenKiloHertzMono(ffmpeg, sourceWav, prepared)) {
        entries.push({
          id: testCase.id,
          language: testCase.language,
          category: testCase.category,
          transcript: '',
          cer: null,
          reference_used: null,
          error: 'ffmpeg 转换失败',
        });
        continue;
      }
      const outputBase = path.join(workRoot, `${modelId}-${testCase.id}`);
      const run = spawnSync(
        whisper.binary,
        [
          '-m',
          whisperModel,
          '-f',
          prepared,
          '-l',
          whisperLanguage(testCase.language),
          '-sns',
          '-t',
          String(threadCount),
          '-otxt',
          '-of',
          outputBase,
        ],
        { cwd: path.dirname(whisper.binary), encoding: 'utf8' },
      );
      const textPath = `${outputBase}.txt`;
      if (run.status !== 0 || !fs.existsSync(textPath)) {
        entries.push({
          id: testCase.id,
          language: testCase.language,
          category: testCase.category,
          transcript: '',
          cer: null,
          reference_used: null,
          // 带上 stderr：曾经因为调了废弃的 main.exe 而全量失败，
          // 光看退出码完全定位不到原因。
          error: `whisper 退出码 ${run.status}: ${String(run.stderr ?? '')
            .trim()
            .split('\n')
            .slice(0, 3)
            .join(' / ')}`,
        });
        continue;
      }
      const transcript = fs.readFileSync(textPath, 'utf8').trim();
      const scored = characterErrorRate(testCase, transcript);
      entries.push({
        id: testCase.id,
        language: testCase.language,
        category: testCase.category,
        transcript,
        cer: scored.cer,
        reference_used: scored.reference_used,
        error: null,
      });
      process.stdout.write(
        `  ${testCase.id.padEnd(20)} CER ${(scored.cer * 100).toFixed(1)}%\n`,
      );
    }

    const scoredEntries = entries.filter(
      (entry): entry is typeof entry & { cer: number } => entry.cer !== null,
    );
    const byLanguage: Record<string, number | null> = {};
    for (const language of ['zh', 'en', 'zh-en']) {
      byLanguage[language] = mean(
        scoredEntries
          .filter((entry) => entry.language === language)
          .map((entry) => entry.cer),
      );
    }
    const byCategory: Record<string, number | null> = {};
    for (const category of [...new Set(corpus.map((item) => item.category))]) {
      byCategory[category] = mean(
        scoredEntries
          .filter((entry) => entry.category === category)
          .map((entry) => entry.cer),
      );
    }
    perModel[modelId] = {
      scored_count: scoredEntries.length,
      failed_count: entries.length - scoredEntries.length,
      mean_cer: mean(scoredEntries.map((entry) => entry.cer)),
      mean_cer_by_language: byLanguage,
      mean_cer_by_category: byCategory,
      entries,
    };
    process.stdout.write(
      `平均 CER ${(((perModel[modelId] as { mean_cer: number }).mean_cer ?? 0) * 100).toFixed(1)}%\n`,
    );
  }

  const outputPath = path.join(resultsRoot, 'tts-asr.json');
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        schema_version: 2,
        measured_at: new Date().toISOString(),
        whisper_binary: whisper.binary,
        whisper_model: whisperModel,
        thread_count: threadCount,
        note: 'ASR 回转录仅为低置信度可懂度代理，不等同于 MOS 或人工听测。',
        models: perModel,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`\n结果: ${outputPath}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${(error as Error)?.stack ?? error}\n`);
  process.exitCode = 1;
}
