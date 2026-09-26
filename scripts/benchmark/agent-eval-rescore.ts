/** 从保存的原始 Agent 轨迹重新判分，不重新调用模型。 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import type { AgentRunResult } from '../../src/main/agent/AgentTypes';
import type { AgentEvalTask } from './agent-eval-corpus';
import type { AgentEvalFixtureManifest } from './agent-eval-fixture';
import {
  aggregateAgentScores,
  AgentAggregate,
  AgentCaseScore,
  scoreAgentCase,
} from './agent-eval-scoring';
import { benchmarkResultsRoot } from './tts-paths';

type Json = Record<string, any>;

function mean(values: Array<number | null>): number | null {
  const usable = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return usable.length
    ? usable.reduce((sum, value) => sum + value, 0) / usable.length
    : null;
}

function meanAggregates(
  rounds: Json[],
  pick: (round: Json) => AgentAggregate,
): AgentAggregate {
  const fields: Array<keyof AgentAggregate> = [
    'case_pass_rate',
    'fact_coverage',
    'answer_mode_accuracy',
    'mean_tool_calls',
    'mean_model_turns',
    'mean_unnecessary_tool_calls',
    'scope_violation_rate',
    'recall_at_1',
    'recall_at_3',
    'recall_at_5',
    'recall_at_8',
    'mrr',
    'ndcg_at_8',
    'run_coverage',
    'read_coverage',
    'judge_pass_rate',
    'groundedness',
  ];
  const output = { ...pick(rounds[0]) } as AgentAggregate;
  fields.forEach((field) => {
    const values = rounds.map((round) => pick(round)[field]);
    (output[field] as number | null) = mean(
      values.map((value) => (typeof value === 'number' ? value : null)),
    );
  });
  output.duplicate_call_attempts = rounds.reduce(
    (sum, round) => sum + pick(round).duplicate_call_attempts,
    0,
  );
  return output;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writePlotData(rounds: Json[], resultsRoot: string): void {
  const header = [
    'round',
    'task_id',
    'split',
    'scenario',
    'passed',
    'fact_coverage',
    'answer_mode_pass',
    'tool_calls',
    'model_turns',
    'unnecessary_tool_calls',
    'duplicate_call_attempts',
    'scope_violation_successes',
    'recall_at_1',
    'recall_at_3',
    'recall_at_5',
    'recall_at_8',
    'mrr',
    'ndcg_at_8',
    'run_coverage',
    'read_coverage',
    'judge_correctness',
    'groundedness',
    'agent_elapsed_ms',
    'judge_elapsed_ms',
  ];
  const rows = rounds.flatMap((round) =>
    (round.cases as Json[]).map((item) => {
      const score = item.score as AgentCaseScore;
      return [
        round.round,
        item.task.id,
        item.task.split,
        item.task.scenario,
        score.passed,
        score.fact_coverage,
        score.answer_mode_pass,
        score.tool_calls,
        score.model_turns,
        score.unnecessary_tool_calls,
        score.duplicate_call_attempts,
        score.scope_violation_successes,
        score.retrieval.recall_at_1,
        score.retrieval.recall_at_3,
        score.retrieval.recall_at_5,
        score.retrieval.recall_at_8,
        score.retrieval.mrr,
        score.retrieval.ndcg_at_8,
        score.retrieval.run_coverage,
        score.retrieval.read_coverage,
        score.judge?.correctness ?? null,
        score.judge?.groundedness ?? null,
        item.agent_elapsed_ms,
        item.judge_elapsed_ms,
      ];
    }),
  );
  fs.writeFileSync(
    path.join(resultsRoot, 'agent-eval-plot-data.csv'),
    `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`,
  );
}

function main(): void {
  const resultsRoot = benchmarkResultsRoot();
  const evalPath = path.join(resultsRoot, 'agent-eval.json');
  const manifestPath = path.join(
    resultsRoot,
    'agent-eval-fixture-manifest.json',
  );
  if (!fs.existsSync(evalPath) || !fs.existsSync(manifestPath)) {
    throw new Error('请先运行 npm run bench:agent。');
  }
  const evaluation = JSON.parse(fs.readFileSync(evalPath, 'utf8')) as Json;
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  ) as AgentEvalFixtureManifest;
  if (evaluation.dataset.hash !== manifest.dataset_hash) {
    throw new Error('评测结果与 fixture manifest 的数据集 hash 不一致。');
  }

  (evaluation.rounds as Json[]).forEach((round) => {
    (round.cases as Json[]).forEach((item) => {
      const result: AgentRunResult = {
        finalText: item.final_text,
        modelName: evaluation.model,
        steps: item.steps,
        completed: item.completed,
      };
      item.score = scoreAgentCase({
        task: item.task as AgentEvalTask,
        result,
        savedTodos: (item.saved_todos as Json[]).map((todo) => ({
          title: todo.title,
          dateString: todo.due_date,
          isCompleted: todo.completed,
          noteId: item.request.linked_note_ids[0] ?? 0,
        })),
        manifest,
        elapsedMs: item.agent_elapsed_ms,
        judge: item.score.judge,
      });
    });
    const cases = round.cases as Json[];
    const scoresFor = (predicate: (task: AgentEvalTask) => boolean) =>
      cases
        .filter((item) => predicate(item.task as AgentEvalTask))
        .map((item) => item.score as AgentCaseScore);
    round.overall = aggregateAgentScores(scoresFor(() => true));
    round.dev = aggregateAgentScores(scoresFor((task) => task.split === 'dev'));
    round.holdout = aggregateAgentScores(
      scoresFor((task) => task.split === 'holdout'),
    );
    Object.keys(round.by_scenario as Json).forEach((scenario) => {
      round.by_scenario[scenario] = aggregateAgentScores(
        scoresFor((task) => task.scenario === scenario),
      );
    });
  });
  const rounds = evaluation.rounds as Json[];
  evaluation.scoring_revision = 2;
  evaluation.rescored_at = new Date().toISOString();
  evaluation.mean_across_rounds = {
    overall: meanAggregates(rounds, (round) => round.overall),
    dev: meanAggregates(rounds, (round) => round.dev),
    holdout: meanAggregates(rounds, (round) => round.holdout),
  };
  fs.writeFileSync(evalPath, `${JSON.stringify(evaluation, null, 2)}\n`);
  writePlotData(rounds, resultsRoot);
  process.stdout.write(
    `已从 ${rounds.length} 轮原始轨迹重新判分。\n结果: ${evalPath}\n`,
  );
}

main();
