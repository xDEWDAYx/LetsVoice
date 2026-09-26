/**
 * 把基准结果 JSON 画成 SVG 图，输出到 docs/testing/charts/。
 *
 * 只画数据真的支持的图。缺哪份结果就跳过对应的图，不会用占位数据凑数。
 *
 *   npm run bench:charts
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import {
  gridPanel,
  groupedBarChart,
  horizontalBarChart,
  lineChart,
  scatterChart,
  stackedBarChart,
} from './chart-svg';
import {
  benchmarkResultsRoot,
  portablePathBasename,
  PROJECT_ROOT,
} from './tts-paths';

type Json = Record<string, any>;

const RESULTS = benchmarkResultsRoot();
const CHARTS = path.join(PROJECT_ROOT, 'docs', 'testing', 'charts');

/** 模型的展示顺序固定，颜色才能在所有图之间保持一致。 */
const MODEL_ORDER = [
  'kokoro-multi-lang-v1_0',
  'vits-melo-tts-zh_en',
  'moss-tts-nano-100m-onnx',
];

function readJson(file: string): Json | null {
  const full = path.join(RESULTS, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8')) as Json;
}

function readAll(prefix: string, requireField?: string): Json[] {
  if (!fs.existsSync(RESULTS)) return [];
  return fs
    .readdirSync(RESULTS)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .map((name) => readJson(name))
    .filter(
      (item): item is Json =>
        item !== null && (!requireField || item[requireField] !== undefined),
    )
    .sort(
      (a, b) =>
        MODEL_ORDER.indexOf(String(a.model_id)) -
        MODEL_ORDER.indexOf(String(b.model_id)),
    );
}

const written: string[] = [];

function write(name: string, svg: string): void {
  fs.mkdirSync(CHARTS, { recursive: true });
  fs.writeFileSync(path.join(CHARTS, name), `${svg}\n`);
  written.push(name);
}

const mib = (bytes: number) => bytes / 1024 / 1024;
const pct = (value: number) => `${(value * 100).toFixed(0)}%`;

const TODO_SCENARIO_LABELS: Record<string, string> = {
  绝对日期: 'Absolute date',
  多任务: 'Multiple tasks',
  相对日期: 'Relative date',
  模糊时间: 'Ambiguous time',
  周期任务: 'Recurring task',
  提醒日: 'Reminder date',
  去重: 'Deduplication',
  隐晦任务: 'Implicit task',
  边界: 'Boundary case',
  委婉语气: 'Indirect phrasing',
  假阳性: 'False positive',
  任务归属: 'Task ownership',
  无日期: 'No date',
  中英混合: 'Chinese-English',
  口语改口: 'Spoken correction',
  极短输入: 'Very short input',
  完成状态: 'Completion status',
  长文本: 'Long text',
  同日多任务: 'Same-day tasks',
};

const todoScenarioLabel = (value: string) =>
  TODO_SCENARIO_LABELS[value] ?? value;

const JEST_AREA_LABELS: Record<string, string> = {
  'Agent 与检索': 'Agent and retrieval',
  任务与日程: 'Tasks and scheduling',
  模型与语音: 'Models and speech',
  数据与可靠性: 'Data and reliability',
  界面与交互: 'Interface and interaction',
  主进程与系统: 'Main process and system',
  其他: 'Other',
};

const jestAreaLabel = (value: string) => JEST_AREA_LABELS[value] ?? value;

function shortModelName(value: string): string {
  const labels: Record<string, string> = {
    'qwen2.5:3b-instruct': 'Qwen2.5 3B',
    'qwen2.5:1.5b-instruct': 'Qwen2.5 1.5B',
    'phi4-mini:latest': 'Phi-4 Mini',
    'ministral-3:3b-instruct-2512-q4_K_M': 'Ministral-3 3B',
    'granite4:micro-h': 'Granite-4 Micro-H',
  };
  return labels[value] ?? value;
}

function compactCpuName(value: unknown): string {
  return String(value ?? 'Unknown CPU')
    .replace(/^\d+(?:st|nd|rd|th) Gen /, '')
    .replace(/^Intel\(R\) Core\(TM\) /, '')
    .replace(/^Intel Core /, '')
    .replace(/^Apple /, '');
}

function compactGpuName(value: unknown): string {
  return String(value ?? 'GPU not recorded')
    .replace(/^NVIDIA GeForce /, '')
    .replace(/^NVIDIA /, '')
    .replace(/ Laptop GPU$/, ' Laptop');
}

function roundedGiB(bytes: unknown): string {
  const size = Number(bytes);
  return Number.isFinite(size) && size > 0
    ? `${Math.round(size / 1024 / 1024 / 1024)} GiB`
    : 'unrecorded';
}

function compactGpuLine(value: unknown): string {
  const [rawName, rawMemory] = String(value ?? 'GPU not recorded')
    .split(',')
    .map((item) => item.trim());
  const memoryMiB = Number(rawMemory?.match(/[\d.]+/)?.[0] ?? NaN);
  const memory = Number.isFinite(memoryMiB)
    ? ` ${Math.round(memoryMiB / 1024)} GiB VRAM`
    : '';
  return `${compactGpuName(rawName)}${memory}`;
}

function compactPlatformLine(platform: Json | undefined): string {
  if (!platform) return 'Hardware not recorded';
  return `${compactCpuName(platform.cpu)} · ${roundedGiB(platform.total_memory_bytes)} RAM`;
}

/** 从 machine.json 生成，避免设备变化后图里的硬件说明变成手写旧数据。 */
function machineHardwareLine(id: string, profile: Json): string {
  const cpu = compactCpuName(profile.cpu_model);
  const cores = `${profile.cpu_physical_cores ?? '?'}C/${profile.cpu_logical_cores ?? '?'}T`;
  const memory = roundedGiB(profile.total_memory_bytes);
  const gpu = profile.gpu as Json | null;
  let system = String(profile.os ?? 'OS not recorded');
  if (system.startsWith('Windows')) system = 'Windows';
  else if (system.startsWith('Darwin')) system = 'macOS';
  if (profile.accelerator_class === 'apple-silicon') {
    return `${id} - ${cpu} · ${cores} · ${memory} unified memory · ${system}`;
  }
  const vram = gpu?.memory_total_mib
    ? `${Math.round(Number(gpu.memory_total_mib) / 1024)} GiB VRAM`
    : '';
  return `${id} - ${cpu} · ${cores} · ${compactGpuName(gpu?.name)} ${vram} · ${memory} RAM · ${system}`;
}

/* ------------------------------ TTS 性能 ------------------------------ */

function ttsCharts(): void {
  const models = readAll('tts-', 'overall').filter(
    (item) => item.by_language !== undefined,
  );
  if (models.length === 0) return;
  const names = models.map((model) => String(model.model_name));
  const env = `${compactPlatformLine(models[0].platform as Json)} · CPU-only, 4 threads · ${models[0].repeat_count} repetitions`;

  write(
    'tts-rtf-by-language.svg',
    groupedBarChart({
      title: 'TTS synthesis speed: P50 real-time factor by language',
      subtitle: env,
      categories: ['Chinese', 'English', 'Chinese-English'],
      series: models.map((model) => ({
        name: String(model.model_name),
        values: ['zh', 'en', 'zh-en'].map(
          (language) => model.by_language[language].p50_rtf as number,
        ),
      })),
      yLabel: 'RTF (lower is faster)',
      referenceLine: { value: 1, label: 'RTF = 1 (real-time playback)' },
      caption:
        'RTF is synthesis time divided by audio duration. All three models are faster than real time in every language group.',
    }),
  );

  const categories = Object.keys(models[0].by_category as Json);
  write(
    'tts-rtf-p95-by-category.svg',
    groupedBarChart({
      title: 'TTS synthesis speed: P95 RTF by content category',
      subtitle: env,
      categories,
      series: models.map((model) => ({
        name: String(model.model_name),
        values: categories.map(
          (category) => model.by_category[category]?.p95_rtf ?? null,
        ),
      })),
      yLabel: 'P95 RTF',
      referenceLine: { value: 1, label: 'RTF = 1' },
      caption: (() => {
        // 每个模型在所有类目上的最差 P95：它决定这个模型还剩多少实时余量。
        const worst = models
          .map((model) => ({
            name: String(model.model_name),
            p95: Math.max(
              ...categories
                .map((category) =>
                  Number(model.by_category[category]?.p95_rtf ?? NaN),
                )
                .filter((value) => Number.isFinite(value)),
            ),
          }))
          .filter((item) => Number.isFinite(item.p95))
          .sort((a, b) => b.p95 - a.p95);
        if (worst.length === 0) return undefined;
        const tightest = worst[0];
        const safest = worst[worst.length - 1];
        return `P95 exposes the worst case, not the average. ${tightest.name} peaks at ${tightest.p95.toFixed(2)} - still under real time, but with only ${((1 - tightest.p95) * 100).toFixed(0)}% headroom, so a slower host would cross it; ${safest.name} keeps ${((1 - safest.p95) * 100).toFixed(0)}%.`;
      })(),
    }),
  );

  write(
    'tts-rtf-vs-length.svg',
    lineChart({
      title: 'TTS synthesis speed by input length',
      subtitle: env,
      series: models.map((model) => ({
        name: String(model.model_name),
        points: (model.cases as Json[])
          .filter((item) => item.median_rtf !== null)
          .map((item) => ({
            x: Number(item.text_length),
            y: Number(item.median_rtf),
          })),
      })),
      xLabel: 'Input length (characters)',
      yLabel: 'Median RTF',
      formatY: (value) => value.toFixed(2),
      referenceLine: { value: 1, label: 'RTF = 1' },
      caption:
        'RTF is broadly stable with length, indicating that synthesis time scales approximately linearly with the generated audio.',
    }),
  );

  write(
    'tts-synthesis-vs-audio.svg',
    scatterChart({
      title: 'Synthesis time vs generated audio duration',
      subtitle: env,
      series: models.map((model) => ({
        name: String(model.model_name),
        points: (model.cases as Json[])
          .filter((item) => item.median_rtf !== null)
          .map((item) => ({
            x: Number(item.median_audio_seconds),
            y: Number(item.median_synthesis_ms) / 1000,
          })),
      })),
      xLabel: 'Audio duration (seconds)',
      yLabel: 'Synthesis time (seconds)',
      formatX: (value) => `${value.toFixed(0)}s`,
      formatY: (value) => `${value.toFixed(0)}s`,
      diagonal: true,
      caption:
        'Every point is below the red real-time line: all three models are faster than playback on all 36 texts.',
    }),
  );

  write(
    'tts-peak-memory.svg',
    horizontalBarChart({
      title: 'Peak TTS memory across the 36-text corpus',
      subtitle: env,
      categories: names,
      series: [
        {
          name: 'Peak RSS',
          values: models.map((model) => mib(Number(model.peak_rss_bytes))),
        },
      ],
      format: (value) =>
        value >= 1024
          ? `${(value / 1024).toFixed(1)} GiB`
          : `${value.toFixed(0)} MiB`,
      caption:
        'MOSS peaks an order of magnitude above the alternatives. This is transient per-request cost, not a cumulative leak.',
    }),
  );
}

/* ------------------------------ 内存行为 ------------------------------ */

function memoryCharts(): void {
  const probes = readAll('tts-memory-', 'phases');
  if (probes.length > 0) {
    write(
      'tts-memory-iterations.svg',
      lineChart({
        title: 'Resident memory across repeated synthesis calls',
        subtitle: `${compactPlatformLine(probes[0].platform as Json | undefined)} · CPU inference · forced GC before each sample`,
        series: probes.map((probe) => ({
          name: String(probe.model_name),
          points: (probe.phases as Json[]).flatMap((phase, phaseIndex) =>
            (phase.samples as Json[]).map((sample) => ({
              x: phaseIndex * 8 + Number(sample.iteration),
              y: mib(Number(sample.rss_bytes)),
            })),
          ),
        })),
        xLabel: 'Synthesis call (1–8 short, 9–16 long)',
        yLabel: 'RSS after forced GC (MiB)',
        logY: true,
        formatY: (value) =>
          value >= 1024
            ? `${(value / 1024).toFixed(1)}G`
            : `${value.toFixed(0)}M`,
        caption:
          'All three series plateau. The step at call 9 is a one-off change caused by the longer text, not a memory leak.',
      }),
    );
  }

  const lengths = readAll('tts-length-', 'samples');
  if (lengths.length > 0) {
    const machineMemory = mib(Number(lengths[0].machine_memory_bytes));
    write(
      'tts-memory-vs-length.svg',
      lineChart({
        title: 'Peak memory by input length',
        subtitle: `Host RAM ${(machineMemory / 1024).toFixed(1)} GiB · CPU inference · 50 ms sampling${lengths[0].platform?.cpu ? ` · ${compactCpuName(lengths[0].platform.cpu)}` : ' · CPU model not recorded'}`,
        series: lengths.map((probe) => ({
          name: String(probe.model_name),
          points: (probe.samples as Json[])
            .filter((sample) => sample.error === null)
            .map((sample) => ({
              x: Number(sample.text_length),
              y: mib(Number(sample.peak_rss_bytes)),
            })),
        })),
        xLabel: 'Input length (characters)',
        yLabel: 'Peak RSS (log scale)',
        logY: true,
        formatY: (value) =>
          value >= 1024
            ? `${(value / 1024).toFixed(0)} GiB`
            : `${value.toFixed(0)} MiB`,
        referenceLine: {
          value: 16 * 1024,
          label: 'Physical memory limit of a 16 GiB machine',
        },
        caption:
          'The two sherpa models remain nearly flat, while MOSS requires about 10 GiB for the 1,196-character input.',
      }),
    );
  }
}

/* -------------------------------- ASR -------------------------------- */

function asrCharts(): void {
  const asr = readJson('tts-asr.json');
  const models = readAll('tts-', 'overall').filter(
    (item) => item.by_language !== undefined,
  );
  if (!asr || models.length === 0) return;
  const entries = models
    .map((model) => ({
      name: String(model.model_name),
      data: (asr.models as Json)[String(model.model_id)],
    }))
    .filter((item) => item.data);
  if (entries.length === 0) return;

  write(
    'tts-cer-by-language.svg',
    groupedBarChart({
      title: 'Whisper back-transcription CER by language',
      subtitle: `Back-transcription model ${portablePathBasename(String(asr.whisper_model))} · lower is better`,
      categories: ['Chinese', 'English', 'Chinese-English'],
      series: entries.map((item) => ({
        name: item.name,
        values: ['zh', 'en', 'zh-en'].map(
          (language) => item.data.mean_cer_by_language[language] as number,
        ),
      })),
      yLabel: 'CER (lower is better)',
      format: (value) => pct(value),
      caption:
        'This is a low-confidence proxy because ASR errors are included. It supports comparison but cannot replace listening tests.',
    }),
  );

  const categories = Object.keys(entries[0].data.mean_cer_by_category as Json);
  write(
    'tts-cer-by-category.svg',
    groupedBarChart({
      title: 'Whisper back-transcription CER by content category',
      subtitle:
        'Names and abbreviations expose differences in vocabulary coverage',
      categories,
      series: entries.map((item) => ({
        name: item.name,
        values: categories.map(
          (category) => item.data.mean_cer_by_category[category] ?? null,
        ),
      })),
      yLabel: 'CER',
      format: (value) => pct(value),
      caption: (() => {
        // 找出「模型之间差距最大的那个类目」——差异集中在哪里比平均 CER 有用得多。
        const spread = categories
          .map((category) => {
            const values = entries
              .map((item) =>
                Number(item.data.mean_cer_by_category[category] ?? NaN),
              )
              .filter((value) => Number.isFinite(value));
            return { category, gap: Math.max(...values) - Math.min(...values) };
          })
          .filter((item) => Number.isFinite(item.gap))
          .sort((a, b) => b.gap - a.gap)[0];
        return spread
          ? `Differences concentrate in vocabulary, not in general speech: the models are within a few points on plain text but split by ${pct(spread.gap)} on ${spread.category}. Pick by the categories your content actually contains.`
          : undefined;
      })(),
    }),
  );

  const lengths = readAll('tts-length-', 'samples');
  if (lengths.length > 0) {
    write(
      'tts-tradeoff.svg',
      scatterChart({
        title: 'Three-way trade-off: speed, memory and intelligibility',
        subtitle:
          'Left is faster; lower uses less memory; labels show mean CER',
        series: entries.map((item, index) => {
          const model = models[index];
          const length = lengths.find(
            (probe) => probe.model_id === model.model_id,
          );
          return {
            // 这里要一位小数：Kokoro 10.3% 与 MOSS 9.7% 取整后都是 10%，区分就没了
            name: `${item.name} (CER ${(item.data.mean_cer * 100).toFixed(1)}%)`,
            points: [
              {
                x: Number(model.overall.p50_rtf),
                y: mib(
                  Number(length?.max_peak_rss_bytes ?? model.peak_rss_bytes),
                ),
              },
            ],
          };
        }),
        xLabel: 'P50 RTF (lower is faster)',
        yLabel: 'Longest-input peak RSS (MiB)',
        formatX: (value) => value.toFixed(2),
        formatY: (value) =>
          value >= 1024
            ? `${(value / 1024).toFixed(0)}G`
            : `${value.toFixed(0)}M`,
        caption:
          'No model wins all three metrics: MOSS is fastest but memory-heavy; MeloTTS is lightest but has the weakest proxy intelligibility.',
      }),
    );
  }
}

/* ------------------------------ 真人 STT 评测 ------------------------------ */

const STT_MODEL_ORDER = ['tiny', 'base', 'small', 'large-v1'];

function sttCharts(): void {
  const data = readJson('stt-human.json');
  if (!data) return;
  const modelIds = Object.keys(data.models as Json).sort(
    (a, b) => STT_MODEL_ORDER.indexOf(a) - STT_MODEL_ORDER.indexOf(b),
  );
  if (modelIds.length === 0) return;
  const models = data.models as Json;
  const subtitle = `Human recordings · Chinese-native speaker · ${modelIds.length} whisper.cpp models · docs/testing/stt-recording-protocol.md`;
  // 旧版结果缺少 platform，不能用另一个测试文件的设备配置代替。
  const speedSubtitle = `${compactPlatformLine(data.platform as Json | undefined)} · whisper.cpp · ${data.thread_count} threads · ${data.recording_count} human recordings`;

  write(
    'stt-cer-by-segment.svg',
    groupedBarChart({
      title: 'Human-recorded STT CER: quiet speech vs background noise',
      subtitle,
      categories: ['Segment A · quiet', 'Segment C · background noise'],
      series: modelIds.map((id) => ({
        name: id,
        values: ['A', 'C'].map(
          (segment) =>
            (models[id].by_segment as Json)[segment].mean_cer as number,
        ),
      })),
      yLabel: 'CER (lower is better)',
      format: (value) => pct(value),
      caption:
        'Segment C is a nine-text subset of segment A, read by the same speaker with background noise. Each text was recorded once, so noise and natural reading variation cannot be separated.',
    }),
  );

  write(
    'stt-cer-by-language.svg',
    groupedBarChart({
      title: 'Human-recorded STT CER by language (verbatim segments A+C)',
      subtitle,
      categories: ['Chinese', 'English', 'Chinese-English'],
      series: modelIds.map((id) => ({
        name: id,
        values: ['zh', 'en', 'zh-en'].map(
          (language) =>
            (models[id].mean_cer_by_language_AC as Json)[language] as number,
        ),
      })),
      yLabel: 'CER (lower is better)',
      format: (value) => pct(value),
      caption:
        'The speaker is a native Chinese speaker; natural pronunciation and wording variation in English reflect the intended real-use setting.',
    }),
  );

  write(
    'stt-content-recall-by-segment.svg',
    groupedBarChart({
      title: 'Content recall across three recording conditions',
      subtitle: `${subtitle} · recall measures source words/characters present in the transcript, ignoring order`,
      categories: [
        'A Quiet reading (verbatim)',
        'B Natural paraphrase',
        'C Background noise (verbatim)',
      ],
      series: modelIds.map((id) => ({
        name: id,
        values: ['A', 'B', 'C'].map(
          (segment) =>
            (models[id].by_segment as Json)[segment]
              .mean_content_recall as number,
        ),
      })),
      yLabel: 'Content recall',
      format: (value) => pct(value),
      caption:
        'Segment B is a natural paraphrase, so CER is not appropriate. Recall includes function words; relative A/B/C differences are more informative than the absolute values.',
    }),
  );

  write(
    'stt-speed-vs-accuracy.svg',
    scatterChart({
      title: 'STT model selection: speed vs accuracy',
      subtitle: speedSubtitle,
      series: modelIds.map((id) => ({
        name: `${id} (CER ${pct(models[id].mean_cer_strict_AC as number)})`,
        points: [
          {
            x: Number(models[id].mean_rtf),
            y: Number(models[id].mean_cer_strict_AC) * 100,
          },
        ],
      })),
      xLabel: 'RTF (lower is faster, CPU inference)',
      yLabel: 'CER % (lower is better)',
      formatX: (value) => value.toFixed(2),
      formatY: (value) => `${value.toFixed(0)}%`,
      caption:
        'Lower-left is better. Larger models do not produce a linear reduction in CER, so selection should use measured trade-offs.',
    }),
  );
}

/* ---------------------------- 待办提取评测 ---------------------------- */

function todoCharts(): void {
  const data = readJson('todo-extraction-eval.json');
  if (!data) return;
  const mean = data.mean_across_rounds as Json;
  const rounds = data.rounds as Json[];

  write(
    'todo-dev-vs-holdout.svg',
    groupedBarChart({
      title: 'Todo extraction: development vs holdout',
      subtitle: `${data.model} · temperature ${data.temperature} · ${data.rounds_run}-round mean · ${data.case_count} cases`,
      categories: [
        'Case pass rate',
        'Precision',
        'Recall',
        'F1',
        'Date accuracy',
      ],
      series: [
        {
          name: 'Development (22 prompt-tuning cases)',
          values: [
            mean.dev.case_pass_rate,
            mean.dev.precision,
            mean.dev.recall,
            mean.dev.f1,
            mean.dev.date_accuracy,
          ],
        },
        {
          name: 'Holdout (32 cases written after prompt freeze)',
          values: [
            mean.holdout.case_pass_rate,
            mean.holdout.precision,
            mean.holdout.recall,
            mean.holdout.f1,
            mean.holdout.date_accuracy,
          ],
        },
      ],
      yLabel: 'Rate',
      format: (value) => pct(value),
      caption:
        'The difference is the generalisation gap. The 90.9% development score equals the earlier 20/22 result, which was measured on tuned cases.',
    }),
  );

  const scenarios = Object.keys(rounds[0].by_scenario as Json);
  const ordered = scenarios
    .map((scenario) => ({
      scenario,
      item: (rounds[0].by_scenario as Json)[scenario],
    }))
    .sort((a, b) => a.item.case_pass_rate - b.item.case_pass_rate);
  write(
    'todo-by-scenario.svg',
    horizontalBarChart({
      title: 'Todo extraction: case pass rate by scenario (round 1)',
      subtitle:
        'A case passes only when extraction, dates and recurrence are all correct',
      categories: ordered.map((entry) => todoScenarioLabel(entry.scenario)),
      series: [
        {
          name: 'Pass rate',
          values: ordered.map((entry) => entry.item.case_pass_rate as number),
        },
      ],
      annotations: ordered.map(
        (entry) => `${entry.item.passed_cases}/${entry.item.case_count}`,
      ),
      max: 1,
      caption:
        'False-positive, ownership and implicit-task cases pass; same-day multi-task and long-text cases remain weakest.',
    }),
  );

  // 失败原因构成：问题描述里带前缀，直接按前缀归类。
  const buckets: { label: string; test: (problem: string) => boolean }[] = [
    { label: 'Complete miss', test: (p) => p.startsWith('漏检') },
    {
      label: 'Merged into another task',
      test: (p) => p.startsWith('合并进其他任务'),
    },
    { label: 'Incorrect date', test: (p) => p.startsWith('日期错误') },
    {
      label: 'Over-extraction (false positive)',
      test: (p) => p.startsWith('多抽'),
    },
    {
      label: 'Incorrect recurrence',
      test: (p) => p.startsWith('重复类型错误'),
    },
  ];
  const counts = buckets.map(
    (bucket) =>
      (rounds[0].scores as Json[])
        .flatMap((score) => score.problems as string[])
        .filter((problem) => bucket.test(problem)).length,
  );
  if (counts.some((value) => value > 0)) {
    write(
      'todo-failure-types.svg',
      horizontalBarChart({
        title: 'Todo extraction: failure types (round 1, all 54 cases)',
        subtitle:
          'Occurrences by problem type; one case may contain multiple failure types',
        categories: buckets.map((bucket) => bucket.label),
        series: [{ name: 'Occurrences', values: counts }],
        format: (value) => `${value.toFixed(0)}`,
        caption:
          'A merge compresses parallel clauses into one task: the content remains visible but loses a separate item and date, unlike a complete miss.',
      }),
    );
  }

  write(
    'todo-round-stability.svg',
    lineChart({
      title: 'Todo extraction: multi-round stability',
      subtitle: `${data.rounds_run} repeated rounds at temperature ${data.temperature}`,
      series: [
        {
          name: 'Precision',
          points: rounds.map((round) => ({
            x: Number(round.round),
            y: Number(round.overall.precision),
          })),
        },
        {
          name: 'Recall',
          points: rounds.map((round) => ({
            x: Number(round.round),
            y: Number(round.overall.recall),
          })),
        },
        {
          name: 'F1',
          points: rounds.map((round) => ({
            x: Number(round.round),
            y: Number(round.overall.f1),
          })),
        },
        {
          name: 'Date accuracy',
          points: rounds.map((round) => ({
            x: Number(round.round),
            y: Number(round.overall.date_accuracy),
          })),
        },
      ],
      xLabel: 'Round',
      yLabel: 'Rate',
      formatX: (value) => `Round ${value.toFixed(0)}`,
      formatY: (value) => pct(value),
      showPointLabels: true,
      // 四条线全在 82%-95% 之间。y 轴从 0 起会把它们压成一束，
      // 点上的数值互相重叠，也看不出「哪个指标其实在抖」。
      yFromZero: false,
      caption: (() => {
        // 逐个指标算跨轮次的极差，挑出唯一真正在抖的那个。
        const metrics = [
          ['Precision', 'precision'],
          ['Recall', 'recall'],
          ['F1', 'f1'],
          ['Date accuracy', 'date_accuracy'],
        ] as const;
        const spreads = metrics
          .map(([label, key]) => {
            const values = rounds
              .map((round) => Number((round.overall as Json)[key]))
              .filter((value) => Number.isFinite(value));
            return {
              label,
              spread: (Math.max(...values) - Math.min(...values)) * 100,
            };
          })
          .sort((a, b) => b.spread - a.spread);
        const worst = spreads[0];
        const rest = spreads[spreads.length - 1];
        return `Note the zoomed axis: the whole range is only a few points. ${rest.label} varies by ${rest.spread.toFixed(1)}pt across rounds, while ${worst.label} spans ${worst.spread.toFixed(1)}pt; repeat runs matter most for the latter.`;
      })(),
    }),
  );
}

/* ------------------------------ Agent 评测 ------------------------------ */

function agentCharts(): void {
  const data = readJson('agent-eval.json');
  if (!data) return;
  const rounds = data.rounds as Json[];
  const mean = data.mean_across_rounds as Json;
  const subtitle = `${data.model} · ${data.embedding_model} · ${data.rounds_run} round(s) · ${data.dataset.task_count} tasks`;
  const latencySubtitle = `${subtitle} · ${compactPlatformLine(data.platform as Json)} · local inference`;

  write(
    'agent-dev-vs-holdout.svg',
    groupedBarChart({
      title: 'End-to-end Agent: development vs holdout',
      subtitle,
      categories: [
        'Strict completion',
        'Fact coverage',
        'Answer mode',
        'Judge pass',
        'Groundedness',
      ],
      series: [
        {
          name: `Development (${mean.dev.case_count})`,
          values: [
            mean.dev.case_pass_rate,
            mean.dev.fact_coverage,
            mean.dev.answer_mode_accuracy,
            mean.dev.judge_pass_rate,
            mean.dev.groundedness,
          ],
        },
        {
          name: `Holdout (${mean.holdout.case_count})`,
          values: [
            mean.holdout.case_pass_rate,
            mean.holdout.fact_coverage,
            mean.holdout.answer_mode_accuracy,
            mean.holdout.judge_pass_rate,
            mean.holdout.groundedness,
          ],
        },
      ],
      yLabel: 'Rate',
      format: pct,
      caption:
        'Strict completion is rule-based. Judge and groundedness scores are not human-calibrated and cannot support final conclusions alone.',
    }),
  );

  // 分母必须写进图里：图会被单独复制进幻灯片，脱离报告正文后
  // 一行三位小数的 IR 指标很容易被当成大样本结果。
  const retrievalRuns = rounds.reduce(
    (sum, round) =>
      sum +
      (round.cases as Json[]).filter(
        (item) => item.score?.retrieval?.recall_at_8 !== null,
      ).length,
    0,
  );
  const retrievalTaskCount = new Set(
    rounds.flatMap((round) =>
      (round.cases as Json[])
        .filter((item) => item.score?.retrieval?.recall_at_8 !== null)
        .map((item) => String(item.score.id)),
    ),
  ).size;

  write(
    'agent-retrieval.svg',
    groupedBarChart({
      title: `Ranking quality of the Agent's first real search (n=${retrievalRuns})`,
      subtitle: `${subtitle} · ${retrievalTaskCount} tasks require whole-library retrieval`,
      categories: [
        'Recall@1',
        'Recall@3',
        'Recall@5',
        'Recall@8',
        'MRR',
        'nDCG@8',
      ],
      series: [
        {
          name: 'First search_notes result set',
          values: [
            mean.overall.recall_at_1,
            mean.overall.recall_at_3,
            mean.overall.recall_at_5,
            mean.overall.recall_at_8,
            mean.overall.mrr,
            mean.overall.ndcg_at_8,
          ],
        },
      ],
      yLabel: 'Rate',
      format: pct,
      caption:
        `Only whole-library retrieval tasks are counted; linked notes are preloaded. One task changes the score by about ` +
        `${(100 / Math.max(retrievalTaskCount, 1)).toFixed(1)} points, so this is directional evidence.`,
    }),
  );

  const scenarios = Object.keys(rounds[0].by_scenario as Json);
  const scenarioMean = (scenario: string, field: string): number =>
    rounds.reduce(
      (sum, round) => sum + Number(round.by_scenario[scenario][field] ?? 0),
      0,
    ) / rounds.length;
  const ordered = scenarios.sort(
    (left, right) =>
      scenarioMean(left, 'case_pass_rate') -
      scenarioMean(right, 'case_pass_rate'),
  );
  write(
    'agent-by-scenario.svg',
    horizontalBarChart({
      title: 'End-to-end Agent strict completion by task type',
      subtitle,
      categories: ordered,
      series: [
        {
          name: 'Strict completion',
          values: ordered.map((scenario) =>
            scenarioMean(scenario, 'case_pass_rate'),
          ),
        },
      ],
      max: 1,
      format: pct,
      caption:
        'Strict completion requires correct facts, answer mode, scope and required side effects; failure of any condition fails the task.',
    }),
  );

  write(
    'agent-efficiency.svg',
    groupedBarChart({
      title: 'Agent tool calls and model-loop turns',
      subtitle,
      categories: ordered,
      series: [
        {
          name: 'Mean tool calls',
          values: ordered.map((scenario) =>
            scenarioMean(scenario, 'mean_tool_calls'),
          ),
        },
        {
          name: 'Mean model turns',
          values: ordered.map((scenario) =>
            scenarioMean(scenario, 'mean_model_turns'),
          ),
        },
      ],
      yLabel: 'Count per task',
      format: (value) => value.toFixed(2),
      caption:
        "Model turns equal tool-call turns plus the final-answer turn, matching the orchestrator's six-step budget.",
    }),
  );

  const meanAgentSeconds = (scenario: string): number => {
    const values = rounds.flatMap((round) =>
      (round.cases as Json[])
        .filter((item) => item.task.scenario === scenario)
        .map((item) => Number(item.agent_elapsed_ms) / 1000),
    );
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  write(
    'agent-latency-by-scenario.svg',
    groupedBarChart({
      title: 'End-to-end Agent latency (excluding Judge)',
      subtitle: latencySubtitle,
      categories: ordered,
      series: [
        {
          name: 'Mean Agent latency',
          values: ordered.map(meanAgentSeconds),
        },
      ],
      yLabel: 'Seconds per task',
      format: (value) => `${value.toFixed(1)}s`,
      caption:
        'Timing starts at the Agent orchestrator and ends with the final answer. Judge latency is measured separately.',
    }),
  );

  write(
    'agent-round-stability.svg',
    lineChart({
      title: 'End-to-end Agent stability across rounds',
      subtitle,
      series: [
        {
          name: 'Strict completion',
          points: rounds.map((round) => ({
            x: Number(round.round),
            y: Number(round.overall.case_pass_rate),
          })),
        },
        {
          name: 'Judge pass rate',
          points: rounds.map((round) => ({
            x: Number(round.round),
            y: Number(round.overall.judge_pass_rate),
          })),
        },
        {
          name: 'Fact coverage',
          points: rounds.map((round) => ({
            x: Number(round.round),
            y: Number(round.overall.fact_coverage),
          })),
        },
      ],
      xLabel: 'Round',
      yLabel: 'Rate',
      formatX: (value) => `Round ${value.toFixed(0)}`,
      formatY: pct,
      showPointLabels: true,
      caption:
        'Repeated runs use the same model, temperature and dataset; between-round variation reflects stochastic tool choice and answers.',
    }),
  );
}

/* ------------------------------ 检索质量（跳过 LLM） ------------------------------ */

function retrievalCharts(): void {
  const data = readJson('embedding-retrieval.json');
  if (!data) return;
  const overall = data.overall as Json;
  const bySplit = data.by_split as Json;
  const byScenario = data.by_scenario as Json;
  const subtitle = `${data.embedding_model} · ${data.dataset.gold_task_count} gold-labelled tasks · instruction used directly as query · no LLM`;

  const metricCategories = [
    'Recall@1',
    'Recall@3',
    'Recall@5',
    'Recall@8',
    'MRR',
    'nDCG@8',
  ];
  const metricValues = (bucket: Json) => [
    bucket.recall_at_1,
    bucket.recall_at_3,
    bucket.recall_at_5,
    bucket.recall_at_8,
    bucket.mrr,
    bucket.ndcg_at_8,
  ];

  write(
    'retrieval-dev-vs-holdout.svg',
    groupedBarChart({
      title: 'Retrieval quality: development vs holdout (direct query)',
      subtitle,
      categories: metricCategories,
      series: [
        {
          name: `Development (${bySplit.dev.case_count})`,
          values: metricValues(bySplit.dev),
        },
        {
          name: `Holdout (${bySplit.holdout.case_count})`,
          values: metricValues(bySplit.holdout),
        },
      ],
      yLabel: 'Rate',
      format: pct,
      caption:
        'Development and holdout were paired at corpus design (12 each). The gap measures retrieval stability on unseen notes and queries without LLM tool-use effects.',
    }),
  );

  write(
    'retrieval-by-scenario.svg',
    groupedBarChart({
      title: 'Retrieval quality by scenario',
      subtitle,
      categories: metricCategories,
      series: [
        {
          name: `Retrieval (${byScenario.retrieval.case_count}, one relevant note)`,
          values: metricValues(byScenario.retrieval),
        },
        {
          name: `Ambiguous (${byScenario.ambiguous.case_count}, multiple relevant notes)`,
          values: metricValues(byScenario.ambiguous),
        },
      ],
      yLabel: 'Rate',
      format: pct,
      caption:
        'Ambiguous tasks have multiple gold notes (for example, similar Atlas and Phoenix projects), making perfect Recall@K inherently harder.',
    }),
  );

  const agentData = readJson('agent-eval.json');
  if (agentData) {
    const agentMean = (agentData.mean_across_rounds as Json).overall as Json;
    write(
      'retrieval-vs-llm-mediated.svg',
      groupedBarChart({
        title: 'Retrieval quality: direct query vs LLM-mediated use',
        subtitle: `Same mixed retrieval (keyword + bge-m3 + RRF); only query generation differs`,
        categories: metricCategories,
        series: [
          {
            name: 'Direct task instruction query',
            values: metricValues(overall),
          },
          {
            name: `Agent/LLM search decision and query (${agentData.model})`,
            values: metricValues(agentMean),
          },
        ],
        yLabel: 'Rate',
        format: pct,
        caption:
          'The denominators differ: direct evaluation uses gold-labelled tasks, while the Agent series requires a real search_notes call. The gap diagnoses LLM retrieval use, not ranking alone.',
      }),
    );
  }
}

/* ------------------------------ Jest 清单 ------------------------------ */

function jestCharts(): void {
  const inventory = path.join(
    PROJECT_ROOT,
    'docs',
    'testing',
    'jest-test-inventory.md',
  );
  if (!fs.existsSync(inventory)) return;
  const lines = fs.readFileSync(inventory, 'utf8').split('\n');
  const start = lines.findIndex((line) => line.startsWith('## 按功能域'));
  if (start === -1) return;
  const rows: { area: string; passed: number; skipped: number }[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('## ') && index > start) break;
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 7) continue;
    if (!/^\d+$/.test(cells[2])) continue;
    rows.push({
      area: cells[1],
      passed: Number(cells[4]),
      skipped: Number(cells[5]),
    });
  }
  if (rows.length === 0) return;
  write(
    'jest-by-area.svg',
    stackedBarChart({
      title: 'Jest regression tests by functional area',
      subtitle:
        'Rendered directly from the machine-readable jest --json report',
      categories: rows.map((row) => jestAreaLabel(row.area)),
      series: [
        { name: 'Passed', values: rows.map((row) => row.passed) },
        {
          name: 'Skipped (external dependencies such as Ollama or Electron)',
          values: rows.map((row) => row.skipped),
        },
      ],
      annotations: rows.map((row) => `Total ${row.passed + row.skipped}`),
      caption:
        'These regression tests show that existing behaviour remains intact after changes; they do not measure model accuracy.',
    }),
  );
}

/* --------------------------- LLM 横向扫描 --------------------------- */

function llmCharts(): void {
  const sweep = readJson('llm-sweep.json');
  const runtime = readJson('llm-runtime.json');
  const source = sweep ?? runtime;
  if (!source) return;

  // 扫描文件和单独的 runtime 文件结构不同，统一成一份数组再画
  const entries: Json[] = sweep
    ? (sweep.models as Json[])
    : (runtime!.models as Json[]).map((item) => ({
        model: item.model,
        parameter_size: item.details?.parameter_size ?? null,
        disk_size_bytes: item.disk_size_bytes ?? null,
        accuracy: null,
        runtime: {
          median_tokens_per_second: item.median_tokens_per_second,
          median_first_token_latency_ms: item.median_first_token_latency_ms,
          gpu_offload_ratio: item.gpu_offload_ratio,
          resident_vram_bytes: item.resident_vram_bytes,
          peak_gpu_memory_mib: item.peak_gpu_memory_mib,
        },
      }));
  const usable = entries.filter((item) => item.runtime);
  if (usable.length === 0) return;

  const names = usable.map((item) =>
    item.parameter_size
      ? `${shortModelName(String(item.model))} (${item.parameter_size})`
      : shortModelName(String(item.model)),
  );
  const shortNames = usable.map((item) => shortModelName(String(item.model)));
  const env = `${compactGpuLine(source.gpu)} · ${compactPlatformLine(source.platform as Json)} · Ollama`;

  write(
    'llm-throughput.svg',
    horizontalBarChart({
      title: 'Local LLM generation throughput (tokens/s)',
      subtitle: env,
      categories: shortNames,
      series: [
        {
          name: 'Median tokens/s',
          values: usable.map((item) =>
            Number(item.runtime.median_tokens_per_second ?? 0),
          ),
        },
      ],
      format: (value) => `${value.toFixed(1)} tok/s`,
      caption:
        'Median across three prompt lengths and three runs each, using Ollama-reported eval_count / eval_duration.',
    }),
  );

  write(
    'llm-first-token.svg',
    horizontalBarChart({
      title: 'First-token latency (model load + prompt evaluation)',
      subtitle: env,
      categories: names,
      series: [
        {
          name: 'Median first-token latency',
          values: usable.map((item) =>
            Number(item.runtime.median_first_token_latency_ms ?? 0),
          ),
        },
      ],
      format: (value) => `${value.toFixed(0)} ms`,
      caption:
        'This measures the delay between user action and the first visible token, which affects responsiveness more directly than total throughput.',
    }),
  );

  write(
    'llm-gpu-offload.svg',
    groupedBarChart({
      title: 'GPU offload ratio and VRAM utilisation',
      subtitle: env,
      categories: shortNames,
      series: [
        {
          name: 'GPU offload ratio (1 = fully in VRAM)',
          values: usable.map((item) =>
            Number(item.runtime.gpu_offload_ratio ?? 0),
          ),
        },
        {
          name: 'Used VRAM / total VRAM',
          values: usable.map((item) => {
            const peak = Number(item.runtime.peak_gpu_memory_mib ?? 0);
            const total = 6144;
            return peak > 0 ? Math.min(1, peak / total) : 0;
          }),
        },
      ],
      yLabel: 'Ratio',
      format: pct,
      referenceLine: { value: 1, label: 'VRAM limit / full offload' },
      caption:
        'The offload ratio is Ollama /api/ps size_vram divided by size. Values below 1 mean some layers fall back to CPU.',
    }),
  );

  // 假阳性率单独出一张：它会把 F1 的排名整个翻过来。
  // 对待办应用来说，凭空造任务比漏掉更糟 —— 用户的清单会被垃圾污染。
  const withFp = usable.filter(
    (item) =>
      item.accuracy &&
      item.accuracy.zero_task_false_positive_rate !== null &&
      item.accuracy.zero_task_false_positive_rate !== undefined,
  );
  if (withFp.length > 0) {
    write(
      'llm-false-positive.svg',
      groupedBarChart({
        title: 'False-positive rate on zero-task cases',
        subtitle:
          'Share of texts with no todo that still produced at least one item · lower is better',
        categories: withFp.map((item) => shortModelName(String(item.model))),
        series: [
          {
            name: 'Zero-task false-positive rate',
            values: withFp.map((item) =>
              Number(item.accuracy.zero_task_false_positive_rate),
            ),
          },
          {
            name: 'Holdout F1 (reference)',
            values: withFp.map((item) => Number(item.accuracy.holdout_f1 ?? 0)),
          },
        ],
        yLabel: 'Rate',
        format: pct,
        caption:
          'F1 alone can hide models that invent tasks in many zero-task texts, reversing the apparent model ranking.',
      }),
    );
  }

  const withAgent = usable.filter((item) => item.agent);
  if (withAgent.length > 0) {
    const agentTaskCount = withAgent[0].agent.task_count;
    const agentRounds = withAgent[0].agent.rounds_run;
    write(
      'llm-agent-tool-use.svg',
      groupedBarChart({
        title: 'Agent tasks: tool-use propensity and loop depth',
        subtitle: `${agentTaskCount ?? 'n/a'} tasks × ${agentRounds ?? 'n/a'} round(s) · mean tool calls and model turns per task`,
        categories: withAgent.map((item) => shortModelName(String(item.model))),
        series: [
          {
            name: 'Mean tool calls',
            values: withAgent.map((item) =>
              Number(item.agent.mean_tool_calls ?? 0),
            ),
          },
          {
            name: 'Mean model turns',
            values: withAgent.map((item) =>
              Number(item.agent.mean_model_turns ?? 0),
            ),
          },
        ],
        yLabel: 'Count',
        format: (value) => value.toFixed(2),
        caption:
          'A model averaging 0.02 tool calls per task can only answer from context and has the lowest Agent completion; this is not explained by parameter count.',
      }),
    );

    write(
      'llm-agent-vs-todo.svg',
      groupedBarChart({
        title: 'The same models on two task types',
        subtitle:
          'Todo extraction is single-step; Agent tasks require multi-step reasoning and tool use',
        categories: withAgent.map((item) => shortModelName(String(item.model))),
        series: [
          {
            name: 'Todo extraction holdout F1',
            values: withAgent.map((item) =>
              Number(item.accuracy?.holdout_f1 ?? 0),
            ),
          },
          {
            name: 'Agent strict completion',
            values: withAgent.map((item) =>
              Number(item.agent.case_pass_rate ?? 0),
            ),
          },
        ],
        yLabel: 'Rate',
        format: pct,
        caption:
          'The rankings differ: strong single-step extraction does not imply effective tool use. Models must be evaluated per task type.',
      }),
    );
  }

  const scored = usable.filter((item) => item.accuracy);
  if (scored.length > 0) {
    write(
      'llm-accuracy-vs-speed.svg',
      scatterChart({
        title: 'Speed-accuracy Pareto frontier',
        subtitle: `${env} · accuracy from the same 54-case todo-extraction holdout`,
        series: scored.map((item) => ({
          name: `${shortModelName(String(item.model))} (${item.parameter_size ?? '?'})`,
          points: [
            {
              x: Number(item.runtime.median_tokens_per_second ?? 0),
              y: Number(item.accuracy.holdout_f1 ?? 0) * 100,
            },
          ],
        })),
        xLabel: 'Generation throughput (tokens/s; right is faster)',
        yLabel: 'Holdout F1 (%; higher is better)',
        formatX: (value) => value.toFixed(0),
        formatY: (value) => `${value.toFixed(0)}%`,
        caption:
          'Upper-right is ideal. The frontier bend indicates the smallest model that remains competitive.',
      }),
    );

    write(
      'llm-accuracy-by-size.svg',
      groupedBarChart({
        title: 'Accuracy by model size on the same holdout',
        subtitle: `${scored.length} models · 54 cases (32 holdout) · unchanged corpus and scoring`,
        categories: scored.map((item) => shortModelName(String(item.model))),
        series: [
          {
            name: 'Holdout F1',
            values: scored.map((item) => Number(item.accuracy.holdout_f1 ?? 0)),
          },
          {
            name: 'Holdout case pass rate',
            values: scored.map((item) =>
              Number(item.accuracy.holdout_case_pass_rate ?? 0),
            ),
          },
          {
            name: 'Date accuracy',
            values: scored.map((item) =>
              Number(item.accuracy.date_accuracy ?? 0),
            ),
          },
        ],
        yLabel: 'Rate',
        format: pct,
        caption:
          'The prompt was unchanged between models, preserving the holdout for comparison.',
      }),
    );
  }
}

/* --------------------------- 逐模型提示词调优 --------------------------- */

function tuningCharts(): void {
  const data = readJson('llm-tuning-comparison.json');
  if (!data) return;
  const models = (data.models as Json[]).filter((item) => item.delta);
  if (models.length === 0) return;
  const names = models.map((item) => shortModelName(String(item.model)));

  write(
    'llm-tuning-effect.svg',
    groupedBarChart({
      title: 'Per-model prompt tuning on the frozen holdout',
      subtitle:
        'Variants selected on 22 development cases; 32 holdout cases remained frozen; identical scoring for both arms',
      categories: names,
      series: [
        {
          name: 'Before tuning: holdout F1',
          values: models.map((item) => Number(item.before.holdout_f1)),
        },
        {
          name: 'After tuning: holdout F1',
          values: models.map((item) => Number(item.after.holdout_f1)),
        },
      ],
      yLabel: 'Holdout F1',
      format: pct,
      caption:
        'Only one of five models clearly improves. Development gains do not necessarily transfer to holdout.',
    }),
  );

  write(
    'llm-tuning-false-positive.svg',
    groupedBarChart({
      title: 'Effect of tuning on invented tasks',
      subtitle:
        'Zero-task false-positive rate: items produced from text with no todo · lower is better',
      categories: names,
      series: [
        {
          name: 'Before tuning',
          values: models.map((item) =>
            Number(item.before.zero_task_false_positive_rate),
          ),
        },
        {
          name: 'After tuning',
          values: models.map((item) =>
            Number(item.after.zero_task_false_positive_rate),
          ),
        },
      ],
      yLabel: 'False-positive rate',
      format: pct,
      caption:
        'The largest gain is Granite-4, from 54.5% to 9.1%. Qwen2.5-1.5B remains high across all six variants, suggesting a capability limit.',
    }),
  );

  write(
    'llm-dev-vs-holdout-gain.svg',
    groupedBarChart({
      title: 'Development gain vs holdout gain',
      subtitle:
        'F1 change for the same variant on both splits (percentage points)',
      categories: names,
      series: [
        {
          name: 'Development F1 change',
          values: models.map((item) => Number(item.delta.dev_f1)),
        },
        {
          name: 'Holdout F1 change',
          values: models.map((item) => Number(item.delta.holdout_f1)),
        },
      ],
      yLabel: 'F1 change',
      format: (value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}`,
      caption:
        'Opposite bar directions indicate overfitting: rules learned from 22 development cases did not generalise to unseen cases.',
    }),
  );
}

/* --------------------------- 跨机器硬件对比 --------------------------- */

/**
 * 多台机器的横向对比。只画对硬件敏感的量 ——
 * 准确率取决于模型与提示词，跨机器比较没有意义，画进来只会误导。
 */
function crossMachineCharts(): void {
  const root = path.join(RESULTS, 'machines');
  if (!fs.existsSync(root)) return;
  const machines = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(root, entry.name);
      const profileFile = path.join(dir, 'machine.json');
      if (!fs.existsSync(profileFile)) return null;
      const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8')) as Json;
      const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
      const load = (predicate: (name: string) => boolean): Json[] =>
        files
          .filter(predicate)
          .map(
            (name) =>
              JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Json,
          );
      return {
        id: entry.name,
        profile,
        tts: load(
          (n) =>
            n.startsWith('tts-') &&
            !n.startsWith('tts-memory-') &&
            !n.startsWith('tts-length-') &&
            n !== 'tts-asr.json',
        ).filter((x) => x.overall !== undefined),
        llm: load((n) => n === 'llm-runtime.json')[0] ?? null,
        stt: load((n) => n === 'stt-human-speed.json')[0] ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  // 只有一台机器时画出来没有对比意义
  if (machines.length < 2) return;

  const names = machines.map((m) => m.id);
  const hardwareItems = machines.map((m) =>
    machineHardwareLine(m.id, m.profile),
  );
  const ttsModels = [
    ...new Set(machines.flatMap((m) => m.tts.map((x) => String(x.model_id)))),
  ].sort();
  if (ttsModels.length > 0) {
    const rtfs = machines
      .flatMap((m) => m.tts.map((result) => Number(result.overall.p50_rtf)))
      .filter(Number.isFinite);
    write(
      'cross-tts-rtf.svg',
      groupedBarChart({
        title: 'Cross-machine TTS synthesis speed (P50 RTF)',
        subtitle: `${machines.length} machines · same 36-text corpus · CPU inference`,
        width: 1180,
        headerItems: hardwareItems,
        categories: names,
        series: ttsModels.map((modelId) => ({
          name: modelId,
          values: machines.map((m) => {
            const hit = m.tts.find((x) => x.model_id === modelId);
            return hit ? Number(hit.overall.p50_rtf) : null;
          }),
        })),
        yLabel: 'P50 RTF',
        referenceLine: { value: 1, label: 'RTF = 1 (real-time threshold)' },
        caption: `P50 RTF spans ${Math.min(...rtfs).toFixed(2)}-${Math.max(...rtfs).toFixed(2)} across ${rtfs.length} model-host pairs. Rankings vary by host; these runs do not isolate CPU performance from runtime differences.`,
      }),
    );

    write(
      'cross-tts-memory.svg',
      groupedBarChart({
        title: 'Cross-machine TTS peak memory',
        subtitle:
          'Same models and corpus · process RSS; host capacity determines whether each model fits',
        width: 1180,
        headerItems: hardwareItems,
        categories: names,
        series: ttsModels.map((modelId) => ({
          name: modelId,
          values: machines.map((m) => {
            const hit = m.tts.find((x) => x.model_id === modelId);
            return hit ? Number(hit.peak_rss_bytes) / 1024 / 1024 / 1024 : null;
          }),
        })),
        yLabel: 'Peak RSS (GiB)',
        format: (value) => `${value.toFixed(1)}G`,
        caption:
          "Compare peak RSS with each machine's physical memory to identify unsupported model-host combinations.",
      }),
    );
  }

  const llmModels = [
    ...new Set(
      machines.flatMap((m) =>
        ((m.llm?.models as Json[]) ?? []).map((x) => String(x.model)),
      ),
    ),
  ].sort();
  if (llmModels.length > 0) {
    // 同机不同模型的卸载/吞吐关联；不是固定模型的卸载因果实验。
    const offloadSplit = machines
      .map((m, index) => {
        const rows = ((m.llm?.models as Json[]) ?? []).map((x) => ({
          tps: Number(x.median_tokens_per_second),
          offload: Number(x.gpu_offload_ratio ?? NaN),
        }));
        const partial = rows
          .filter((r) => r.offload < 0.999 && Number.isFinite(r.tps))
          .map((r) => r.tps);
        const full = rows
          .filter((r) => r.offload >= 0.999 && Number.isFinite(r.tps))
          .map((r) => r.tps);
        return { name: names[index], partial, full };
      })
      .find((row) => row.partial.length > 0 && row.full.length > 0);
    const range = (values: number[]) =>
      `${Math.min(...values).toFixed(0)}-${Math.max(...values).toFixed(0)}`;
    const throughputCaption = offloadSplit
      ? `On ${offloadSplit.name}, partial-offload models reach ${range(offloadSplit.partial)} tok/s versus ${range(offloadSplit.full)} for full-offload models. Different models are compared: this association does not isolate the offload effect.`
      : 'Values use Ollama-reported eval_count / eval_duration and are independent of sampling intervals.';

    write(
      'cross-llm-throughput.svg',
      groupedBarChart({
        title: 'Cross-machine LLM generation throughput',
        subtitle: `${machines.length} machines · identical probe texts · Ollama GPU offload where available`,
        width: 1180,
        headerItems: hardwareItems,
        categories: names,
        series: llmModels.map((model) => ({
          name: model,
          values: machines.map((m) => {
            const hit = ((m.llm?.models as Json[]) ?? []).find(
              (x) => x.model === model,
            );
            return hit ? Number(hit.median_tokens_per_second) : null;
          }),
        })),
        yLabel: 'tokens/s',
        format: (value) => value.toFixed(0),
        caption: throughputCaption,
      }),
    );

    write(
      'cross-llm-gpu.svg',
      groupedBarChart({
        title: 'Cross-machine GPU offload ratio',
        subtitle:
          'Ollama-reported GPU residency · Apple Silicon uses unified memory, not separate VRAM',
        width: 1180,
        headerItems: hardwareItems,
        categories: names,
        series: llmModels.map((model) => ({
          name: model,
          values: machines.map((m) => {
            const hit = ((m.llm?.models as Json[]) ?? []).find(
              (x) => x.model === model,
            );
            return hit?.gpu_offload_ratio !== undefined &&
              hit.gpu_offload_ratio !== null
              ? Number(hit.gpu_offload_ratio)
              : null;
          }),
        })),
        yLabel: 'Offload ratio',
        format: pct,
        referenceLine: { value: 1, label: 'Full GPU offload' },
        caption: offloadSplit
          ? `On ${offloadSplit.name}, partial offload coincides with lower throughput. Check model residency alongside speed; parameter count alone does not describe memory fit.`
          : 'This directly indicates the largest model a host can sustain; throughput often drops sharply below full offload.',
      }),
    );
  }

  const sttModels = [
    ...new Set(
      machines.flatMap((m) => Object.keys((m.stt?.models as Json) ?? {})),
    ),
  ].sort();
  if (sttModels.length > 0) {
    // 统计实时阈值，不把相同计数当成 CPU/GPU 归因证据。
    const threads = [
      ...new Set(machines.map((m) => m.stt?.thread_count).filter(Boolean)),
    ];
    const realtimeCounts = machines
      .map((m, index) => {
        const rtfs = Object.values((m.stt?.models as Json) ?? {})
          .map((entry) => Number((entry as Json)?.mean_rtf))
          .filter((value) => Number.isFinite(value));
        return {
          name: names[index],
          under: rtfs.filter((value) => value < 1).length,
          total: rtfs.length,
        };
      })
      .filter((row) => row.total > 0);
    const realtimeSummary = realtimeCounts
      .map((row) => `${row.name} ${row.under}/${row.total}`)
      .join(', ');

    write(
      'cross-stt-rtf.svg',
      groupedBarChart({
        title: 'Cross-machine STT transcription speed',
        subtitle: `${machines.length} machines · identical human recordings · whisper.cpp · ${threads.join('/')} threads · accuracy excluded`,
        // 16 个模型 x 4 台机器：加宽画布，柱子才不至于挤成一片。
        width: 1180,
        headerItems: hardwareItems,
        categories: names,
        series: sttModels.map((model) => ({
          name: model,
          values: machines.map((m) => {
            const hit = ((m.stt?.models as Json) ?? {})[model] as
              | Json
              | undefined;
            return hit?.mean_rtf !== undefined && hit?.mean_rtf !== null
              ? Number(hit.mean_rtf)
              : null;
          }),
        })),
        yLabel: 'RTF',
        referenceLine: {
          value: 1,
          label: 'RTF = 1 (transcription equals audio duration)',
        },
        caption: `Faster-than-real-time models: ${realtimeSummary}. Backend/GPU activity was not recorded; the speed differences do not isolate CPU, GPU or runtime effects.`,
      }),
    );
  }
}

/* ------------------------------ 合并面板 ------------------------------ */

/**
 * 把已生成的单图按主题拼成几张总览面板。
 *
 * 单图适合放在报告正文里紧跟对应的表格；但报告总览和幻灯片需要
 * 「一页看完一个主题」，二十多张零散的图在那种场合没法用。
 * 两者都保留：明细报告引用单图，总览和幻灯片引用面板。
 */
function panels(): void {
  const read = (name: string): string | null => {
    const full = path.join(CHARTS, name);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  };
  const compose = (
    output: string,
    title: string,
    subtitle: string,
    caption: string,
    sources: string[],
    columns = 2,
  ): void => {
    const charts = sources
      .map(read)
      .filter((item): item is string => item !== null);
    if (charts.length === 0) return;
    write(
      output,
      gridPanel({ title, subtitle, caption, charts, columns, scale: 0.92 }),
    );
  };

  compose(
    'panel-tts-speed.svg',
    'TTS synthesis speed overview',
    'Three models · 36 texts · 3 repetitions each · Windows x64 / i9-12900H / 4 CPU threads',
    'RTF < 1 is faster than playback. All models meet this threshold across languages and content categories.',
    [
      'tts-rtf-by-language.svg',
      'tts-rtf-p95-by-category.svg',
      'tts-rtf-vs-length.svg',
      'tts-synthesis-vs-audio.svg',
    ],
    1,
  );

  compose(
    'panel-tts-memory.svg',
    'TTS memory behaviour overview',
    'Peak RSS, scaling with input length, and accumulation across repeated calls',
    'MOSS rises to about 10 GiB with long text but plateaus across repeated calls: transient per-request cost, not a leak.',
    [
      'tts-peak-memory.svg',
      'tts-memory-vs-length.svg',
      'tts-memory-iterations.svg',
    ],
  );

  compose(
    'panel-tts-quality.svg',
    'TTS intelligibility proxy and three-way trade-off',
    'Whisper back-transcription CER (low-confidence proxy; not a listening test)',
    'No model wins every metric: MOSS is fastest with lowest CER but highest memory; MeloTTS is lightest but weakest on names and abbreviations.',
    ['tts-cer-by-language.svg', 'tts-cer-by-category.svg', 'tts-tradeoff.svg'],
  );

  compose(
    'panel-stt.svg',
    'Human-recorded STT evaluation overview',
    '56 recordings · whisper.cpp tiny/base/small/large-v1',
    'The speaker is a native Chinese speaker; segment B is a paraphrase and is not scored with CER. Chart 4 shows the speed-accuracy trade-off.',
    [
      'stt-cer-by-segment.svg',
      'stt-cer-by-language.svg',
      'stt-content-recall-by-segment.svg',
      'stt-speed-vs-accuracy.svg',
    ],
    1,
  );

  compose(
    'panel-todo.svg',
    'Todo-extraction evaluation overview',
    'qwen2.5:3b-instruct · temperature 0.1 · 54 cases (dev 22 / holdout 32) · 3 rounds',
    'The development-holdout difference is the generalisation gap; overlapping rounds indicate near-deterministic output.',
    [
      'todo-dev-vs-holdout.svg',
      'todo-round-stability.svg',
      'todo-failure-types.svg',
    ],
  );

  const agentData = readJson('agent-eval.json');
  const agentSubtitle = agentData
    ? `${agentData.dataset.note_count} fixed notes · ${agentData.dataset.task_count} tasks` +
      ` (dev ${agentData.mean_across_rounds.dev.case_count} / holdout ${agentData.mean_across_rounds.holdout.case_count})` +
      ` · ${agentData.rounds_run} round(s) · ${(agentData.rounds as Json[]).reduce((sum, round) => sum + (round.cases as Json[]).length, 0)} complete traces`
    : '80 fixed notes · end-to-end Agent evaluation';
  compose(
    'panel-agent.svg',
    'End-to-end Agent evaluation overview',
    agentSubtitle,
    'Retrieval uses only tasks requiring search and is directional; the Judge is not human-calibrated, so strict rule-based scoring is primary.',
    [
      'agent-dev-vs-holdout.svg',
      'agent-by-scenario.svg',
      'agent-retrieval.svg',
      'agent-efficiency.svg',
      'agent-latency-by-scenario.svg',
      'agent-round-stability.svg',
    ],
    1,
  );

  const retrievalData = readJson('embedding-retrieval.json');
  compose(
    'panel-retrieval.svg',
    'Retrieval quality overview (direct query, no LLM)',
    retrievalData
      ? `bge-m3 · ${retrievalData.dataset.gold_task_count} gold-labelled tasks · task text queried directly without Agent/LLM`
      : 'Mixed retrieval measured directly without LLM mediation',
    'This measures keyword + vector + RRF ranking, not whether an LLM invokes search or formulates a good query; see the Agent panel for that layer.',
    [
      'retrieval-dev-vs-holdout.svg',
      'retrieval-by-scenario.svg',
      'retrieval-vs-llm-mediated.svg',
    ],
    1,
  );
}

function main(): void {
  const panelsOnly = process.argv.includes('--panels-only');
  if (!panelsOnly) {
    ttsCharts();
    memoryCharts();
    asrCharts();
    sttCharts();
    todoCharts();
    agentCharts();
    retrievalCharts();
    jestCharts();
    llmCharts();
    tuningCharts();
    crossMachineCharts();
  }
  // 完整模式先生成单图；panels-only 模式则安全复用仓库里已有的单图。
  panels();
  if (written.length === 0) {
    process.stdout.write(
      'No result JSON was available; no charts were generated.\n',
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Generated ${written.length} charts in ${CHARTS}\n${written.map((name) => `  ${name}`).join('\n')}\n`,
  );
}

main();
