/**
 * 检索质量的独立评测：跳过 LLM，直接测「混合检索本身准不准」。
 *
 * Agent 端到端评测里的 Recall@K/MRR/nDCG 是「LLM 会不会用检索」——如果 LLM
 * 干脆不调用 search_notes，或者拼了个很差的查询词，这些数字全都会被拖差，
 * 分不清是检索本身弱还是 LLM 不会用检索。
 *
 * 这里反过来：直接拿任务自带的 instruction 当查询词，调用生产环境同一个
 * createAgentSearchNotesTool（关键词 + bge-m3 语义向量，RRF k=60 融合），
 * 跳过 AgentOrchestrator 和 LLM 那一层，把「查询表达」这个变量控制住，
 * 单独测检索算法本身的召回质量。
 *
 * 数据复用 Agent 评测语料（80 笔记、90 任务），不新建语料：
 * 90 个任务里 37 个标了 requiresSearch=true，其中 24 个有非空的 relevantNoteKeys
 * 金标（retrieval 场景 14 条 + ambiguous 场景 10 条，dev 12 / holdout 12，
 * 均分不是巧合，语料设计时就是配对的）。另外 13 个 requiresSearch=true 但
 * relevantNoteKeys 为空的任务属于 unanswerable 场景——语料库里本来就没有
 * 对应笔记，这里只看返回的最高置信度分数是否明显走低，不计入 Recall/MRR/nDCG。
 *
 *   npm run bench:retrieval
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import ollama from 'ollama';
import createAgentSearchNotesTool from '../../src/main/agent/AgentSearchNotesTool';
import { AgentContext } from '../../src/main/agent/AgentTypes';
import { NoteRepository } from '../../src/main/database/repositories/NoteRepository';
import NoteEmbeddingRepository from '../../src/main/database/repositories/NoteEmbeddingRepository';
import OllamaEmbeddingService from '../../src/main/semantic/OllamaEmbeddingService';
import SemanticNoteContentRepository from '../../src/main/semantic/SemanticNoteContentRepository';
import SemanticNoteService from '../../src/main/semantic/SemanticNoteService';
import { AGENT_EVAL_TASKS, AgentEvalTask } from './agent-eval-corpus';
import { rebuildAgentEvalFixture } from './agent-eval-fixture';
import { benchmarkResultsRoot, benchmarkRoot } from './tts-paths';

const EMBEDDING_MODEL = 'bge-m3';
const MAX_K = 8;

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function recallAtK(ranked: number[], gold: Set<number>, k: number): number {
  if (gold.size === 0) return 0;
  const hits = ranked.slice(0, k).filter((id) => gold.has(id)).length;
  return hits / gold.size;
}

function reciprocalRank(ranked: number[], gold: Set<number>): number {
  const index = ranked.findIndex((id) => gold.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

function ndcgAtK(ranked: number[], gold: Set<number>, k: number): number {
  let dcg = 0;
  ranked.slice(0, k).forEach((id, index) => {
    if (gold.has(id)) dcg += 1 / Math.log2(index + 2);
  });
  const idealHits = Math.min(gold.size, k);
  let idcg = 0;
  for (let index = 0; index < idealHits; index += 1)
    idcg += 1 / Math.log2(index + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type TaskResult = {
  id: string;
  scenario: string;
  split: string;
  instruction: string;
  gold_note_keys: string[];
  ranked_note_ids: number[];
  ranked_note_names: string[];
  recall_at_1: number;
  recall_at_3: number;
  recall_at_5: number;
  recall_at_8: number;
  mrr: number;
  ndcg_at_8: number;
  top_score: number | null;
};

async function main(): Promise<void> {
  const onlySplit = flagValue('--split');
  const resultsRoot = benchmarkResultsRoot();
  fs.mkdirSync(resultsRoot, { recursive: true });
  const logDir = path.join(benchmarkRoot(), 'agent-eval', 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const { database, manifest } = rebuildAgentEvalFixture();
  const notes = new NoteRepository(database);
  const embeddings = new NoteEmbeddingRepository(database);
  const embedder = new OllamaEmbeddingService(ollama, EMBEDDING_MODEL);
  const content = new SemanticNoteContentRepository(database);
  const semantic = new SemanticNoteService(
    notes,
    embeddings,
    embedder,
    content,
  );
  const tool = createAgentSearchNotesTool(notes, semantic);

  const goldTasks: AgentEvalTask[] = AGENT_EVAL_TASKS.filter(
    (task) =>
      task.requiresSearch &&
      task.relevantNoteKeys.length > 0 &&
      (!onlySplit || task.split === onlySplit),
  );
  const unanswerableTasks: AgentEvalTask[] = AGENT_EVAL_TASKS.filter(
    (task) =>
      task.requiresSearch &&
      task.relevantNoteKeys.length === 0 &&
      (!onlySplit || task.split === onlySplit),
  );

  process.stdout.write(
    `检索基准（跳过 LLM，直接用任务 instruction 当查询词）\n` +
      `Embedding: ${EMBEDDING_MODEL}\n有金标的任务: ${goldTasks.length}（含 unanswerable 对照 ${unanswerableTasks.length} 条）\n\n`,
  );

  const results: TaskResult[] = [];
  for (const task of goldTasks) {
    const workspaceId = task.workspaceKey
      ? (manifest.workspace_ids[task.workspaceKey] ?? null)
      : null;
    const context: AgentContext = { workspaceId, linkedNoteIds: [] };
    const raw = await tool.run({ query: task.instruction }, context);
    const parsed = JSON.parse(raw) as {
      notes: { id: number; name: string; score?: number }[];
    };
    const rankedIds = parsed.notes.map((item) => item.id);
    const rankedNames = parsed.notes.map((item) => item.name);
    const goldIds = new Set(
      task.relevantNoteKeys.map((key) => manifest.note_ids[key]),
    );

    const result: TaskResult = {
      id: task.id,
      scenario: task.scenario,
      split: task.split,
      instruction: task.instruction,
      gold_note_keys: task.relevantNoteKeys,
      ranked_note_ids: rankedIds,
      ranked_note_names: rankedNames,
      recall_at_1: recallAtK(rankedIds, goldIds, 1),
      recall_at_3: recallAtK(rankedIds, goldIds, 3),
      recall_at_5: recallAtK(rankedIds, goldIds, 5),
      recall_at_8: recallAtK(rankedIds, goldIds, MAX_K),
      mrr: reciprocalRank(rankedIds, goldIds),
      ndcg_at_8: ndcgAtK(rankedIds, goldIds, MAX_K),
      top_score: parsed.notes[0]?.score ?? null,
    };
    results.push(result);
    process.stdout.write(
      `  ${task.id.padEnd(14)} [${task.scenario.padEnd(10)}] R@1 ${(result.recall_at_1 * 100).toFixed(0)}%  R@8 ${(result.recall_at_8 * 100).toFixed(0)}%  MRR ${result.mrr.toFixed(2)}\n`,
    );
  }

  const unanswerableScores: TaskResult[] = [];
  for (const task of unanswerableTasks) {
    const workspaceId = task.workspaceKey
      ? (manifest.workspace_ids[task.workspaceKey] ?? null)
      : null;
    const context: AgentContext = { workspaceId, linkedNoteIds: [] };
    const raw = await tool.run({ query: task.instruction }, context);
    const parsed = JSON.parse(raw) as {
      notes: { id: number; name: string; score?: number }[];
    };
    unanswerableScores.push({
      id: task.id,
      scenario: task.scenario,
      split: task.split,
      instruction: task.instruction,
      gold_note_keys: [],
      ranked_note_ids: parsed.notes.map((item) => item.id),
      ranked_note_names: parsed.notes.map((item) => item.name),
      recall_at_1: 0,
      recall_at_3: 0,
      recall_at_5: 0,
      recall_at_8: 0,
      mrr: 0,
      ndcg_at_8: 0,
      top_score: parsed.notes[0]?.score ?? null,
    });
  }

  database.close();

  const bySplit = (split: string) => results.filter((r) => r.split === split);
  const byScenario = (scenario: string) =>
    results.filter((r) => r.scenario === scenario);
  const summarize = (subset: TaskResult[]) => ({
    case_count: subset.length,
    recall_at_1: mean(subset.map((r) => r.recall_at_1)),
    recall_at_3: mean(subset.map((r) => r.recall_at_3)),
    recall_at_5: mean(subset.map((r) => r.recall_at_5)),
    recall_at_8: mean(subset.map((r) => r.recall_at_8)),
    mrr: mean(subset.map((r) => r.mrr)),
    ndcg_at_8: mean(subset.map((r) => r.ndcg_at_8)),
  });

  const output = {
    schema_version: 1,
    measured_at: new Date().toISOString(),
    embedding_model: EMBEDDING_MODEL,
    note:
      '直接调用生产环境的 createAgentSearchNotesTool（关键词匹配 + bge-m3 语义向量，' +
      'RRF k=60 融合），跳过 AgentOrchestrator 和 LLM，用任务自带的 instruction 原文' +
      '当查询词。测的是检索算法本身，不测 LLM 会不会用检索、会不会拼查询词。',
    dataset: {
      note_count: manifest.note_count,
      gold_task_count: goldTasks.length,
      unanswerable_task_count: unanswerableTasks.length,
      dataset_hash: manifest.dataset_hash,
    },
    overall: summarize(results),
    by_split: {
      dev: summarize(bySplit('dev')),
      holdout: summarize(bySplit('holdout')),
    },
    by_scenario: {
      retrieval: summarize(byScenario('retrieval')),
      ambiguous: summarize(byScenario('ambiguous')),
    },
    unanswerable_top_score: {
      case_count: unanswerableScores.length,
      mean_top_score: mean(
        unanswerableScores
          .map((r) => r.top_score)
          .filter((v): v is number => v !== null),
      ),
      note:
        '这 13 条任务的语料库里本来就没有对应笔记；不算 Recall/MRR，只看返回结果的' +
        '最高置信度分数是否比有金标的任务明显更低（分数越低说明检索至少知道自己不确定）。',
    },
    tasks: results,
    unanswerable_tasks: unanswerableScores,
  };

  const outputPath = path.join(resultsRoot, 'embedding-retrieval.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  process.stdout.write(
    `\n===== 汇总 =====\n` +
      `全部（${results.length}）  Recall@1 ${((output.overall.recall_at_1 ?? 0) * 100).toFixed(1)}%  ` +
      `Recall@8 ${((output.overall.recall_at_8 ?? 0) * 100).toFixed(1)}%  MRR ${(output.overall.mrr ?? 0).toFixed(3)}\n` +
      `dev（${output.by_split.dev.case_count}）  Recall@8 ${((output.by_split.dev.recall_at_8 ?? 0) * 100).toFixed(1)}%\n` +
      `holdout（${output.by_split.holdout.case_count}）  Recall@8 ${((output.by_split.holdout.recall_at_8 ?? 0) * 100).toFixed(1)}%\n` +
      `\n结果: ${outputPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${(error as Error)?.stack ?? error}\n`);
  process.exitCode = 1;
});
