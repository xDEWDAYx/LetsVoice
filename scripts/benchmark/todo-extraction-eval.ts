/**
 * 待办提取的离线评测（带指标统计）。
 *
 * 跑的是和线上完全相同的链路：相对日期改写 → 已完成标注 → 同一份提示词 →
 * 同一套解析与去重 → 同一道归属复核。所以这里的数字等价于用户实际会看到的结果。
 *
 *   npm run bench:todo
 *   npm run bench:todo -- --rounds 3 --model qwen2.5:3b-instruct
 *   npm run bench:todo -- --split holdout
 *
 * 与 src/__tests__/todoExtraction.eval.ts 的区别：那个是 Jest 里的通过/失败回归门禁，
 * 这个负责出可以写进报告的 Precision / Recall / F1 等聚合指标。两者共用同一份
 * 语料（todo-extraction-corpus.ts）和同一套判定（todo-extraction-scoring.ts）。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { buildDateReference } from '../../src/main/dashboard/DateContext';
import { rewriteRelativeDates } from '../../src/main/dashboard/RelativeDateRewriter';
import {
  annotateCompletedClauses,
  isEntirelyCompleted,
} from '../../src/main/dashboard/CompletionDetector';
import { buildExtractionPrompt } from '../../src/main/dashboard/TodoExtractionPrompt';
import {
  allowsOwnershipDrops,
  buildOwnershipPrompt,
  isSuspiciousVerdictSet,
  parseOwnershipVerdicts,
} from '../../src/main/dashboard/TodoOwnershipFilter';
import { EVAL_CASES, EVAL_NOW, EVAL_TODAY } from './todo-extraction-corpus';
import { applyVariant, findVariant } from './model-prompt-profiles';
import {
  bindDates,
  buildFewShotGatePrompt,
  buildGatePrompt,
  describeHarness,
  parseHarness,
  readGate,
  subsumptionDedup,
  voteAcrossSamples,
} from './extraction-harness';
import type { PromptVariant } from './model-prompt-profiles';
import type { EvalCase } from './todo-extraction-corpus';
import {
  aggregate,
  parseModelOutput,
  scoreCase,
} from './todo-extraction-scoring';
import type {
  Aggregate,
  CaseScore,
  Extracted,
} from './todo-extraction-scoring';
import { benchmarkResultsRoot } from './tts-paths';

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const MODEL =
  flagValue('--model') ?? process.env.TODO_EVAL_MODEL ?? 'qwen2.5:3b-instruct';
const ROUNDS = Number(flagValue('--rounds') ?? 3);
const TEMPERATURE = Number(flagValue('--temperature') ?? 0.1);
const HOST =
  flagValue('--host') ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const SPLIT = flagValue('--split');
/** 并发条数。准确率评测可以并发；速度测量绝不可以。 */
const CONCURRENCY = Math.max(1, Number(flagValue('--concurrency') ?? 3));

/**
 * 逐模型提示词变体。默认 baseline，即与线上提示词完全一致。
 * --use-profile 会去读调优阶段冻结下来的档案，按模型自动选。
 */
function resolveVariant(): PromptVariant {
  const explicit = flagValue('--prompt-variant');
  if (explicit) return findVariant(explicit);
  if (process.argv.includes('--use-profile')) {
    const file = path.join(benchmarkResultsRoot(), 'prompt-profiles.json');
    if (fs.existsSync(file)) {
      const profiles = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        chosen?: Record<string, string>;
      };
      const id = profiles.chosen?.[MODEL];
      if (id) return findVariant(id);
    }
  }
  return findVariant('baseline');
}
const PROMPT_VARIANT = resolveVariant();

/**
 * 外层脚手架：`--harness gate,vote3,date,dedup`，逗号分隔，可自由组合。
 * 每一项都能单独开关，这样才能测出各自贡献了多少，
 * 而不是一锅端说「加了一堆东西之后变好了」。
 */
const HARNESS_SPEC = flagValue('--harness');
const HARNESS = parseHarness(HARNESS_SPEC);

/* --------------------------- 本地 Ollama 接入 --------------------------- */

function requestText(
  method: 'GET' | 'POST',
  urlText: string,
  body?: string,
  timeoutMs = 180000,
): Promise<string> {
  const url = new URL(urlText);
  return new Promise((resolve, reject) => {
    const request = http.request(
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
    request.on('timeout', () => request.destroy(new Error('Ollama 请求超时')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function chat(
  prompt: string,
  temperature = TEMPERATURE,
): Promise<string> {
  const raw = await requestText(
    'POST',
    `${HOST}/api/chat`,
    JSON.stringify({
      model: MODEL,
      stream: false,
      options: { temperature },
      messages: [{ role: 'user', content: prompt }],
    }),
  );
  const data = JSON.parse(raw) as { message?: { content?: string } };
  return data.message?.content?.trim() ?? '';
}

/** 应用自带的 Ollama：报告里要写清楚用的是哪个运行时。 */
function locateBundledOllama(): { binary: string; modelsDir: string } | null {
  const executable = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
  const names = [
    'SpeakSpace Local',
    'SpeakSpace',
    'electron-react-boilerplate',
  ];
  const roots =
    process.platform === 'win32'
      ? [process.env.APPDATA ?? '']
      : [path.join(os.homedir(), 'Library', 'Application Support')];
  for (const root of roots) {
    for (const name of names) {
      const binary = path.join(
        root,
        name,
        'runtimes',
        'llm',
        'bin',
        executable,
      );
      const modelsDir = path.join(root, name, 'models', 'llm');
      if (fs.existsSync(binary) && fs.existsSync(modelsDir)) {
        return { binary, modelsDir };
      }
    }
  }
  return null;
}

async function isServerUp(): Promise<boolean> {
  try {
    const raw = await requestText('GET', `${HOST}/api/tags`, undefined, 3000);
    return raw.includes('models');
  } catch {
    return false;
  }
}

/* ------------------------------ 链路复刻 ------------------------------ */

/** 跑一次抽取并解析。投票时会被调用多次。 */
async function extractOnce(
  annotated: string,
  temperature: number,
): Promise<Extracted[] | null> {
  const rawOutput = await chat(
    applyVariant(
      buildExtractionPrompt(annotated, buildDateReference(EVAL_NOW)),
      PROMPT_VARIANT,
    ),
    temperature,
  );
  return parseModelOutput(rawOutput, annotated, EVAL_TODAY);
}

async function extract(testCase: EvalCase): Promise<Extracted[] | null> {
  // 与线上一致：规则先判断整段是否已完成，是就直接零待办，不问模型。
  if (isEntirelyCompleted(testCase.text)) return [];

  const annotated = annotateCompletedClauses(
    rewriteRelativeDates(testCase.text, EVAL_NOW),
  );

  // 二段式门控：先问一个是非题。判断题比「该不该生成空数组」容易得多。
  if (HARNESS.gate) {
    const gatePrompt =
      HARNESS.gateVariant === 2
        ? buildFewShotGatePrompt(annotated)
        : buildGatePrompt(annotated);
    const gateRaw = await chat(gatePrompt, TEMPERATURE);
    if (!readGate(gateRaw)) return [];
  }

  let parsed: Extracted[] | null;
  if (HARNESS.voteSamples > 1) {
    /*
     * 自洽性投票：温度提到 0.6 才有多样性可言。
     * 温度 0.1 下多次采样几乎完全相同，投不出任何信息，
     * 只会白白多花两次调用。
     */
    const samples: Extracted[][] = [];
    for (let index = 0; index < HARNESS.voteSamples; index += 1) {
      const sample = await extractOnce(annotated, 0.6);
      if (sample) samples.push(sample);
    }
    if (samples.length === 0) return null;
    parsed = voteAcrossSamples(samples, HARNESS.voteThreshold);
  } else {
    parsed = await extractOnce(annotated, TEMPERATURE);
  }
  if (!parsed) return null;

  // 日期绑定：不在文本标注集合里的日期直接挡掉，不指望模型自己算对。
  if (HARNESS.dateBind) {
    parsed = bindDates(parsed, annotated, EVAL_TODAY);
  }
  // 语义去重：线上只按「标题+日期完全相同」去重，挡不住复述。
  if (HARNESS.semanticDedup) {
    parsed = subsumptionDedup(parsed);
  }

  // 第二步复核：和线上一样，只有出现明确甩手表述时才跑。
  if (parsed.length > 0 && allowsOwnershipDrops(annotated)) {
    const verdictRaw = await chat(
      buildOwnershipPrompt(
        annotated,
        parsed.map((item) => item.title),
      ),
      TEMPERATURE,
    );
    const verdicts = parseOwnershipVerdicts(verdictRaw, parsed.length);
    return isSuspiciousVerdictSet(verdicts)
      ? parsed
      : parsed.filter((_, index) => !verdicts[index].drop);
  }
  return parsed;
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'n/a'
    : `${(value * 100).toFixed(1)}%`;
}

/* -------------------------------- 主流程 -------------------------------- */

type RoundResult = {
  round: number;
  elapsed_ms: number;
  overall: Aggregate;
  dev: Aggregate;
  holdout: Aggregate;
  by_scenario: Record<string, Aggregate>;
  scores: CaseScore[];
};

async function main(): Promise<void> {
  const cases = EVAL_CASES.filter((item) => !SPLIT || item.split === SPLIT);
  if (cases.length === 0) throw new Error(`没有匹配的用例: --split ${SPLIT}`);

  let serverProcess: ReturnType<typeof spawn> | null = null;
  if (!(await isServerUp())) {
    const bundled = locateBundledOllama();
    if (!bundled) {
      throw new Error(
        `${HOST} 没有响应，也没找到应用自带的 Ollama。请先启动 Ollama 再重试。`,
      );
    }
    process.stdout.write(`启动应用自带的 Ollama: ${bundled.binary}\n`);
    serverProcess = spawn(bundled.binary, ['serve'], {
      env: {
        ...process.env,
        OLLAMA_MODELS: bundled.modelsDir,
        OLLAMA_HOST: HOST.replace(/^https?:\/\//, ''),
      },
      stdio: 'ignore',
    });
    const deadline = Date.now() + 60000;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      // eslint-disable-next-line no-await-in-loop
      ready = await isServerUp();
    }
    if (!ready) {
      serverProcess.kill();
      throw new Error('Ollama 启动超时');
    }
  }

  const tags = JSON.parse(
    await requestText('GET', `${HOST}/api/tags`, undefined, 5000),
  ) as {
    models?: {
      name: string;
      digest: string;
      details?: Record<string, unknown>;
    }[];
  };
  const modelInfo = tags.models?.find((item) => item.name === MODEL) ?? null;
  if (!modelInfo) {
    throw new Error(
      `本地没有模型 ${MODEL}。已安装: ${(tags.models ?? [])
        .map((item) => item.name)
        .join(', ')}`,
    );
  }

  const devCases = cases.filter((item) => item.split === 'dev');
  const holdoutCases = cases.filter((item) => item.split === 'holdout');
  const devIds = new Set(devCases.map((item) => item.id));
  const holdoutIds = new Set(holdoutCases.map((item) => item.id));
  const scenarios = [...new Set(cases.map((item) => item.scenario))];

  process.stdout.write(
    `模型: ${MODEL}\n温度: ${TEMPERATURE}\n轮数: ${ROUNDS}\n` +
      `用例: ${cases.length} 条（dev ${devCases.length} / holdout ${holdoutCases.length}）\n\n`,
  );

  const rounds: RoundResult[] = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    process.stdout.write(`===== 第 ${round} 轮 =====\n`);
    const roundStarted = Date.now();
    /*
     * 并发跑用例。
     *
     * 每条用例彼此独立（同一份提示词、同一个温度、没有共享状态），
     * 并发只是把多条请求同时压给 Ollama，不改变任何一条的输入和判定，
     * 因此结果与串行完全等价。实测 3 并发约 1.8 倍吞吐。
     *
     * 注意这条路只适用于准确率评测。速度与显存那一类测量必须独占机器，
     * 并发会直接让数字失去意义。
     */
    const ordered = new Array<CaseScore>(cases.length);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= cases.length) return;
        const testCase = cases[index];
        const items = await extract(testCase);
        const caseScore = scoreCase(testCase, items);
        ordered[index] = caseScore;
        process.stdout.write(
          `  ${testCase.id} ${caseScore.passed ? '✓' : '✗'} ${testCase.name}` +
            `${caseScore.problems.length ? `\n      ${caseScore.problems.join('; ')}` : ''}\n`,
        );
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker),
    );
    const scores: CaseScore[] = ordered;

    const byScenario: Record<string, Aggregate> = {};
    for (const scenario of scenarios) {
      const subset = cases.filter((item) => item.scenario === scenario);
      const subsetIds = new Set(subset.map((item) => item.id));
      byScenario[scenario] = aggregate(
        scores.filter((item) => subsetIds.has(item.id)),
        subset,
      );
    }
    const result: RoundResult = {
      round,
      elapsed_ms: Date.now() - roundStarted,
      overall: aggregate(scores, cases),
      dev: aggregate(
        scores.filter((item) => devIds.has(item.id)),
        devCases,
      ),
      holdout: aggregate(
        scores.filter((item) => holdoutIds.has(item.id)),
        holdoutCases,
      ),
      by_scenario: byScenario,
      scores,
    };
    rounds.push(result);
    process.stdout.write(
      `第 ${round} 轮: 用例通过 ${result.overall.passed_cases}/${result.overall.case_count}` +
        ` | P ${percent(result.overall.precision)} R ${percent(result.overall.recall)}` +
        ` F1 ${percent(result.overall.f1)} | 日期 ${percent(result.overall.date_accuracy)}` +
        ` | 耗时 ${(result.elapsed_ms / 1000).toFixed(0)}s\n\n`,
    );
  }

  if (serverProcess) serverProcess.kill();

  const meanOf = (pick: (item: RoundResult) => number | null) => {
    const values = rounds
      .map(pick)
      .filter(
        (value): value is number => value !== null && Number.isFinite(value),
      );
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };

  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    model: MODEL,
    model_digest: modelInfo.digest,
    model_details: modelInfo.details ?? null,
    temperature: TEMPERATURE,
    prompt_variant: PROMPT_VARIANT.id,
    harness: HARNESS_SPEC ?? 'off',
    harness_describe: describeHarness(HARNESS),
    prompt_variant_describe: PROMPT_VARIANT.describe,
    ollama_host: HOST,
    reference_datetime: EVAL_NOW.toISOString(),
    platform: {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      total_memory_bytes: os.totalmem(),
      node: process.version,
    },
    rounds_run: ROUNDS,
    case_count: cases.length,
    mean_across_rounds: {
      overall: {
        case_pass_rate: meanOf((r) => r.overall.case_pass_rate),
        precision: meanOf((r) => r.overall.precision),
        recall: meanOf((r) => r.overall.recall),
        f1: meanOf((r) => r.overall.f1),
        date_accuracy: meanOf((r) => r.overall.date_accuracy),
        repeat_accuracy: meanOf((r) => r.overall.repeat_accuracy),
        zero_task_false_positive_rate: meanOf(
          (r) => r.overall.zero_task_false_positive_rate,
        ),
        duplicate_rate: meanOf((r) => r.overall.duplicate_rate),
        merged_share_of_misses: meanOf((r) => r.overall.merged_share_of_misses),
        parse_failure_rate: meanOf((r) => r.overall.parse_failure_rate),
      },
      dev: {
        case_pass_rate: meanOf((r) => r.dev.case_pass_rate),
        precision: meanOf((r) => r.dev.precision),
        recall: meanOf((r) => r.dev.recall),
        f1: meanOf((r) => r.dev.f1),
        date_accuracy: meanOf((r) => r.dev.date_accuracy),
      },
      holdout: {
        case_pass_rate: meanOf((r) => r.holdout.case_pass_rate),
        precision: meanOf((r) => r.holdout.precision),
        recall: meanOf((r) => r.holdout.recall),
        f1: meanOf((r) => r.holdout.f1),
        date_accuracy: meanOf((r) => r.holdout.date_accuracy),
      },
    },
    rounds,
  };

  const resultsRoot = benchmarkResultsRoot();
  fs.mkdirSync(resultsRoot, { recursive: true });
  const outputPath = path.join(resultsRoot, 'todo-extraction-eval.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  // 再按模型名写一份：跨模型扫描时每个模型都要留下自己的结果，
  // 否则后一个模型会覆盖前一个，扫描完只剩最后一次的数据。
  // 规范名同时保留，现有报告生成器不受影响。
  fs.writeFileSync(
    path.join(
      resultsRoot,
      /*
       * 文件名必须同时带上变体和子集。
       *
       * 踩过的坑：调优阶段会用 `--prompt-variant baseline --split dev` 跑对照组，
       * 如果文件名不带这两项，它就会覆盖掉之前**全语料**的基线结果，
       * 而且是静默覆盖 —— 等到要做前后对比时才发现 holdout 数据已经没了。
       */
      `todo-extraction-eval-${MODEL.replace(/[^\w.-]+/g, '_')}${
        PROMPT_VARIANT.id === 'baseline' ? '' : `--${PROMPT_VARIANT.id}`
      }${HARNESS_SPEC ? `--h_${HARNESS_SPEC.replace(/[^\w]+/g, '_')}` : ''}${
        SPLIT ? `--${SPLIT}` : ''
      }.json`,
    ),
    `${JSON.stringify(output, null, 2)}\n`,
  );

  const mean = output.mean_across_rounds;
  process.stdout.write(
    `\n===== ${ROUNDS} 轮平均 =====\n` +
      `全部     用例通过 ${percent(mean.overall.case_pass_rate)} | P ${percent(
        mean.overall.precision,
      )} R ${percent(mean.overall.recall)} F1 ${percent(mean.overall.f1)}\n` +
      `开发集   用例通过 ${percent(mean.dev.case_pass_rate)} | P ${percent(
        mean.dev.precision,
      )} R ${percent(mean.dev.recall)} F1 ${percent(mean.dev.f1)}\n` +
      `保留集   用例通过 ${percent(mean.holdout.case_pass_rate)} | P ${percent(
        mean.holdout.precision,
      )} R ${percent(mean.holdout.recall)} F1 ${percent(mean.holdout.f1)}\n` +
      `日期准确率 ${percent(mean.overall.date_accuracy)} | 重复类型 ${percent(
        mean.overall.repeat_accuracy,
      )} | 零任务用例假阳性率 ${percent(
        mean.overall.zero_task_false_positive_rate,
      )} | 解析失败率 ${percent(mean.overall.parse_failure_rate)}\n` +
      `\n结果: ${outputPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
