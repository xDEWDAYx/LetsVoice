/**
 * 真人录音的 STT 准确率评测。
 *
 * 跟 tts-asr-eval.ts（合成语音回转录，低置信度代理）不是一回事：这里用的是
 * docs/testing/datasets/stt-human-recordings/ 下的真人朗读，
 * 跑 stt-recording-corpus.ts 里核对过的映射，测的是真实语音输入下的转写准确率。
 *
 * A/C 段（照原文逐字读）用严格 CER；B 段（合上原文后用自己的话复述）不算 CER
 * —— 复述不要求逐字一致，用编辑距离打分只会产生误导性的高错误率 —— 改用
 * 「内容覆盖率」：原文的字/词有多少比例出现在了转写结果里，不看顺序。
 * 内容覆盖率对高频虚词（的/了/是等）没有做停用词过滤，绝对值会偏高，
 * 同一 ID 在 A 段（覆盖率）和 B 段（覆盖率）之间的相对差异比单看绝对值更有意义。
 *
 * 用户是中文母语者，英文朗读预期会有发音和用词的自然偏差；这是在测真实使用场景，
 * 不是在挑朗读者的错，报告里明确写清楚这一点。
 *
 *   npm run bench:stt
 *   npm run bench:stt -- --models tiny,base   # 只测部分模型，先出个粗略结果
 *   npm run bench:stt -- --speed-only         # 只测 RTF，不算 CER/内容覆盖率
 *
 * --speed-only 是给跨机器硬件基准用的：同一批录音、同一个 whisper 模型，换机器
 * 转写结果不会变，CER 不属于「跨机器会变」的指标，写进每台机器的结果文件里只是
 * 噪音。这个模式下仍然完整跑一遍转写（RTF 依赖真实转写耗时），只是不计分、
 * 不把 CER/内容覆盖率写进输出，并且换一个文件名（stt-human-speed.json），
 * 不会跟单机上跑的完整准确率评测互相覆盖。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  benchmarkResultsRoot,
  resolveSystemCommand,
  resolveWhisper,
} from './tts-paths';
import { RECORDING_CASES, RecordingCase } from './stt-recording-corpus';
import { selectRequestedSttModels } from './stt-model-selection';

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
const corpusById = new Map(corpus.map((item) => [item.id, item]));

const RECORDING_DIR = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'testing',
  'datasets',
  'stt-human-recordings',
);

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s/gu, '')
    .replace(/[\p{P}\p{S}]/gu, '');
}

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

function characterErrorRate(
  referenceValue: string,
  hypothesis: string,
): number {
  const reference = normalize(referenceValue);
  const normalizedHypothesis = normalize(hypothesis);
  if (reference.length === 0) return 0;
  return editDistance(reference, normalizedHypothesis) / reference.length;
}

/** 汉字逐字切分为独立 token；连续的字母数字合成一个词 token；标点/空白是分隔符不计入。 */
function tokenize(value: string): string[] {
  const normalized = value.normalize('NFKC').toLowerCase();
  const tokens: string[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      tokens.push(buffer);
      buffer = '';
    }
  };
  for (const ch of normalized) {
    if (/\p{Script=Han}/u.test(ch)) {
      flush();
      tokens.push(ch);
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      buffer += ch;
    } else {
      flush();
    }
  }
  flush();
  return tokens;
}

function contentRecall(
  referenceValue: string,
  hypothesis: string,
): { recall: number; matched: number; total: number } {
  const refTokens = tokenize(referenceValue);
  const hypTokens = new Set(tokenize(hypothesis));
  if (refTokens.length === 0) return { recall: 1, matched: 0, total: 0 };
  const matched = refTokens.filter((token) => hypTokens.has(token)).length;
  return {
    recall: matched / refTokens.length,
    matched,
    total: refTokens.length,
  };
}

function referenceLanguage(
  recordingCase: RecordingCase,
): CorpusCase['language'] {
  return corpusById.get(recordingCase.ids[0])!.language;
}

function referenceText(recordingCase: RecordingCase): string {
  return recordingCase.ids.map((id) => corpusById.get(id)!.text).join('');
}

function whisperLanguage(language: CorpusCase['language']): string {
  if (language === 'zh') return 'zh';
  if (language === 'en') return 'en';
  return 'auto';
}

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** 按录音 App 生成顺序取回第 index（1 起）个 m4a 源文件：先是「录音.m4a」，再是「录音 (2).m4a」...。 */
function sourceRecordingPath(index: number): string {
  if (index === 1) return path.join(RECORDING_DIR, '录音.m4a');
  return path.join(RECORDING_DIR, `录音 (${index}).m4a`);
}

function resolveFfmpegTool(executable: string): string | null {
  const roots =
    process.platform === 'win32'
      ? [process.env.APPDATA ?? '']
      : [path.join(os.homedir(), 'Library', 'Application Support')];
  const names = [
    'SpeakSpace Local',
    'SpeakSpace',
    'electron-react-boilerplate',
  ];
  const managed = roots
    .flatMap((root) =>
      names.map((name) =>
        path.join(root, name, 'runtimes', 'ffmpeg', 'bin', executable),
      ),
    )
    .find((item) => fs.existsSync(item));
  return managed ?? resolveSystemCommand([executable]);
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

function audioDurationSeconds(ffprobe: string, input: string): number | null {
  const result = spawnSync(
    ffprobe,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      input,
    ],
    { encoding: 'utf8' },
  );
  const value = Number(result.stdout?.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type EvalEntry = {
  file: string;
  segment: RecordingCase['segment'];
  ids: string[];
  language: string;
  category: string;
  transcript: string;
  cer: number | null;
  content_recall: number | null;
  rtf: number | null;
  audio_seconds: number | null;
  error: string | null;
};

function main(): void {
  const speedOnly = process.argv.includes('--speed-only');
  const resultsRoot = benchmarkResultsRoot();
  const whisper = resolveWhisper();
  if (!whisper.binary) throw new Error('没有找到 whisper.cpp 可执行文件');
  const ffmpeg = resolveFfmpegTool(
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  );
  const ffprobe = resolveFfmpegTool(
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
  );
  if (!ffmpeg || !ffprobe) throw new Error('没有找到应用自带的 ffmpeg/ffprobe');
  if (!fs.existsSync(RECORDING_DIR)) {
    throw new Error(`没有找到录音目录：${RECORDING_DIR}`);
  }

  const modelFilter = flagValue('--models')
    ?.split(',')
    .map((item) => item.trim());
  const discoveredModels = whisper.models.map((modelPath) => ({
    id: path
      .basename(modelPath)
      .replace(/^ggml-/, '')
      .replace(/\.bin$/, ''),
    path: modelPath,
  }));
  const allModels = selectRequestedSttModels(discoveredModels, modelFilter);
  if (allModels.length === 0) throw new Error('没有找到可用的 whisper 模型');

  const threadCount = Math.max(1, Math.min(os.cpus().length - 1, 8));
  const workRoot = path.join(resultsRoot, 'stt-human-work');
  fs.mkdirSync(workRoot, { recursive: true });

  process.stdout.write(
    `whisper: ${whisper.binary}\n模型: ${allModels.map((m) => m.id).join(', ')}\n` +
      `录音数: ${RECORDING_CASES.length}\n线程: ${threadCount}\n\n`,
  );

  // 音频转换和录音本身与 STT 模型无关，只做一次，所有模型复用同一份 16k wav。
  const preparedByFile = new Map<
    string,
    { wav: string; duration: number | null }
  >();
  RECORDING_CASES.forEach((recordingCase, index) => {
    const source = sourceRecordingPath(index + 1);
    const prepared = path.join(workRoot, recordingCase.file);
    if (!fs.existsSync(source)) {
      process.stdout.write(
        `跳过 ${recordingCase.file}：找不到源文件 ${source}\n`,
      );
      return;
    }
    if (!toSixteenKiloHertzMono(ffmpeg, source, prepared)) {
      process.stdout.write(`跳过 ${recordingCase.file}：ffmpeg 转换失败\n`);
      return;
    }
    preparedByFile.set(recordingCase.file, {
      wav: prepared,
      duration: audioDurationSeconds(ffprobe, prepared),
    });
  });

  const perModel: Record<string, unknown> = {};

  for (const model of allModels) {
    process.stdout.write(`\n=== ${model.id} ===\n`);
    const entries: EvalEntry[] = [];

    for (const recordingCase of RECORDING_CASES) {
      const prepared = preparedByFile.get(recordingCase.file);
      const language = referenceLanguage(recordingCase);
      const { category } = corpusById.get(recordingCase.ids[0])!;
      if (!prepared) {
        entries.push({
          file: recordingCase.file,
          segment: recordingCase.segment,
          ids: recordingCase.ids,
          language,
          category,
          transcript: '',
          cer: null,
          content_recall: null,
          rtf: null,
          audio_seconds: null,
          error: '源录音缺失或转换失败',
        });
        continue;
      }
      const outputBase = path.join(
        workRoot,
        `${model.id}-${recordingCase.file.replace(/\.wav$/, '')}`,
      );
      const startedAt = Date.now();
      const run = spawnSync(
        whisper.binary!,
        [
          '-m',
          model.path,
          '-f',
          prepared.wav,
          '-l',
          whisperLanguage(language),
          '-sns',
          '-t',
          String(threadCount),
          '-otxt',
          '-of',
          outputBase,
        ],
        { cwd: path.dirname(whisper.binary!), encoding: 'utf8' },
      );
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const textPath = `${outputBase}.txt`;
      if (run.status !== 0 || !fs.existsSync(textPath)) {
        entries.push({
          file: recordingCase.file,
          segment: recordingCase.segment,
          ids: recordingCase.ids,
          language,
          category,
          transcript: '',
          cer: null,
          content_recall: null,
          rtf: null,
          audio_seconds: prepared.duration,
          error: `whisper 退出码 ${run.status}: ${String(run.stderr ?? '')
            .trim()
            .split('\n')
            .slice(0, 3)
            .join(' / ')}`,
        });
        continue;
      }
      const transcript = fs.readFileSync(textPath, 'utf8').trim();
      const rtf = prepared.duration ? elapsedSeconds / prepared.duration : null;
      if (speedOnly) {
        entries.push({
          file: recordingCase.file,
          segment: recordingCase.segment,
          ids: recordingCase.ids,
          language,
          category,
          transcript: '',
          cer: null,
          content_recall: null,
          rtf,
          audio_seconds: prepared.duration,
          error: null,
        });
        process.stdout.write(
          `  ${recordingCase.file.padEnd(10)} [${recordingCase.segment}] RTF ${rtf?.toFixed(2) ?? 'n/a'}\n`,
        );
        continue;
      }
      const reference = referenceText(recordingCase);
      const cer =
        recordingCase.scoring === 'strict'
          ? characterErrorRate(reference, transcript)
          : null;
      const recall = contentRecall(reference, transcript);
      entries.push({
        file: recordingCase.file,
        segment: recordingCase.segment,
        ids: recordingCase.ids,
        language,
        category,
        transcript,
        cer,
        content_recall: recall.recall,
        rtf,
        audio_seconds: prepared.duration,
        error: null,
      });
      const cerLabel =
        cer === null ? '不适用(复述)' : `${(cer * 100).toFixed(1)}%`;
      process.stdout.write(
        `  ${recordingCase.file.padEnd(10)} [${recordingCase.segment}] CER ${cerLabel}  内容覆盖率 ${(recall.recall * 100).toFixed(1)}%\n`,
      );
    }

    const strictEntries = entries.filter(
      (entry): entry is EvalEntry & { cer: number } => entry.cer !== null,
    );
    const recallEntries = entries.filter(
      (entry): entry is EvalEntry & { content_recall: number } =>
        entry.content_recall !== null,
    );
    const bySegment: Record<
      string,
      {
        mean_cer: number | null;
        mean_content_recall: number | null;
        count: number;
      }
    > = {};
    for (const segment of ['A', 'B', 'C']) {
      const segStrict = strictEntries.filter((e) => e.segment === segment);
      const segRecall = recallEntries.filter((e) => e.segment === segment);
      bySegment[segment] = {
        mean_cer: mean(segStrict.map((e) => e.cer)),
        mean_content_recall: mean(segRecall.map((e) => e.content_recall)),
        count: entries.filter((e) => e.segment === segment).length,
      };
    }
    const byLanguage: Record<string, number | null> = {};
    for (const language of ['zh', 'en', 'zh-en']) {
      byLanguage[language] = mean(
        strictEntries.filter((e) => e.language === language).map((e) => e.cer),
      );
    }
    const rtfValues = entries
      .map((e) => e.rtf)
      .filter((v): v is number => v !== null);

    perModel[model.id] = {
      model_path: model.path,
      timed_count: rtfValues.length,
      scored_count: strictEntries.length + recallEntries.length,
      failed_count: entries.filter((e) => e.error !== null).length,
      mean_cer_strict_AC: mean(strictEntries.map((e) => e.cer)),
      mean_cer_by_language_AC: byLanguage,
      by_segment: bySegment,
      mean_rtf: mean(rtfValues),
      entries,
    };
    const summary = perModel[model.id] as {
      mean_cer_strict_AC: number | null;
      mean_rtf: number | null;
    };
    process.stdout.write(
      speedOnly
        ? `平均 RTF ${(summary.mean_rtf ?? 0).toFixed(2)}\n`
        : `A+C 段严格 CER 均值 ${((summary.mean_cer_strict_AC ?? 0) * 100).toFixed(1)}%  ` +
            `平均 RTF ${(summary.mean_rtf ?? 0).toFixed(2)}\n`,
    );
  }

  const outputPath = path.join(
    resultsRoot,
    speedOnly ? 'stt-human-speed.json' : 'stt-human.json',
  );
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        schema_version: 1,
        measured_at: new Date().toISOString(),
        whisper_binary: whisper.binary,
        recording_count: RECORDING_CASES.length,
        thread_count: threadCount,
        platform: {
          os: `${os.type()} ${os.release()}`,
          arch: os.arch(),
          cpu: os.cpus()[0]?.model ?? 'unknown',
          cpu_threads: os.cpus().length,
          total_memory_bytes: os.totalmem(),
          node: process.version,
        },
        speed_only: speedOnly,
        note: speedOnly
          ? '只测转写速度（RTF），用于跨机器硬件对比。同一批录音在不同机器上转写内容不会变，' +
            'CER/内容覆盖率不属于随机器变化的指标，因此本次运行未计算、未写入。'
          : '真人朗读录制。B 段为复述，只报内容覆盖率不报 CER。朗读者为中文母语者，' +
            '英文朗读存在自然的发音与措辞偏差，这是在测真实使用场景而非朗读准确度。',
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
