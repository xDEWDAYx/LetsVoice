/**
 * 待办提取的离线评测（Jest 回归门禁）。
 *
 * 默认跳过：它要连本机 Ollama，跑一轮几分钟，不适合放进 npm test。
 * 需要时显式打开：
 *
 *   TODO_EVAL=1 npx jest todoExtraction.eval
 *   TODO_EVAL=1 TODO_EVAL_SPLIT=holdout npx jest todoExtraction.eval
 *   TODO_EVAL=1 TODO_EVAL_MODEL=qwen2.5:7b-instruct npx jest todoExtraction.eval
 *
 * 用的是和线上完全相同的 prompt、日期标注和后处理，
 * 所以这里的通过率就是用户实际会看到的表现。
 *
 * 语料和判定与 `npm run bench:todo` 完全共用，两边不会漂移：
 *   scripts/benchmark/todo-extraction-corpus.ts   54 条用例（dev 22 / holdout 32）
 *   scripts/benchmark/todo-extraction-scoring.ts  解析与打分
 * 需要 Precision / Recall / F1 这类聚合指标时用 `npm run bench:todo`，
 * 这里只负责「有没有回退」这一个问题。
 */

import * as http from 'http';
import { buildDateReference } from '../main/dashboard/DateContext';
import { rewriteRelativeDates } from '../main/dashboard/RelativeDateRewriter';
import {
  annotateCompletedClauses,
  isEntirelyCompleted,
} from '../main/dashboard/CompletionDetector';
import { expandOccurrences } from '../main/dashboard/RecurrenceExpander';
import { buildExtractionPrompt } from '../main/dashboard/TodoExtractionPrompt';
import {
  allowsOwnershipDrops,
  buildOwnershipPrompt,
  isSuspiciousVerdictSet,
  parseOwnershipVerdicts,
} from '../main/dashboard/TodoOwnershipFilter';
import {
  EVAL_CASES,
  EVAL_NOW,
  EVAL_TODAY,
} from '../../scripts/benchmark/todo-extraction-corpus';
import {
  parseModelOutput,
  scoreCase,
} from '../../scripts/benchmark/todo-extraction-scoring';
import type { Extracted } from '../../scripts/benchmark/todo-extraction-scoring';

const ENABLED = process.env.TODO_EVAL === '1';
const MODEL = process.env.TODO_EVAL_MODEL ?? 'qwen2.5:3b-instruct';
const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
const SPLIT = process.env.TODO_EVAL_SPLIT;

const CASES = EVAL_CASES.filter((item) => !SPLIT || item.split === SPLIT);

/** jsdom 环境下没有 fetch，直接用 node 的 http 打 Ollama。 */
function chat(prompt: string): Promise<string> {
  const body = JSON.stringify({
    model: MODEL,
    stream: false,
    options: { temperature: 0.1 },
    messages: [{ role: 'user', content: prompt }],
  });
  const url = new URL(`${HOST}/api/chat`);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          try {
            const data = JSON.parse(raw) as { message?: { content?: string } };
            resolve(data.message?.content?.trim() ?? '');
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

const describeMaybe = ENABLED ? describe : describe.skip;

describeMaybe(`待办提取评测 (${MODEL}${SPLIT ? `, ${SPLIT}` : ''})`, () => {
  jest.setTimeout(180000);

  const summary: string[] = [];

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(`\n===== 评测汇总 (${MODEL}) =====\n${summary.join('\n')}\n`);
  });

  CASES.forEach((testCase) => {
    it(`#${testCase.id} [${testCase.split}] ${testCase.name}`, async () => {
      // 与线上同一条链路：日期标注 → 已完成标注 → 整段已完成则短路。
      // 短路时不问模型，直接当作零待办。
      const shortCircuited = isEntirelyCompleted(testCase.text);
      let items: Extracted[] | null = [];

      if (!shortCircuited) {
        const annotated = annotateCompletedClauses(
          rewriteRelativeDates(testCase.text, EVAL_NOW),
        );
        const raw = await chat(
          buildExtractionPrompt(annotated, buildDateReference(EVAL_NOW)),
        );
        const parsed = parseModelOutput(raw, annotated, EVAL_TODAY);
        if (!parsed) {
          summary.push(`#${testCase.id} ✗ 输出无法解析: ${raw.slice(0, 120)}`);
          throw new Error(`模型输出不是 JSON 数组: ${raw.slice(0, 200)}`);
        }
        // 第二步复核：和线上一样，只有出现明确甩手表述才跑。
        items = parsed;
        if (parsed.length > 0 && allowsOwnershipDrops(annotated)) {
          const verdictRaw = await chat(
            buildOwnershipPrompt(
              annotated,
              parsed.map((item) => item.title),
            ),
          );
          const verdicts = parseOwnershipVerdicts(verdictRaw, parsed.length);
          items = isSuspiciousVerdictSet(verdicts)
            ? parsed
            : parsed.filter((_, index) => !verdicts[index].drop);
        }
      }

      const scored = scoreCase(testCase, items);
      const rendered = shortCircuited
        ? '(规则判定为全部已完成，零待办)'
        : (items ?? [])
            .map((item) => {
              const dates = expandOccurrences(item.dueDate, item.repeat);
              const tail =
                dates.length > 1 ? ` ×${dates.length}(${item.repeat})` : '';
              return `${item.dueDate}${tail} ${item.title}`;
            })
            .join(' | ');

      summary.push(
        `#${testCase.id} ${scored.passed ? '✓' : '✗'} ${testCase.name}\n` +
          `    得到: ${rendered || '(空)'}${
            scored.problems.length > 0
              ? `\n    问题: ${scored.problems.join('; ')}`
              : ''
          }`,
      );

      expect(scored.problems).toEqual([]);
    });
  });
});
