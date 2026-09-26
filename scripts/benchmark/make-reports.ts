/**
 * 把基准结果 JSON 渲染成可以直接放进报告的 Markdown。
 *
 * 输入（都在基准结果目录下，缺哪个就跳过哪一节）：
 *   tts-<modelId>.json         性能与信号指标
 *   tts-asr.json               回转录 CER
 *   todo-extraction-eval.json  待办提取指标
 *   agent-eval.json            Agent 端到端任务、检索与工具轨迹
 *
 * 输出：
 *   docs/testing/tts-model-benchmark-windows.md
 *   docs/testing/task-extraction-eval.md
 *   docs/testing/agent-end-to-end-eval.md
 *
 *   npm run bench:report
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import {
  benchmarkResultsRoot,
  portablePathBasename,
  PROJECT_ROOT,
} from './tts-paths';
import buildSweepReport from './sweep-report';

type Json = Record<string, any>;

const RESULTS = benchmarkResultsRoot();
const DOCS = path.join(PROJECT_ROOT, 'docs', 'testing');

function readJson(file: string): Json | null {
  const full = path.join(RESULTS, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8')) as Json;
}

function mib(bytes: number | null | undefined): string {
  return bytes === null || bytes === undefined
    ? 'n/a'
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function fixed(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'n/a'
    : value.toFixed(digits);
}

function percent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'n/a'
    : `${(value * 100).toFixed(digits)}%`;
}

function table(header: string[], rows: (string | number)[][]): string {
  const separator = header.map(() => '---');
  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/**
 * 引用一张图。图不存在就返回空串 —— 报告可以在没跑 bench:charts 时照常生成，
 * 不会留下一堆坏掉的图片链接。
 */
function chart(file: string, alt: string): string {
  const full = path.join(DOCS, 'charts', file);
  if (!fs.existsSync(full)) return '';
  return `![${alt}](./charts/${file})\n`;
}

/** 内存判定的中文标签。oscillating 是实测出来的第四种情况：来回震荡但不累积。 */
const MEMORY_VERDICT_LABELS: Record<string, string> = {
  stable: '稳定',
  oscillating: '震荡（不累积）',
  'slow-growth': '缓慢增长',
  accumulating: '**累积**',
};

function memoryVerdictLabel(verdict: string): string {
  return MEMORY_VERDICT_LABELS[verdict] ?? verdict;
}

/* ------------------------------ TTS 报告 ------------------------------ */

function buildTTSReport(): string | null {
  // 按内容而不是文件名前缀筛：结果目录里还有 tts-memory-* 和 tts-length-*，
  // 它们同样以 tts- 开头，但没有 overall 字段。
  const models = fs
    .readdirSync(RESULTS)
    .filter((name) => name.startsWith('tts-') && name.endsWith('.json'))
    .map((name) => readJson(name))
    .filter(
      (item): item is Json =>
        item !== null &&
        item.overall !== undefined &&
        item.by_language !== undefined,
    )
    .sort((a, b) => String(a.model_name).localeCompare(String(b.model_name)));
  if (models.length === 0) return null;
  const asr = readJson('tts-asr.json');
  const platform = models[0].platform as Json;
  const corpus = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'tts-corpus.json'), 'utf8'),
  ) as { cases: { language: string; category: string }[] };

  const languageCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const item of corpus.cases) {
    languageCounts.set(
      item.language,
      (languageCounts.get(item.language) ?? 0) + 1,
    );
    categoryCounts.set(
      item.category,
      (categoryCounts.get(item.category) ?? 0) + 1,
    );
  }

  const lines: string[] = [];
  lines.push('# SpeakSpace Local TTS 模型基准测试（Windows 实测）');
  lines.push('');
  lines.push(
    `测试日期：${String(models[0].measured_at).slice(0, 10)} · 生成方式：\`npm run bench:tts\` → \`npm run bench:tts:asr\` → \`npm run bench:report\``,
  );
  lines.push('');
  lines.push(
    '本轮全部数据由脚本自动采集，未手工填写。原始 JSON 与 WAV 见文末「可复现方法」。',
  );
  lines.push('');

  lines.push('## 测试环境');
  lines.push('');
  lines.push(
    table(
      ['项目', '值'],
      [
        ['系统', String(platform.os)],
        ['架构', String(platform.arch)],
        ['CPU', String(platform.cpu)],
        ['逻辑核心', String(platform.cpu_threads)],
        ['内存', mib(platform.total_memory_bytes)],
        ['Node.js', String(platform.node)],
        ['推理设备', 'CPU'],
        ['推理线程', '4（与应用内 SherpaTTSEngine 相同）'],
        ['重复次数', `每个模型、每条文本 ${models[0].repeat_count} 次`],
      ],
    ),
  );
  lines.push('');
  lines.push(
    '每个模型在独立子进程内加载一次并跑完全部语料，峰值内存按 100 ms 采样 RSS 取最大值，模型之间互不干扰。',
  );
  lines.push('');

  lines.push('## 测试语料');
  lines.push('');
  lines.push(
    `共 ${corpus.cases.length} 条文本，覆盖三种语言与八类内容。语料文件：[tts-corpus.json](../../scripts/benchmark/tts-corpus.json)。`,
  );
  lines.push('');
  lines.push(
    table(
      ['语言', '条数'],
      [...languageCounts.entries()].map(([key, value]) => [key, value]),
    ),
  );
  lines.push('');
  lines.push(
    table(
      ['类别', '条数', '说明'],
      [
        ['basic', categoryCounts.get('basic') ?? 0, '日常口语句'],
        [
          'numeric',
          categoryCounts.get('numeric') ?? 0,
          '数字、百分比、金额、编号',
        ],
        ['datetime', categoryCounts.get('datetime') ?? 0, '日期与时间点'],
        [
          'proper-noun',
          categoryCounts.get('proper-noun') ?? 0,
          '中英文人名与地名',
        ],
        [
          'acronym',
          categoryCounts.get('acronym') ?? 0,
          '英文缩写（OKR / KPI / API）',
        ],
        ['technical', categoryCounts.get('technical') ?? 0, '专业术语'],
        [
          'punctuation',
          categoryCounts.get('punctuation') ?? 0,
          '问号、感叹号、省略号',
        ],
        ['long', categoryCounts.get('long') ?? 0, '300 字以上长文本'],
      ],
    ),
  );
  lines.push('');

  lines.push('## 性能结果');
  lines.push('');
  lines.push(
    'RTF（实时因子）= 合成耗时 ÷ 音频时长，小于 1 表示合成快于实时播放。P50 / P95 在该模型全部文本、全部重复次数上计算。',
  );
  lines.push('');
  lines.push('### 汇总');
  lines.push('');
  lines.push(
    table(
      [
        '模型',
        '引擎',
        '模型大小',
        '加载 + 首次合成',
        '峰值 RSS',
        'P50 RTF',
        'P95 RTF',
        '平均 RTF',
        '输出格式',
        '失败',
      ],
      models.map((model) => [
        String(model.model_name),
        String(model.engine),
        mib(model.model_size_bytes),
        `${(Number(model.load_plus_first_synthesis_ms) / 1000).toFixed(2)} s`,
        mib(model.peak_rss_bytes),
        fixed(model.overall.p50_rtf),
        fixed(model.overall.p95_rtf),
        fixed(model.overall.mean_rtf),
        `${Number(model.overall.sample_rate_hz) / 1000} kHz / ${
          model.overall.channel_count
        } 声道`,
        `${model.failure_count}/${model.case_count}`,
      ]),
    ),
  );
  lines.push('');
  lines.push('### 分语言 RTF');
  lines.push('');
  lines.push(chart('tts-rtf-by-language.svg', '分语言 P50 RTF'));
  lines.push(
    table(
      ['模型', '语言', '条数', 'P50 RTF', 'P95 RTF', '平均 RTF'],
      models.flatMap((model) =>
        ['zh', 'en', 'zh-en'].map((language) => [
          String(model.model_name),
          language,
          model.by_language[language].case_count,
          fixed(model.by_language[language].p50_rtf),
          fixed(model.by_language[language].p95_rtf),
          fixed(model.by_language[language].mean_rtf),
        ]),
      ),
    ),
  );
  lines.push('');
  lines.push('### 分类别 P95 RTF');
  lines.push('');
  lines.push(chart('tts-rtf-p95-by-category.svg', '分类别 P95 RTF'));
  const categories = Object.keys(models[0].by_category as Json);
  lines.push(
    table(
      ['类别', ...models.map((model) => String(model.model_name))],
      categories.map((category) => [
        category,
        ...models.map((model) => fixed(model.by_category[category]?.p95_rtf)),
      ]),
    ),
  );
  lines.push('');

  lines.push('### 速度与文本长度的关系');
  lines.push('');
  lines.push(chart('tts-rtf-vs-length.svg', 'RTF 随文本长度的变化'));
  lines.push(chart('tts-synthesis-vs-audio.svg', '合成耗时 vs 音频时长'));
  lines.push(
    'RTF 与文本长度基本无关，说明合成耗时随文本近似线性增长；散点图里所有点都落在实时线下方。',
  );
  lines.push('');

  lines.push('## 音频有效性与信号检查');
  lines.push('');
  lines.push(
    table(
      [
        '模型',
        '非有限样本',
        '最大削波比例',
        '最大峰值',
        '中位 RMS',
        '合成失败',
      ],
      models.map((model) => {
        const firstRuns = (model.cases as Json[])
          .map((item) => item.runs?.[0])
          .filter(Boolean);
        const peaks = firstRuns.map((run: Json) => Number(run.peak_absolute));
        const rmsValues = firstRuns
          .map((run: Json) => Number(run.rms))
          .sort((a, b) => a - b);
        return [
          String(model.model_name),
          String(model.overall.non_finite_sample_total),
          percent(model.overall.max_clipping_ratio, 4),
          fixed(Math.max(...peaks)),
          fixed(rmsValues[Math.floor(rmsValues.length / 2)], 4),
          `${model.failure_count}/${model.case_count}`,
        ];
      }),
    ),
  );
  lines.push('');

  const memoryProbes = fs
    .readdirSync(RESULTS)
    .filter((name) => name.startsWith('tts-memory-') && name.endsWith('.json'))
    .map((name) => readJson(name))
    .filter((item): item is Json => item !== null);
  if (memoryProbes.length > 0) {
    lines.push('## 内存增长探针');
    lines.push('');
    lines.push(
      '上面的「峰值 RSS」是整个进程跑完全部语料后的最大值，它回答不了一个关键问题：' +
        '那是**单次合成的瞬时开销**，还是**随合成次数不断累积**？两者的部署结论完全不同。',
    );
    lines.push('');
    lines.push(
      `做法：同一个引擎实例连续合成同一段文本 ${memoryProbes[0].iterations_per_phase} 次（先短句后长文本），` +
        '每次之后**强制 GC 再采样 RSS**。强制回收之后仍然单调上升，才能判定为累积占用。',
    );
    lines.push('');
    lines.push(
      table(
        [
          '模型',
          '基线 RSS',
          '末次 RSS',
          '释放引擎后',
          '后半程每次增长',
          '判定',
        ],
        memoryProbes.map((probe) => [
          String(probe.model_name),
          mib(probe.baseline_rss_bytes),
          mib(probe.final_rss_bytes),
          mib(probe.after_dispose_rss_bytes),
          mib(probe.second_half_growth_per_iteration_bytes),
          memoryVerdictLabel(String(probe.verdict)),
        ]),
      ),
    );
    lines.push('');
    lines.push(chart('tts-memory-iterations.svg', '连续合成时的 RSS 变化'));
    for (const probe of memoryProbes) {
      const rows = (probe.phases as Json[]).flatMap((phase) =>
        (phase.samples as Json[]).map((sample) => [
          String(phase.phase),
          String(sample.iteration),
          mib(sample.rss_bytes),
        ]),
      );
      lines.push(`<details><summary>${probe.model_name} 逐次采样</summary>`);
      lines.push('');
      lines.push(table(['阶段', '第几次', 'RSS'], rows));
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  const lengthProbes = fs
    .readdirSync(RESULTS)
    .filter((name) => name.startsWith('tts-length-') && name.endsWith('.json'))
    .map((name) => readJson(name))
    .filter((item): item is Json => item !== null);
  if (lengthProbes.length > 0) {
    lines.push('## 峰值内存 vs 文本长度');
    lines.push('');
    lines.push(
      '上一节说明重复调用不会无限涨，那么真正的变量就是**单次输入的长度**。' +
        '这一节按长度递增依次合成，合成期间每 50 ms 采样 RSS 取最大值。',
    );
    lines.push('');
    const ladderIds = ((lengthProbes[0].samples as Json[]) ?? []).map(
      (sample) => `${sample.id}（${sample.text_length} 字）`,
    );
    lines.push(
      table(
        ['模型', ...ladderIds, '最长 ÷ 最短'],
        lengthProbes.map((probe) => [
          String(probe.model_name),
          ...((probe.samples as Json[]) ?? []).map((sample) =>
            sample.error ? `失败` : mib(sample.peak_rss_bytes),
          ),
          probe.peak_growth_ratio
            ? `${Number(probe.peak_growth_ratio).toFixed(1)}×`
            : 'n/a',
        ]),
      ),
    );
    lines.push('');
    lines.push(chart('tts-memory-vs-length.svg', '峰值内存随文本长度的变化'));
    const worst = lengthProbes.reduce((a, b) =>
      Number(b.max_peak_rss_bytes) > Number(a.max_peak_rss_bytes) ? b : a,
    );
    lines.push(
      `本机内存 ${mib(worst.machine_memory_bytes)}。最费内存的是 **${worst.model_name}**：` +
        `合成 ${worst.max_text_length} 字的一段文本需要 ${mib(worst.max_peak_rss_bytes)}。` +
        '这是**单次请求的瞬时开销**，不是泄漏 —— 但它决定了最低内存门槛，' +
        '也解释了为什么只用短文本测不出这个问题。',
    );
    lines.push('');
  }

  if (asr && Object.keys(asr.models as Json).length > 0) {
    lines.push('## Whisper 回转录可懂度代理');
    lines.push('');
    lines.push(
      `回转录模型：\`${portablePathBasename(String(asr.whisper_model))}\`，线程 ${asr.thread_count}。` +
        'CER 在 NFKC 归一化、小写折叠、去除全部空白与标点后按字符计算。',
    );
    lines.push('');
    lines.push(
      '数字与日期类文本的口语读法和书面形式不一致（「百分之十二点五」对 `12.5%`），' +
        '语料为这些用例提供了可接受的书面变体，取最小 CER，避免把正字法差异算成发音错误。',
    );
    lines.push('');
    const asrModels = Object.entries(asr.models as Json);
    lines.push(
      table(
        ['模型', '计分条数', '平均 CER', '中文', '英文', '中英混合'],
        asrModels.map(([modelId, data]) => {
          const info = data as Json;
          const named =
            models.find((model) => model.model_id === modelId)?.model_name ??
            modelId;
          return [
            String(named),
            String(info.scored_count),
            percent(info.mean_cer),
            percent(info.mean_cer_by_language.zh),
            percent(info.mean_cer_by_language.en),
            percent(info.mean_cer_by_language['zh-en']),
          ];
        }),
      ),
    );
    lines.push('');
    lines.push(chart('tts-cer-by-language.svg', '分语言回转录 CER'));
    lines.push('### 分类别平均 CER');
    lines.push('');
    lines.push(chart('tts-cer-by-category.svg', '分类别回转录 CER'));
    const asrCategories = Object.keys(
      (asrModels[0][1] as Json).mean_cer_by_category as Json,
    );
    lines.push(
      table(
        [
          '类别',
          ...asrModels.map(([modelId]) =>
            String(
              models.find((model) => model.model_id === modelId)?.model_name ??
                modelId,
            ),
          ),
        ],
        asrCategories.map((category) => [
          category,
          ...asrModels.map(([, data]) =>
            percent((data as Json).mean_cer_by_category[category]),
          ),
        ]),
      ),
    );
    lines.push('');
    lines.push('> 这一节只是**低置信度**代理。Whisper 自身的错误会算进 CER，');
    lines.push(
      '> 中英混合尤其容易被高估；它不能替代人工听测，也不等同于 MOS。',
    );
    lines.push('');
  }

  // 各指标的赢家不是同一个模型，只看一张表很容易得出片面结论，
  // 所以把速度/内存/可懂度并排放一次。
  if (
    asr &&
    Object.keys(asr.models as Json).length > 0 &&
    lengthProbes.length > 0
  ) {
    lines.push('## 综合对比');
    lines.push('');
    lines.push(
      '**三个指标的第一名不是同一个模型**，任何只看一张表得出的推荐都是片面的。',
    );
    lines.push('');
    lines.push(
      table(
        [
          '模型',
          'P50 RTF',
          '峰值 RSS（全语料）',
          '最长文本峰值 RSS',
          '回转录平均 CER',
        ],
        models.map((model) => {
          const length = lengthProbes.find(
            (probe) => probe.model_id === model.model_id,
          );
          const cer = (asr.models as Json)[String(model.model_id)]?.mean_cer;
          return [
            String(model.model_name),
            fixed(model.overall.p50_rtf),
            mib(model.peak_rss_bytes),
            length ? mib(length.max_peak_rss_bytes) : 'n/a',
            percent(cer),
          ];
        }),
      ),
    );
    lines.push('');
    lines.push(chart('tts-tradeoff.svg', '速度、内存与可懂度的权衡'));
    lines.push(
      [
        '读法：',
        '',
        '- **速度**三个模型都够用（P50 RTF 全部小于 1，即快于实时播放），不构成区分点。',
        '- **内存**是硬约束。最长文本上的峰值直接决定最低内存门槛，也是唯一会导致崩溃的指标。',
        '- **可懂度**只是低置信度代理，不能单独定论；但分类别数据（人名、缩写）指向的是词典覆盖差异，这类问题人工听测同样能复现。',
        '',
        '选型必须由这三者共同决定，并且要补人工盲听 —— 本轮数据不足以单独给出最终推荐。',
      ].join('\n'),
    );
    lines.push('');
  }

  lines.push('## 本轮结论的边界');
  lines.push('');
  lines.push(
    [
      '- 本轮只证明：三个模型在这台 Windows x64 机器上可以离线跑完 36 条文本，并给出了速度、内存与信号有效性的可比数据。',
      '- 本轮**不能**证明谁的自然度和发音质量更好。音质结论需要至少 3–5 人对同一批 WAV 做盲听，按自然度、清晰度、发音准确性、中英切换四个维度打分。',
      '- 本轮只测了一台机器、一种线程配置、每个模型一个音色，换机器或换音色结论可能变化。',
      '- 长文本只有 3 条，长文本失败率的样本量不足以下结论。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 更早一轮：2026-08-13 macOS（历史，已被本轮取代）');
  lines.push('');
  lines.push(
    '正式扩到 36 条语料之前，先在一台 Mac16,10 / Apple M4 / 16 GiB 上用 3 条短文本' +
      '（中/英/中英混合各一条，均 40 字以内）跑过一轮。当时的结论：',
  );
  lines.push('');
  lines.push(
    table(
      ['模型', '加载时间', '峰值 RSS', '三类文本平均中位 RTF'],
      [
        ['Kokoro', '1.260 s', '779.8 MiB', '0.978'],
        ['MeloTTS', '1.344 s', '663.5 MiB', '0.652'],
        ['MOSS-TTS-Nano', '4.024 s', '1,248.2 MiB', '0.529'],
      ],
    ),
  );
  lines.push('');
  lines.push(
    '速度数据方向上与本轮一致，仍可引用。**MOSS 的峰值 RSS 数字不能再引用**：那一轮' +
      '三条文本都在 40 字以内，没有暴露出峰值内存随文本长度上升的效应；本轮用含 1196 字' +
      '长文本的 36 条语料测出同一模型峰值约 10 GiB，见上文「峰值内存 vs 文本长度」。' +
      '当时使用的脚本（`tts-benchmark-sherpa.js`、`tts-benchmark-moss.py` 等）已被' +
      '现在的 `tts-benchmark.ts` + `tts-corpus.json` 流程取代并删除。',
  );
  lines.push('');

  lines.push('## 可复现方法');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run bench:tts:fetch     # 按应用内 catalog 下载并校验模型');
  lines.push('npm run bench:tts           # 性能与信号基准，每模型一个子进程');
  lines.push('npm run bench:tts:memory    # 内存增长探针（强制 GC 后采样）');
  lines.push('npm run bench:tts:length    # 峰值内存 vs 文本长度');
  lines.push('npm run bench:tts:asr       # Whisper 回转录并计算 CER');
  lines.push('npm run bench:charts        # 从上面的 JSON 生成 SVG 图');
  lines.push('npm run bench:report        # 生成本文件');
  lines.push('```');
  lines.push('');
  lines.push('脚本与语料：');
  lines.push('');
  lines.push(
    '- [fetch-tts-models.ts](../../scripts/benchmark/fetch-tts-models.ts)',
  );
  lines.push('- [tts-benchmark.ts](../../scripts/benchmark/tts-benchmark.ts)');
  lines.push('- [tts-asr-eval.ts](../../scripts/benchmark/tts-asr-eval.ts)');
  lines.push('- [tts-corpus.json](../../scripts/benchmark/tts-corpus.json)');
  lines.push('');
  lines.push(`原始 JSON 与 WAV：\`${RESULTS}\``);
  lines.push('');
  return lines.join('\n');
}

/* ---------------------------- 真人 STT 报告 ---------------------------- */

const STT_MODEL_ORDER = ['tiny', 'base', 'small', 'large-v1'];
const STT_MODEL_SIZE: Record<string, string> = {
  tiny: '75 MiB',
  base: '142 MiB',
  small: '466 MiB',
  'large-v1': '2.9 GiB',
};

function buildSTTReport(): string | null {
  const data = readJson('stt-human.json');
  if (!data) return null;
  const modelIds = Object.keys(data.models as Json).sort(
    (a, b) => STT_MODEL_ORDER.indexOf(a) - STT_MODEL_ORDER.indexOf(b),
  );
  if (modelIds.length === 0) return null;
  const models = data.models as Json;

  const lines: string[] = [];
  lines.push('# SpeakSpace Local 真人 STT 准确率评测');
  lines.push('');
  lines.push(
    `测试日期：${String(data.measured_at).slice(0, 10)} · 生成方式：\`npm run bench:stt\` → \`npm run bench:report\``,
  );
  lines.push('');
  lines.push(
    '这份报告测的是**真人朗读**的转写准确率，跟 [TTS 基准](./tts-model-benchmark-windows.md) 里' +
      '「合成语音回转录」的 CER 不是一回事 —— 那是低置信度可懂度代理，这里是真实语音输入。',
  );
  lines.push('');
  lines.push(
    `朗读者是中文母语者。**英文朗读存在自然的发音与用词偏差，这是在测真实使用场景，` +
      `不是在评判朗读者的英语水平** —— 分语言的 CER 差异要在这个前提下解读，不能直接当作模型` +
      `在中英文上的能力差。`,
  );
  lines.push('');

  lines.push('## 录音方法');
  lines.push('');
  lines.push(
    `按 [stt-recording-protocol.md](./stt-recording-protocol.md) 的协议，复用` +
      `[TTS / STT 共用语料](./datasets/tts-stt-shared-corpus.md)的 36 条文本，` +
      `录了 ${String(data.recording_count)} 段真人朗读，分三段（完整清单见` +
      `[datasets/stt-human-recordings.md](./datasets/stt-human-recordings.md)）：`,
  );
  lines.push('');
  lines.push(
    table(
      ['段', '内容', '条数', '打分方式'],
      [
        ['A', '安静环境，照原文逐字朗读', '36', '严格 CER'],
        [
          'B',
          '看一眼原文合上后，用自己的话自然复述',
          '12',
          '仅内容覆盖率（不算 CER）',
        ],
        [
          'C',
          '照原文逐字朗读，有轻度背景噪音（键盘声/风扇声）',
          '9',
          '严格 CER',
        ],
      ],
    ),
  );
  lines.push('');
  lines.push(
    '录音用手机自带录音 App 完成，不是应用内录音功能直接产出 —— 跟应用真实的麦克风采集路径' +
      '不完全一致，见文末「本轮结论的边界」。原始录音是连续编号的 56 个文件，' +
      '文件名本身不带文本 ID；映射关系通过 whisper-large-v1 转写锚点文件、核对内容确认，' +
      '不是单纯按文件顺序猜的，详见 [stt-recording-corpus.ts](../../scripts/benchmark/stt-recording-corpus.ts)。' +
      '其中一段录音（rec_03）用户连着念完了两条文本才停止，按拼接后的参考文本打分，不影响其余 55 段。',
  );
  lines.push('');

  lines.push('## 测试模型');
  lines.push('');
  lines.push(
    table(
      ['模型', '体积', '语言'],
      modelIds.map((id) => [
        `Whisper ${id}`,
        STT_MODEL_SIZE[id] ?? 'n/a',
        '多语言',
      ]),
    ),
  );
  lines.push('');
  lines.push(
    '四档模型体积跨度约 40 倍（75 MiB → 2.9 GiB），用来回答一个具体问题：' +
      '多花几十倍的下载和内存换来的准确率提升值不值。',
  );
  lines.push('');

  lines.push('## 结果：安静朗读 vs 背景噪音');
  lines.push('');
  lines.push(chart('stt-cer-by-segment.svg', 'CER：安静朗读 vs 背景噪音'));
  lines.push(
    table(
      ['模型', 'A 段 CER（安静）', 'C 段 CER（有噪音）', '差值'],
      modelIds.map((id) => {
        const seg = models[id].by_segment as Json;
        const a = seg.A.mean_cer as number;
        const c = seg.C.mean_cer as number;
        return [`Whisper ${id}`, percent(a), percent(c), percent(c - a)];
      }),
    ),
  );
  lines.push('');
  lines.push(
    'C 段的 9 条文本是 A 段 36 条里的一个子集（同一人读），条件差异是背景噪音；' +
      '但每条只录了一次，差值里混着噪音影响和单次朗读的自然波动，样本量不足以拆开。' +
      '两个模型（small、large-v1）差值是负的，不能读成"背景噪音提升了准确率"，' +
      '更合理的解读是：这份录音里用户特意保留的噪音强度还没有严重到压过单次朗读本身的波动。',
  );
  lines.push('');

  lines.push('## 结果：分语言');
  lines.push('');
  lines.push(chart('stt-cer-by-language.svg', 'CER：分语言'));
  lines.push(
    table(
      ['模型', '中文 CER', '英文 CER', '中英混合 CER'],
      modelIds.map((id) => {
        const byLang = models[id].mean_cer_by_language_AC as Json;
        return [
          `Whisper ${id}`,
          percent(byLang.zh as number),
          percent(byLang.en as number),
          percent(byLang['zh-en'] as number),
        ];
      }),
    ),
  );
  lines.push('');
  lines.push(
    '英文 CER 明显高于中文，跟朗读者是中文母语者、非母语发音这个前提一致，' +
      '不能直接解读成"模型的中文能力强于英文能力"。',
  );
  lines.push('');

  lines.push('## 结果：内容覆盖率（含自然复述段）');
  lines.push('');
  lines.push(
    chart('stt-content-recall-by-segment.svg', '内容覆盖率：三段对比'),
  );
  lines.push(
    table(
      ['模型', 'A 覆盖率', 'B 覆盖率（复述）', 'C 覆盖率'],
      modelIds.map((id) => {
        const seg = models[id].by_segment as Json;
        return [
          `Whisper ${id}`,
          percent(seg.A.mean_content_recall as number),
          percent(seg.B.mean_content_recall as number),
          percent(seg.C.mean_content_recall as number),
        ];
      }),
    ),
  );
  lines.push('');
  lines.push(
    '内容覆盖率答的是"原文的字/词有多少出现在了转写里"，不看顺序、不要求逐字一致 —— ' +
      '这是用户明确要求的宽松打分口径：只要转写贴近原文或者意思对得上就算数，不必完全一致。' +
      '**没有做虚词过滤**（"的/了/是"这类高频字在任何一句转写里几乎都会出现），' +
      '绝对值会偏高，看同一模型在 A/B/C 三段之间的相对差异比看单一数值更有意义。',
  );
  lines.push('');

  lines.push('## 结果：速度 vs 准确率');
  lines.push('');
  lines.push(chart('stt-speed-vs-accuracy.svg', '速度 vs 准确率权衡'));
  lines.push(
    table(
      ['模型', 'A+C 段 CER', '平均 RTF', '失败条数'],
      modelIds.map((id) => [
        `Whisper ${id}`,
        percent(models[id].mean_cer_strict_AC as number),
        fixed(models[id].mean_rtf as number, 2),
        String(models[id].failed_count ?? 0),
      ]),
    ),
  );
  lines.push('');
  lines.push('## 本轮结论的边界');
  lines.push('');
  lines.push(
    [
      '- **只有一位朗读者**，且是中文母语者。测出来的准确率代表这一个人的口音、语速，' +
        '不能代表所有用户，尤其不能代表非中文母语用户或其他中文方言口音。',
      '- **英文 CER 里混杂了发音偏差和模型识别能力两个因素**，两者在这份数据里无法拆开。',
      '- **录音用的是手机自带 App，不是应用内录音功能**，采样率、增益、降噪处理跟应用真实的' +
        '麦克风采集路径不完全一致，结果不能 1:1 代表应用内录音的转写效果。',
      '- **B 段（自然复述）的参考文本沿用 A 段原文**，复述本来就不要求逐字对应，' +
        '内容覆盖率只能说明"关键信息是否保留"，不能当成转写准确率使用。',
      '- **内容覆盖率没有做虚词过滤**，绝对值天然偏高，只适合做相对比较。',
      '- **每条文本大多只录了一次**，个别识别失败可能是单次误读而非模型系统性弱点，' +
        '样本量不足以细分到"某模型在某个具体人名上必然出错"这种结论。',
      '- 语料本身来自会议记录、任务安排这类办公场景，不覆盖医疗、法律等术语密集场景。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 可复现方法');
  lines.push('');
  lines.push('```bash');
  lines.push(
    'npm run bench:stt           # 转写全部录音并计算 CER / 内容覆盖率',
  );
  lines.push('npm run bench:charts        # 从上面的 JSON 生成 SVG 图');
  lines.push('npm run bench:report        # 生成本文件');
  lines.push('```');
  lines.push('');
  lines.push('脚本与语料：');
  lines.push('');
  lines.push(
    '- [stt-recording-protocol.md](./stt-recording-protocol.md) —— 怎么录（环境、语气、设备）',
  );
  lines.push(
    '- [datasets/stt-human-recordings.md](./datasets/stt-human-recordings.md) —— 录什么（文本清单、分段）',
  );
  lines.push(
    '- [stt-recording-corpus.ts](../../scripts/benchmark/stt-recording-corpus.ts) —— 录音文件到原文的映射',
  );
  lines.push(
    '- [stt-human-eval.ts](../../scripts/benchmark/stt-human-eval.ts) —— 评测脚本',
  );
  lines.push('');
  lines.push(`原始 JSON 与转写工作目录：\`${RESULTS}\``);
  lines.push('');
  return lines.join('\n');
}

/* --------------------------- 待办提取报告 --------------------------- */

function buildTodoReport(): string | null {
  const data = readJson('todo-extraction-eval.json');
  if (!data) return null;
  const platform = data.platform as Json;
  const mean = data.mean_across_rounds as Json;
  const rounds = data.rounds as Json[];

  const lines: string[] = [];
  lines.push('# 待办提取评测（本地 LLM）');
  lines.push('');
  lines.push(
    `测试日期：${String(data.measured_at).slice(0, 10)} · 生成方式：\`npm run bench:todo\` → \`npm run bench:report\``,
  );
  lines.push('');

  lines.push('## 实验设置');
  lines.push('');
  lines.push(
    table(
      ['项目', '值'],
      [
        ['模型', `\`${data.model}\``],
        ['模型摘要', `\`${String(data.model_digest).slice(0, 16)}\``],
        [
          '参数量 / 量化',
          `${(data.model_details as Json)?.parameter_size ?? 'n/a'} / ${(data.model_details as Json)?.quantization_level ?? 'n/a'}`,
        ],
        ['运行时', `Ollama，${data.ollama_host}`],
        ['温度', String(data.temperature)],
        ['轮数', String(data.rounds_run)],
        [
          '参考时间',
          `${String(data.reference_datetime).slice(0, 16)}（周四，固定）`,
        ],
        ['系统', String(platform.os)],
        ['CPU', String(platform.cpu)],
      ],
    ),
  );
  lines.push('');
  lines.push(
    '评测走的是与线上完全相同的链路：相对日期改写 → 已完成标注 → 同一份提示词 → 同一套 JSON 解析与去重 → 同一道任务归属复核。因此这里的数字等价于用户实际会看到的结果，而不是另接一条评测专用通路。',
  );
  lines.push('');

  lines.push('## 数据集');
  lines.push('');
  lines.push(
    `共 ${data.case_count} 条用例，分为两个子集。**拆分是这份报告最重要的一件事**：`,
  );
  lines.push('');
  lines.push(
    [
      '- **开发集（dev，22 条）**：调提示词期间反复跑过的用例。提示词就是照着它们改出来的，所以它上面的分数天然偏乐观，只能当回归基线，不能当泛化能力的证据。',
      '- **保留集（holdout，32 条）**：提示词定稿之后才写的用例，写的过程中没有再改动任何提示词。**报告里应该引用的是这一半的数字。**',
    ].join('\n'),
  );
  lines.push('');
  lines.push(
    '两个子集都不是公开标准数据集，而是根据产品需求和真实失败案例构建的手工验收集。语料文件：[todo-extraction-corpus.ts](../../scripts/benchmark/todo-extraction-corpus.ts)。',
  );
  lines.push('');
  const scenarios = Object.keys(rounds[0].by_scenario as Json);
  lines.push(
    table(
      ['场景', '条数'],
      scenarios.map((scenario) => [
        scenario,
        (rounds[0].by_scenario as Json)[scenario].case_count,
      ]),
    ),
  );
  lines.push('');

  lines.push('## 指标定义');
  lines.push('');
  lines.push(
    [
      '- **匹配规则**：预测任务的标题命中某条金标任务的任一关键词，即视为同一条任务；按金标顺序贪心一一匹配。',
      '- **TP / FP / FN**：匹配上的金标任务为 TP，匹配不上的预测项为 FP，没被匹配到的金标任务为 FN。',
      '- **Precision / Recall / F1**：在全部用例上按条目微平均（micro-average）。',
      '- **日期准确率**：在匹配成功且金标标注了日期的任务上，预测日期与期望日期完全相同的比例。',
      '- **重复类型准确率**：在金标标注了周期类型的任务上，预测的 repeat 是否一致。',
      '- **零任务用例假阳性率**：期望零待办的用例中，产生了至少一条待办的比例。',
      '- **用例通过率**：一条用例只有在无漏检、无多抽、日期与重复类型全对、且未命中禁止日期时才算通过。这是最严格的指标，等价于旧报告里「20/22」那种口径。',
      '- **可选任务**：语义本身有歧义的边界用例（例如「老陈提的那个事，不能再拖了」），抽到不计 FP、不抽也不计 FN，避免把主观判断记成模型缺陷。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 结果');
  lines.push('');
  lines.push(`### ${data.rounds_run} 轮平均`);
  lines.push('');
  lines.push(chart('todo-dev-vs-holdout.svg', '开发集与保留集对比'));
  lines.push(
    table(
      ['子集', '用例通过率', 'Precision', 'Recall', 'F1', '日期准确率'],
      [
        [
          '**保留集 holdout**',
          percent(mean.holdout.case_pass_rate),
          percent(mean.holdout.precision),
          percent(mean.holdout.recall),
          percent(mean.holdout.f1),
          percent(mean.holdout.date_accuracy),
        ],
        [
          '开发集 dev',
          percent(mean.dev.case_pass_rate),
          percent(mean.dev.precision),
          percent(mean.dev.recall),
          percent(mean.dev.f1),
          percent(mean.dev.date_accuracy),
        ],
        [
          '全部',
          percent(mean.overall.case_pass_rate),
          percent(mean.overall.precision),
          percent(mean.overall.recall),
          percent(mean.overall.f1),
          percent(mean.overall.date_accuracy),
        ],
      ],
    ),
  );
  lines.push('');
  lines.push(
    table(
      ['其他指标', '值'],
      [
        ['重复类型准确率', percent(mean.overall.repeat_accuracy)],
        [
          '零任务用例假阳性率',
          percent(mean.overall.zero_task_false_positive_rate),
        ],
        [
          '召回失败中属于「合并」而非「漏掉」的比例',
          percent(mean.overall.merged_share_of_misses),
        ],
        ['重复条目率', percent(mean.overall.duplicate_rate)],
        ['输出解析失败率', percent(mean.overall.parse_failure_rate)],
      ],
    ),
  );
  lines.push('');
  lines.push('### 逐轮结果（稳定性）');
  lines.push('');
  lines.push(chart('todo-round-stability.svg', '多轮稳定性'));
  lines.push(
    table(
      ['轮次', '用例通过', 'Precision', 'Recall', 'F1', '日期准确率', '耗时'],
      rounds.map((round) => [
        String(round.round),
        `${round.overall.passed_cases}/${round.overall.case_count}`,
        percent(round.overall.precision),
        percent(round.overall.recall),
        percent(round.overall.f1),
        percent(round.overall.date_accuracy),
        `${(Number(round.elapsed_ms) / 1000).toFixed(0)} s`,
      ]),
    ),
  );
  lines.push('');
  lines.push('### 分场景（第一轮）');
  lines.push('');
  lines.push(chart('todo-by-scenario.svg', '分场景用例通过率'));
  lines.push(
    table(
      ['场景', '条数', '用例通过', 'Precision', 'Recall', 'F1'],
      scenarios.map((scenario) => {
        const item = (rounds[0].by_scenario as Json)[scenario];
        return [
          scenario,
          item.case_count,
          `${item.passed_cases}/${item.case_count}`,
          percent(item.precision),
          percent(item.recall),
          percent(item.f1),
        ];
      }),
    ),
  );
  lines.push('');

  lines.push('### 未通过的用例');
  lines.push('');
  lines.push(chart('todo-failure-types.svg', '失败原因构成'));
  const failuresByCase = new Map<
    string,
    { rounds: number[]; problems: Set<string>; split: string }
  >();
  for (const round of rounds) {
    for (const item of round.scores as Json[]) {
      if (item.passed) continue;
      const entry = failuresByCase.get(String(item.id)) ?? {
        rounds: [],
        problems: new Set<string>(),
        split: String(item.split),
      };
      entry.rounds.push(Number(round.round));
      for (const problem of item.problems as string[])
        entry.problems.add(problem);
      failuresByCase.set(String(item.id), entry);
    }
  }
  if (failuresByCase.size === 0) {
    lines.push('本轮所有用例均通过。');
  } else {
    lines.push(
      table(
        ['用例', '子集', '失败轮次', '问题'],
        [...failuresByCase.entries()].map(([id, entry]) => [
          id,
          entry.split,
          `${entry.rounds.length}/${rounds.length}`,
          [...entry.problems].join('；').replace(/\|/g, '\\|'),
        ]),
      ),
    );
  }
  lines.push('');

  lines.push('## 本轮结论的边界');
  lines.push('');
  lines.push(
    [
      `- 本轮只证明：该任务提取流水线在这 ${data.case_count} 条内部验收用例、这一个模型（\`${data.model}\`）、这一个温度（${data.temperature}）下的表现。`,
      '- 它**不能**推广成「模型在所有真实会议录音上的准确率」。真实录音还会叠加转写错误，本评测的输入是干净文本。',
      '- 它**不能**代表整个 Agent 的成功率。Agent 涉及检索、工具调用与多步推理，需要单独的端到端评测。',
      '- 金标注由单人编写，关键词匹配规则本身也会引入误差；有歧义的用例已标为可选任务，但主观性无法完全消除。',
      '- 未做跨模型对比。本机只安装了一个指令模型，横向对比需要另外拉取模型后重跑同一套脚本。',
    ].join('\n'),
  );
  lines.push('');
  lines.push('## 可复现方法');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run bench:todo                    # 默认 3 轮，全部 54 条');
  lines.push('npm run bench:todo -- --split holdout # 只跑保留集');
  lines.push('npm run bench:charts                  # 生成图');
  lines.push('npm run bench:report                  # 生成本文件');
  lines.push('```');
  lines.push('');
  lines.push(
    '- [todo-extraction-eval.ts](../../scripts/benchmark/todo-extraction-eval.ts)',
  );
  lines.push(
    '- [todo-extraction-corpus.ts](../../scripts/benchmark/todo-extraction-corpus.ts)',
  );
  lines.push(
    '- Jest 回归门禁：[todoExtraction.eval.ts](../../src/__tests__/todoExtraction.eval.ts)',
  );
  lines.push('');
  lines.push(
    `原始 JSON：\`${path.join(RESULTS, 'todo-extraction-eval.json')}\``,
  );
  lines.push('');
  return lines.join('\n');
}

/* ---------------------------- Agent 端到端报告 ---------------------------- */

function buildAgentReport(): string | null {
  const data = readJson('agent-eval.json');
  if (!data) return null;
  const humanAgreement = readJson('agent-eval-human-agreement.json');
  const platform = data.platform as Json;
  const dataset = data.dataset as Json;
  const mean = data.mean_across_rounds as Json;
  const rounds = data.rounds as Json[];
  const probes = data.protocol_probes as Json;
  const lines: string[] = [];

  lines.push('# Agent 端到端评测（本地 LLM + 混合检索）');
  lines.push('');
  lines.push(
    `测试日期：${String(data.measured_at).slice(0, 10)} · 生成方式：\`npm run bench:agent\` → \`npm run bench:charts\` → \`npm run bench:report\``,
  );
  lines.push('');
  lines.push(
    '本报告从逐任务 JSON 自动生成。每次工具调用、检索排名、最终答案、落库待办、规则命中和 Judge 输出都保留在原始结果中。',
  );
  lines.push('');

  lines.push('## 实验设置');
  lines.push('');
  lines.push(
    table(
      ['项目', '值'],
      [
        ['Agent 模型', `\`${data.model}\``],
        ['模型摘要', `\`${String(data.model_digest).slice(0, 16)}\``],
        [
          '参数量 / 量化',
          `${(data.model_details as Json)?.parameter_size ?? 'n/a'} / ${(data.model_details as Json)?.quantization_level ?? 'n/a'}`,
        ],
        ['Agent 温度', String(data.temperature)],
        [
          '脚手架',
          data.harness
            ? `\`${data.harness}\`（${data.harness_describe ?? ''}）`
            : '无（基线，未套用任何脚手架手段）',
        ],
        [
          '随机种子',
          data.random_seed === null
            ? '未设置；生产 AgentChatService 不传 seed，以三轮结果观察随机性'
            : String(data.random_seed),
        ],
        ['Embedding', `\`${data.embedding_model}\``],
        [
          'Embedding 摘要',
          `\`${String(data.embedding_model_digest).slice(0, 16)}\``,
        ],
        [
          'LLM Judge',
          data.judge
            ? `\`${data.judge.model}\`，温度 ${data.judge.temperature}`
            : '关闭',
        ],
        ['重复轮数', String(data.rounds_run)],
        ['系统', String(platform.os)],
        ['CPU', String(platform.cpu)],
        ['内存', mib(platform.total_memory_bytes)],
        ['Node / Electron', `${platform.node} / ${platform.electron}`],
      ],
    ),
  );
  lines.push('');
  lines.push(
    '评测直接运行生产代码中的 `AgentOrchestrator`、`AgentChatService`、三种 Agent 工具、`SemanticNoteService`、RRF 融合以及 `TodoExtractionService`。唯一替换的是数据根目录和激活模型读取方式，用于隔离用户数据库并固定被测模型。',
  );
  lines.push('');

  lines.push('## 数据集');
  lines.push('');
  lines.push(
    `固定库包含 ${dataset.note_count} 条笔记、4 个 workspace；本轮运行 ${dataset.task_count} 个任务。数据集 SHA-256：\`${String(dataset.hash).slice(0, 16)}…\`。`,
  );
  lines.push('');
  lines.push(
    table(
      ['语言', '笔记数'],
      Object.entries(dataset.language_counts as Json).map(
        ([language, count]) => [language, Number(count)],
      ),
    ),
  );
  lines.push('');
  lines.push(
    table(
      ['长度档', '笔记数'],
      Object.entries(dataset.length_counts as Json).map(([bucket, count]) => [
        bucket,
        Number(count),
      ]),
    ),
  );
  lines.push('');
  const scenarios = Object.keys(rounds[0].by_scenario as Json);
  lines.push(
    table(
      ['任务类型', '任务数'],
      scenarios.map((scenario) => [
        scenario,
        (rounds[0].by_scenario as Json)[scenario].case_count,
      ]),
    ),
  );
  lines.push('');
  lines.push(
    [
      `- **dev（${mean.dev.case_count} 个）**：用于选定脚手架方案、调试评测器、补齐同义表达匹配和验证接线。`,
      `- **holdout（${mean.holdout.case_count} 个）**：任务定义在首次完整模型运行前冻结；不能根据其失败修改 Agent 提示词。`,
      '- 笔记 key 稳定，SQLite id 由每次种子重建生成并写入 manifest；判分不依赖偶然的自增 id。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 指标定义');
  lines.push('');
  lines.push(
    [
      '- **严格任务完成率**：必需事实全部命中、无禁止事实、答案模式正确、必要工具已调用、待办落库正确、无成功越界，且 Agent 正常结束。一项失败即整题失败。',
      '- **事实覆盖率**：最终答案命中的金标原子事实数 ÷ 应包含的事实数。语料预先列出可接受的中英文同义表达。',
      '- **答案模式准确率**：应回答、应拒答、应澄清三种模式是否正确。',
      '- **Recall@K / MRR / nDCG@8**：只用第一次真实 `search_notes` 的有序结果；关联笔记直接预载，不进入检索指标分母。',
      '- **Run coverage / Read coverage**：整次运行的搜索结果并集、实际读取笔记分别覆盖多少金标证据。',
      '- **不必要工具调用**：确定性统计相同参数重复调用、重复读取、关联上下文的再次读取，以及非待办任务调用 `extract_todos`。探索性搜索不武断计错。',
      '- **Groundedness**：Judge 将答案中的可核验事实与允许证据对照。该值尚未通过人工一致性校验，因此只作实验性指标。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 结果');
  lines.push('');
  lines.push(chart('agent-dev-vs-holdout.svg', 'Agent 开发集与保留集'));
  lines.push(
    table(
      [
        '子集',
        '严格完成率',
        '事实覆盖率',
        '答案模式',
        'Judge 通过率',
        'Groundedness',
      ],
      [
        [
          '**holdout**',
          percent(mean.holdout.case_pass_rate),
          percent(mean.holdout.fact_coverage),
          percent(mean.holdout.answer_mode_accuracy),
          percent(mean.holdout.judge_pass_rate),
          percent(mean.holdout.groundedness),
        ],
        [
          'dev',
          percent(mean.dev.case_pass_rate),
          percent(mean.dev.fact_coverage),
          percent(mean.dev.answer_mode_accuracy),
          percent(mean.dev.judge_pass_rate),
          percent(mean.dev.groundedness),
        ],
        [
          '全部',
          percent(mean.overall.case_pass_rate),
          percent(mean.overall.fact_coverage),
          percent(mean.overall.answer_mode_accuracy),
          percent(mean.overall.judge_pass_rate),
          percent(mean.overall.groundedness),
        ],
      ],
    ),
  );
  lines.push('');

  lines.push('### 检索');
  lines.push('');
  // 分母必须写出来。只有 requiresSearch 的任务进入检索指标，
  // 其余任务的笔记是预载的，没有「检索」这个动作可以评价。
  // 不标分母的话，一整行三位小数的 IR 指标会被误读成大样本结果。
  const retrievalTaskIds = [
    ...new Set(
      rounds.flatMap((round) =>
        (round.cases as Json[])
          .filter((item) => item.score?.retrieval?.recall_at_8 !== null)
          .map((item) => String(item.score.id)),
      ),
    ),
  ];
  const retrievalRuns = rounds.reduce(
    (sum, round) =>
      sum +
      (round.cases as Json[]).filter(
        (item) => item.score?.retrieval?.recall_at_8 !== null,
      ).length,
    0,
  );
  // 「模型不读完整笔记」这个结论必须用真实调用次数说话：
  // 早先的措辞写成「不再调用 read_note」，但全局其实调用了 24 次，会被一眼看穿。
  const countCalls = (item: Json, tool: string) =>
    ((item.steps as Json[]) ?? []).filter(
      (step) => step.type === 'tool_call' && step.tool === tool,
    ).length;
  const totalRuns = rounds.reduce(
    (sum, round) => sum + (round.cases as Json[]).length,
    0,
  );
  const readNoteCalls = rounds.reduce(
    (sum, round) =>
      sum +
      (round.cases as Json[]).reduce(
        (inner, item) => inner + countCalls(item, 'read_note'),
        0,
      ),
    0,
  );
  const retrievalRunsWithRead = rounds.reduce(
    (sum, round) =>
      sum +
      (round.cases as Json[]).filter(
        (item) =>
          item.score?.retrieval?.recall_at_8 !== null &&
          countCalls(item, 'read_note') > 0,
      ).length,
    0,
  );

  lines.push(
    `> **分母：${retrievalTaskIds.length} 个任务 × ${rounds.length} 轮 = ${retrievalRuns} 次检索**` +
      `（${retrievalTaskIds.join('、')}）。其余任务的笔记由 \`linkedNoteKeys\` 直接预载，不经过 \`search_notes\`，因此不计入。\n>\n` +
      `> **这个样本量很小**：单个任务翻面就会让 Recall@8 变动约 ${(100 / retrievalRuns).toFixed(1)} 个百分点。` +
      `下面的数字只能当作方向性观察，不足以支撑检索质量的结论；要得到可用的 IR 指标，检索类任务需要扩到 20 条以上。`,
  );
  lines.push('');
  lines.push(chart('agent-retrieval.svg', 'Agent 检索指标'));
  lines.push(
    table(
      [
        'Recall@1',
        'Recall@3',
        'Recall@5',
        'Recall@8',
        'MRR',
        'nDCG@8',
        'Run coverage',
        'Read coverage',
      ],
      [
        [
          percent(mean.overall.recall_at_1),
          percent(mean.overall.recall_at_3),
          percent(mean.overall.recall_at_5),
          percent(mean.overall.recall_at_8),
          fixed(mean.overall.mrr),
          fixed(mean.overall.ndcg_at_8),
          percent(mean.overall.run_coverage),
          percent(mean.overall.read_coverage),
        ],
      ],
    ),
  );
  lines.push('');

  lines.push('### 分任务类型与效率');
  lines.push('');
  lines.push(chart('agent-by-scenario.svg', 'Agent 分任务类型完成率'));
  lines.push(chart('agent-efficiency.svg', 'Agent 工具与循环效率'));
  lines.push(chart('agent-latency-by-scenario.svg', 'Agent 分任务类型延迟'));
  lines.push(
    table(
      ['任务类型', '严格完成率', '事实覆盖率', '平均工具调用', '平均模型轮数'],
      scenarios.map((scenario) => {
        const values = rounds.map(
          (round) => (round.by_scenario as Json)[scenario] as Json,
        );
        const average = (field: string) =>
          values.reduce((sum, item) => sum + Number(item[field] ?? 0), 0) /
          values.length;
        return [
          scenario,
          percent(average('case_pass_rate')),
          percent(average('fact_coverage')),
          fixed(average('mean_tool_calls'), 2),
          fixed(average('mean_model_turns'), 2),
        ];
      }),
    ),
  );
  lines.push('');
  lines.push(
    table(
      ['效率 / 安全指标', '值'],
      [
        [
          '平均不必要工具调用 / 任务',
          fixed(mean.overall.mean_unnecessary_tool_calls, 2),
        ],
        [
          '重复调用尝试（全部轮次）',
          String(mean.overall.duplicate_call_attempts),
        ],
        ['成功范围违规率', percent(mean.overall.scope_violation_rate)],
      ],
    ),
  );
  lines.push('');

  lines.push('## 主要发现');
  lines.push('');
  lines.push(
    [
      `- 保留集严格完成率为 ${percent(mean.holdout.case_pass_rate)}，但事实覆盖率为 ${percent(mean.holdout.fact_coverage)}；主要损失不是单纯“什么都不知道”，而是检索后的证据使用、应拒答时继续作答、应澄清时自行选择。`,
      `- 首次检索 Recall@8 为 ${percent(mean.overall.recall_at_8)}（n=${retrievalRuns}），而 Read coverage 为 ${percent(mean.overall.read_coverage)}：${retrievalRuns} 次检索任务运行里只有 ${retrievalRunsWithRead} 次调用了 \`read_note\`，且读到的都不是金标笔记。全部 ${totalRuns} 次任务运行中 \`read_note\` 共调用 ${readNoteCalls} 次，模型多数情况下直接依据 240 字搜索预览作答，而不是打开完整笔记核对。`,
      `- 无答案任务严格完成率为 ${percent(rounds.reduce((sum, round) => sum + Number(round.by_scenario.unanswerable.case_pass_rate), 0) / rounds.length)}，歧义澄清为 ${percent(rounds.reduce((sum, round) => sum + Number(round.by_scenario.ambiguous.case_pass_rate), 0) / rounds.length)}；这是当前最稳定的失败类型。`,
      `- 三轮均未出现成功的范围外读取或副作用；重复调用、步数上限与取消探针全部通过。`,
      '- Judge 与规则判分存在明显分歧，且 Judge 尚无人类校准；当前应优先引用严格规则、逐任务轨迹和检索指标。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('### 多轮稳定性');
  lines.push('');
  lines.push(chart('agent-round-stability.svg', 'Agent 多轮稳定性'));
  lines.push(
    table(
      [
        '轮次',
        '严格完成',
        '事实覆盖率',
        'Judge 通过率',
        'Recall@8',
        '总耗时（含 Judge）',
      ],
      rounds.map((round) => [
        String(round.round),
        `${round.overall.passed_cases}/${round.overall.case_count}`,
        percent(round.overall.fact_coverage),
        percent(round.overall.judge_pass_rate),
        percent(round.overall.recall_at_8),
        `${(Number(round.elapsed_ms) / 1000).toFixed(0)} s`,
      ]),
    ),
  );
  lines.push('');

  lines.push('### 协议终止探针');
  lines.push('');
  lines.push(
    table(
      ['探针', '结果', '诊断'],
      [
        [
          '相同调用短路',
          probes.duplicate_call.passed ? '通过' : '失败',
          `尝试 ${probes.duplicate_call.attempted}，实际执行 ${probes.duplicate_call.executed}`,
        ],
        [
          '步数上限',
          probes.step_limit.passed ? '通过' : '失败',
          `各轮可用工具数 ${probes.step_limit.tools_offered_by_turn.join(' → ')}`,
        ],
        [
          '取消',
          probes.cancellation.passed ? '通过' : '失败',
          `终态 ${probes.cancellation.terminal_event}，取消后副作用 ${probes.cancellation.side_effects_after_cancel}，延迟 ${probes.cancellation.cancellation_latency_ms} ms`,
        ],
      ],
    ),
  );
  lines.push('');

  lines.push('### 未严格通过的任务');
  lines.push('');
  const failures = new Map<
    string,
    { rounds: number[]; problems: Set<string>; scenario: string }
  >();
  for (const round of rounds) {
    for (const item of round.cases as Json[]) {
      if (item.score.passed) continue;
      const entry = failures.get(String(item.task.id)) ?? {
        rounds: [],
        problems: new Set<string>(),
        scenario: String(item.task.scenario),
      };
      entry.rounds.push(Number(round.round));
      (item.score.problems as string[]).forEach((problem) =>
        entry.problems.add(problem),
      );
      failures.set(String(item.task.id), entry);
    }
  }
  if (failures.size === 0) {
    lines.push('全部任务在全部轮次严格通过。');
  } else {
    lines.push(
      table(
        ['任务', '类型', '失败轮次', '问题'],
        [...failures.entries()].map(([id, entry]) => [
          id,
          entry.scenario,
          `${entry.rounds.length}/${rounds.length}`,
          [...entry.problems].join('；').replace(/\|/g, '\\|'),
        ]),
      ),
    );
  }
  lines.push('');

  lines.push('## Judge 状态：未校准');
  lines.push('');
  lines.push(
    '**本轮的 LLM Judge 没有经过人类校准，因此 Judge 通过率与 Groundedness 只能作为实验性参考，' +
      '不能作为结论依据。** 报告的主指标是严格规则判分。',
  );
  lines.push('');
  const reviewerType = humanAgreement?.review_provenance?.reviewer_type;
  if (humanAgreement?.status === 'complete' && reviewerType === 'human') {
    // 真的有人类标签时，κ 才是它本来的含义：自动 Judge 与人类判断的一致程度。
    lines.push(
      table(
        [
          '人工盲审标签',
          '盲审通过率',
          '盲审 Groundedness',
          '原始通过判定一致率',
          'Cohen’s κ',
          'Groundedness 加权 κ',
        ],
        [
          [
            `${humanAgreement.labelled_count}/${humanAgreement.requested_count}`,
            percent(humanAgreement.blind_review_pass_rate),
            fixed(humanAgreement.blind_review_groundedness_mean),
            percent(humanAgreement.raw_pass_agreement),
            fixed(humanAgreement.cohen_kappa),
            fixed(humanAgreement.groundedness_weighted_kappa),
          ],
        ],
      ),
    );
  } else if (
    humanAgreement?.status === 'complete' &&
    process.env.REPORT_SHOW_MODEL_REVIEW === '1'
  ) {
    /*
     * 标签是模型打的。这里刻意不报 Cohen’s κ：
     * κ 是评分者间信度统计量，前提是评分者相互独立，用途是检验自动 Judge
     * 是否与「我们真正在意的判断」（人类判断）一致。两个同族大模型的误差是
     * 相关的，算出来的 κ 既不满足前提，也回答不了那个问题。
     * 保留下来的是它真正能说明的东西：两次独立评分之间的分歧程度，
     * 这是评分标准是否含糊的信号，而不是 Judge 的有效性证据。
     */
    lines.push(
      table(
        [
          '第二次独立评分（模型，非人类）',
          '通过率',
          'Groundedness',
          '与自动 Judge 的原始一致率',
        ],
        [
          [
            `${humanAgreement.labelled_count}/${humanAgreement.requested_count}`,
            percent(humanAgreement.blind_review_pass_rate),
            fixed(humanAgreement.blind_review_groundedness_mean),
            percent(humanAgreement.raw_pass_agreement),
          ],
        ],
      ),
    );
    lines.push('');
    lines.push(
      [
        `这一列标签由另一个大模型在看不到自动 Judge 结论的条件下打出，**不是人类标注**，因此：`,
        '',
        '- 它**不能**用来验证 Judge 的有效性。Cohen’s κ 的前提是评分者独立、且其中一方是我们真正在意的判断基准；两个同族模型的误差相关，κ 在这里不可解释，故本表不报 κ。',
        `- 它能说明的是另一件事：两次独立评分对「什么算完成任务」只有 ${percent(humanAgreement.raw_pass_agreement)} 的一致率。这说明**判分标准本身存在歧义**，是评分细则需要收紧的信号。`,
        `- 两个数字的落差也值得注意：严格规则判分 ${percent(mean.overall.case_pass_rate)}、自动 Judge ${percent(mean.overall.judge_pass_rate)}、第二次模型评分 ${percent(humanAgreement.blind_review_pass_rate)}。大模型给大模型的输出打分普遍偏松，最高的那个数字恰恰最不可信。`,
        '',
        `**要得到可引用的 Judge 校准结果，需要真人标注。** ${dataset.task_count} 条里分层抽 10–12 条即可得到有意义的 κ；`,
        '填好 `agent-eval-human-review.json` 中的 `human_pass` / `human_groundedness` 后运行 `npm run bench:agent:human`。',
      ].join('\n'),
    );
  } else {
    /*
     * 报告里只放真正测出来的东西。
     *
     * `agent-eval-human-review.json` 里目前那一列标签是另一个大模型打的，
     * 不是人类标注，所以它既不能验证 Judge，也不该在报告里占一张表 ——
     * 那会让读者以为校准做过了。这里只保留它唯一能说明的事实：
     * 两次独立评分对「什么算完成任务」分歧很大，即判分细则本身含糊。
     */
    const modelReviewAgreement =
      humanAgreement?.status === 'complete'
        ? humanAgreement.raw_pass_agreement
        : null;
    lines.push(
      [
        '本轮**没有**人类盲审标签，因此不报告一致率与 Cohen’s κ —— κ 的前提是评分者独立、',
        '且其中一方是我们真正在意的判断基准，用另一个大模型顶替得到的只是模型间一致率，回答不了 Judge 是否可信。',
        '',
        `因此报告的主指标是**严格规则判分**（${percent(mean.overall.case_pass_rate)}），它逐条可核对；`,
        `Judge 通过率（${percent(mean.overall.judge_pass_rate)}）与 Groundedness 只列在上文表格中供参考，不作结论依据。`,
        ...(modelReviewAgreement !== null
          ? [
              '',
              `> 附带的一个观察：曾用另一个大模型对同一批答案做过第二次独立评分，两者对「什么算完成任务」只有 ${percent(modelReviewAgreement)} 的一致率。`,
              '> 这不构成 Judge 的有效性证据，但它说明**判分细则本身存在歧义**，是评分标准需要收紧的信号。',
            ]
          : []),
        '',
        `要补齐校准：在 \`agent-eval-human-review.json\` 中分层抽 10–12 条由真人填写 \`human_pass\` 与 \`human_groundedness\`，再运行 \`npm run bench:agent:human\`。`,
      ].join('\n'),
    );
  }
  lines.push('');

  lines.push('## 本轮结论的边界');
  lines.push('');
  lines.push(
    [
      `- 这些数据只描述固定的 ${dataset.note_count} 条合成笔记、${dataset.task_count} 个内部任务、模型 \`${data.model}\` 与当前机器。`,
      `- **检索指标的样本量只有 ${retrievalTaskIds.length} 个任务 / ${retrievalRuns} 次运行**，不足以支撑关于检索质量的结论；Recall / MRR / nDCG 只能当方向性观察，需要把检索类任务扩到 20 条以上才可引用。`,
      '- 数据集不是公开标准集，金标与规则由单人编写；同义表达虽在 dev 冒烟后补齐，仍可能漏判合理表述。',
      '- holdout 可用于本轮泛化观察，但一旦据此修改提示词，它就必须降级为开发集，并另写第三批验收任务。',
      humanAgreement?.review_provenance?.reviewer_type === 'human'
        ? '- Judge 与被测 Agent 当前使用同一模型，可能共享偏差；应结合已完成的人工一致性验证解释 Judge 指标。'
        : '- Judge 与被测 Agent 当前使用同一模型，可能共享偏差；模型模拟盲审不等同真实人类验证，不应单独依据 Judge 指标作产品决策。',
      '- 评测证明的是本地笔记问答链路，不证明真实用户问题分布、超大笔记库、ASR 错误输入或跨平台表现。',
      '- 协议探针使用确定性脚本模型，只证明生产编排器的代码约束；它不代表真实模型一定会主动采取最佳工具策略。',
      ...(data.harness
        ? [
            `- **这一轮套用了脚手架（${data.harness}）**，dev ${mean.dev.case_pass_rate !== null ? percent(mean.dev.case_pass_rate) : 'n/a'} ` +
              `与 holdout ${mean.holdout.case_pass_rate !== null ? percent(mean.holdout.case_pass_rate) : 'n/a'} 之间的差距是脚手架在保留集上的真实效果，` +
              '不是基线 Agent 的效果；要看不套脚手架的基线数字，参照 llm-model-sweep.md 里同一模型的 Agent 行。',
          ]
        : []),
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 可复现方法与绘图数据');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run bench:agent:seed');
  lines.push('npm run bench:agent');
  lines.push('npm run bench:agent:rescore # 只重跑判分，不调用模型');
  lines.push('npm run bench:agent:human   # 填完盲审标签后计算 κ');
  lines.push('npm run bench:charts');
  lines.push('npm run bench:report');
  lines.push('```');
  lines.push('');
  lines.push(
    '- [agent-eval-corpus.ts](../../scripts/benchmark/agent-eval-corpus.ts)',
  );
  lines.push('- [agent-eval.ts](../../scripts/benchmark/agent-eval.ts)');
  lines.push(
    '- [agent-eval-scoring.ts](../../scripts/benchmark/agent-eval-scoring.ts)',
  );
  lines.push(
    '- [agent-eval-rescore.ts](../../scripts/benchmark/agent-eval-rescore.ts)',
  );
  lines.push(
    '- [agent-eval-human-scoring.ts](../../scripts/benchmark/agent-eval-human-scoring.ts)',
  );
  lines.push('');
  lines.push(`原始逐任务 JSON：\`${path.join(RESULTS, 'agent-eval.json')}\``);
  lines.push(
    `绘图明细 CSV：\`${path.join(RESULTS, 'agent-eval-plot-data.csv')}\``,
  );
  lines.push(
    `盲审逐样本记录：\`${path.join(RESULTS, 'agent-eval-human-review.json')}\``,
  );
  lines.push('');
  return lines.join('\n');
}

/* ---------------------------- 检索质量报告（跳过 LLM） ---------------------------- */

function buildRetrievalReport(): string | null {
  const data = readJson('embedding-retrieval.json');
  if (!data) return null;
  const overall = data.overall as Json;
  const bySplit = data.by_split as Json;
  const byScenario = data.by_scenario as Json;
  const unanswerable = data.unanswerable_top_score as Json;

  const lines: string[] = [];
  lines.push('# 检索质量评测（跳过 LLM，直接测混合检索）');
  lines.push('');
  lines.push(
    `测试日期：${String(data.measured_at).slice(0, 10)} · 生成方式：\`npm run bench:retrieval\` → \`npm run bench:charts\` → \`npm run bench:report\``,
  );
  lines.push('');
  lines.push(
    '[Agent 端到端评测](./agent-end-to-end-eval.md) 里的 Recall@K/MRR/nDCG 是「LLM 会不会用检索」——' +
      '如果 LLM 干脆不调用 `search_notes`，或者拼了个很差的查询词，这些数字全都会被拖差，' +
      '分不清是检索本身弱还是 LLM 不会用检索。**这份报告反过来**：直接拿任务自带的 instruction 原文当' +
      '查询词，调用生产环境同一个 `createAgentSearchNotesTool`（关键词匹配 + bge-m3 语义向量，' +
      'RRF k=60 融合），跳过 `AgentOrchestrator` 和 LLM 那一层，把「查询词写得好不好」这个变量控制住，' +
      '单独测检索算法本身的召回质量。',
  );
  lines.push('');

  lines.push('## 数据集');
  lines.push('');
  lines.push(
    '复用 [Agent 评测语料](./datasets/agent-eval-corpus.md)（80 笔记、90 任务），不新建语料。' +
      `90 个任务里 37 个标了 \`requiresSearch: true\`，其中 ${data.dataset.gold_task_count} 个有非空的 ` +
      '`relevantNoteKeys` 金标（retrieval 场景 + ambiguous 场景，dev/holdout 各半，' +
      '语料设计时就是配对的），是这份报告的主体。另外 ' +
      `${data.dataset.unanswerable_task_count} 个 \`requiresSearch: true\` 但金标为空的任务属于` +
      ' unanswerable 场景——语料库里本来就没有对应笔记，不计入 Recall/MRR/nDCG，只在文末单独看一眼。',
  );
  lines.push('');

  lines.push('## 结果：开发集 vs 保留集');
  lines.push('');
  lines.push(
    chart('retrieval-dev-vs-holdout.svg', '检索质量：开发集 vs 保留集'),
  );
  lines.push(
    table(
      [
        '子集',
        '任务数',
        'Recall@1',
        'Recall@3',
        'Recall@5',
        'Recall@8',
        'MRR',
        'nDCG@8',
      ],
      [
        [
          'dev',
          String(bySplit.dev.case_count),
          percent(bySplit.dev.recall_at_1),
          percent(bySplit.dev.recall_at_3),
          percent(bySplit.dev.recall_at_5),
          percent(bySplit.dev.recall_at_8),
          fixed(bySplit.dev.mrr),
          fixed(bySplit.dev.ndcg_at_8),
        ],
        [
          'holdout',
          String(bySplit.holdout.case_count),
          percent(bySplit.holdout.recall_at_1),
          percent(bySplit.holdout.recall_at_3),
          percent(bySplit.holdout.recall_at_5),
          percent(bySplit.holdout.recall_at_8),
          fixed(bySplit.holdout.mrr),
          fixed(bySplit.holdout.ndcg_at_8),
        ],
        [
          '全部',
          String(overall.case_count),
          percent(overall.recall_at_1),
          percent(overall.recall_at_3),
          percent(overall.recall_at_5),
          percent(overall.recall_at_8),
          fixed(overall.mrr),
          fixed(overall.ndcg_at_8),
        ],
      ],
    ),
  );
  lines.push('');

  lines.push('## 结果：分场景');
  lines.push('');
  lines.push(chart('retrieval-by-scenario.svg', '检索质量：分场景'));
  lines.push(
    table(
      ['场景', '任务数', 'Recall@8', 'MRR', 'nDCG@8', '说明'],
      [
        [
          'retrieval',
          String(byScenario.retrieval.case_count),
          percent(byScenario.retrieval.recall_at_8),
          fixed(byScenario.retrieval.mrr),
          fixed(byScenario.retrieval.ndcg_at_8),
          '单一正确笔记',
        ],
        [
          'ambiguous',
          String(byScenario.ambiguous.case_count),
          percent(byScenario.ambiguous.recall_at_8),
          fixed(byScenario.ambiguous.mrr),
          fixed(byScenario.ambiguous.ndcg_at_8),
          '金标是多条相关笔记（如 Atlas / Phoenix 两个相似项目）',
        ],
      ],
    ),
  );
  lines.push('');

  if (
    fs.existsSync(path.join(DOCS, 'charts', 'retrieval-vs-llm-mediated.svg'))
  ) {
    lines.push('## 检索算法本身 vs 经 LLM 调用');
    lines.push('');
    lines.push(
      chart(
        'retrieval-vs-llm-mediated.svg',
        '直接查询 vs 经 LLM 调用的检索质量',
      ),
    );
    lines.push(
      '两组用的是同一套混合检索算法，唯一变量是查询词谁写的：本报告用任务原文，' +
        'Agent 报告用 LLM 自己决定的查询词（如果它决定要搜索的话）。差距越大，说明' +
        '产品里更值得优化的不是检索算法，而是让 LLM 更愿意搜索、更会写查询词。',
    );
    lines.push('');
  }

  lines.push('## 附：unanswerable 场景对照');
  lines.push('');
  lines.push(
    `${unanswerable.case_count} 条任务的语料库里本来就没有对应笔记（金标为空），不计入上面的指标。` +
      `这组任务里检索返回的最高置信度分数均值为 ${fixed(unanswerable.mean_top_score, 3)}` +
      `（有金标的任务组可以自行对照 tasks 里的 top_score 字段）。分数没有明显走低，说明当前的` +
      '混合检索在"库里没有答案"时不会主动降低置信度——这不是本次改动范围内的缺陷，' +
      '只是提醒：不能指望这套检索自己判断"查不到"，判断权始终在下游 LLM 手里。',
  );
  lines.push('');

  lines.push('## 本轮结论的边界');
  lines.push('');
  lines.push(
    [
      `- 样本量小。全部 ${data.dataset.gold_task_count} 个任务里 retrieval ${byScenario.retrieval.case_count} 条、` +
        `ambiguous ${byScenario.ambiguous.case_count} 条，dev/holdout 各 ${bySplit.dev.case_count} 条倒是配对的；` +
        '单个任务翻面就能明显移动整体数字，只作方向性观察。',
      '- 查询词直接用任务 instruction 原文，比真实用户的口语化提问更规整、更贴近关键词；' +
        '真实查询词的检索质量可能更低。',
      '- 只测了一个 embedding 模型（bge-m3），没有跟其他本地可用的 embedding 模型比较过。',
      '- unanswerable 对照只看了置信度分数是否走低，没有系统评估"检索该不该返回结果"这件事。',
    ].join('\n'),
  );
  lines.push('');

  lines.push('## 可复现方法');
  lines.push('');
  lines.push('```bash');
  lines.push(
    'npm run bench:agent:seed    # 重建固定笔记库（80 笔记 / 90 任务）',
  );
  lines.push('npm run bench:retrieval     # 跳过 LLM，直接测混合检索');
  lines.push('npm run bench:charts        # 从上面的 JSON 生成 SVG 图');
  lines.push('npm run bench:report        # 生成本文件');
  lines.push('```');
  lines.push('');
  lines.push(
    '脚本：[embedding-retrieval-eval.ts](../../scripts/benchmark/embedding-retrieval-eval.ts)，' +
      '直接调用生产代码 [AgentSearchNotesTool.ts](../../src/main/agent/AgentSearchNotesTool.ts)，' +
      '未新增或修改任何生产逻辑。',
  );
  lines.push('');
  lines.push(
    `原始逐任务 JSON：\`${path.join(RESULTS, 'embedding-retrieval.json')}\``,
  );
  lines.push('');
  return lines.join('\n');
}

/* -------------------------------- 主流程 -------------------------------- */

function main(): void {
  fs.mkdirSync(DOCS, { recursive: true });
  let written = 0;

  const ttsReport = buildTTSReport();
  if (ttsReport) {
    const target = path.join(DOCS, 'tts-model-benchmark-windows.md');
    fs.writeFileSync(target, `${ttsReport.trimEnd()}\n`);
    process.stdout.write(`已生成 ${target}\n`);
    written += 1;
  } else {
    process.stdout.write('跳过 TTS 报告：没有找到 tts-*.json\n');
  }

  const sttReport = buildSTTReport();
  if (sttReport) {
    const target = path.join(DOCS, 'stt-human-eval.md');
    fs.writeFileSync(target, `${sttReport.trimEnd()}\n`);
    process.stdout.write(`已生成 ${target}\n`);
    written += 1;
  } else {
    process.stdout.write('跳过真人 STT 报告：没有找到 stt-human.json\n');
  }

  const todoReport = buildTodoReport();
  if (todoReport) {
    const target = path.join(DOCS, 'task-extraction-eval.md');
    fs.writeFileSync(target, `${todoReport.trimEnd()}\n`);
    process.stdout.write(`已生成 ${target}\n`);
    written += 1;
  } else {
    process.stdout.write(
      '跳过待办提取报告：没有找到 todo-extraction-eval.json\n',
    );
  }

  const sweepReport = buildSweepReport();
  if (sweepReport) {
    const target = path.join(DOCS, 'llm-model-sweep.md');
    fs.writeFileSync(target, `${sweepReport.trimEnd()}\n`);
    process.stdout.write(`已生成 ${target}\n`);
    written += 1;
  }

  const agentReport = buildAgentReport();
  if (agentReport) {
    const target = path.join(DOCS, 'agent-end-to-end-eval.md');
    fs.writeFileSync(target, `${agentReport.trimEnd()}\n`);
    process.stdout.write(`已生成 ${target}\n`);
    written += 1;
  } else {
    process.stdout.write('跳过 Agent 报告：没有找到 agent-eval.json\n');
  }

  const retrievalReport = buildRetrievalReport();
  if (retrievalReport) {
    const target = path.join(DOCS, 'retrieval-eval.md');
    fs.writeFileSync(target, `${retrievalReport.trimEnd()}\n`);
    process.stdout.write(`已生成 ${target}\n`);
    written += 1;
  } else {
    process.stdout.write(
      '跳过检索质量报告：没有找到 embedding-retrieval.json\n',
    );
  }

  if (written === 0) process.exitCode = 1;
}

main();
