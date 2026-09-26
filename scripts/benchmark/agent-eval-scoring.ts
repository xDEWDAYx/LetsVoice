/** Agent 评测的纯判分函数；不依赖模型或数据库，方便单独做回归测试。 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import type {
  AgentRunResult,
  AgentStep,
} from '../../src/main/agent/AgentTypes';
import type { TodoData } from '../../src/main/database/repositories/TodoRepository';
import { AGENT_EVAL_NOTES } from './agent-eval-corpus';
import type { AgentEvalTask } from './agent-eval-corpus';
import type { AgentEvalFixtureManifest } from './agent-eval-fixture';

export type AgentJudgeScore = {
  correctness: 0 | 1 | 2;
  groundedness: number;
  answer_mode_pass: boolean;
  unsupported_claims: string[];
  contradictions: string[];
  reason: string;
  parse_error?: string;
};

export type RetrievalScore = {
  first_result_note_keys: string[];
  all_result_note_keys: string[];
  recall_at_1: number | null;
  recall_at_3: number | null;
  recall_at_5: number | null;
  recall_at_8: number | null;
  mrr: number | null;
  ndcg_at_8: number | null;
  run_coverage: number | null;
  read_coverage: number | null;
};

export type AgentCaseScore = {
  id: string;
  split: string;
  scenario: string;
  passed: boolean;
  problems: string[];
  fact_hits: boolean[];
  fact_coverage: number;
  forbidden_hits: string[];
  answer_mode_pass: boolean;
  search_required_and_called: boolean;
  todo_pass: boolean | null;
  tool_calls: number;
  model_turns: number;
  unnecessary_tool_calls: number;
  duplicate_call_attempts: number;
  scope_violation_attempts: number;
  scope_violation_successes: number;
  retrieval: RetrievalScore;
  elapsed_ms: number;
  judge: AgentJudgeScore | null;
};

type ToolTrace = {
  name: string;
  args: Record<string, unknown>;
  ok: boolean | null;
  result: string | null;
};

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function containsAlias(text: string, aliases: string[]): boolean {
  const normalized = normalize(text);
  return aliases.some((alias) => normalized.includes(normalize(alias)));
}

function canonicalArgs(args: Record<string, unknown>): string {
  return Object.keys(args)
    .sort()
    .map((key) => `${key}=${JSON.stringify(args[key])}`)
    .join('&');
}

function traces(steps: AgentStep[]): ToolTrace[] {
  const items: ToolTrace[] = [];
  steps.forEach((step) => {
    if (step.type === 'tool_call') {
      items.push({ name: step.tool, args: step.args, ok: null, result: null });
      return;
    }
    if (step.type === 'tool_result') {
      const pending = [...items]
        .reverse()
        .find((item) => item.name === step.tool && item.result === null);
      if (pending) {
        pending.ok = step.ok;
        pending.result = step.result;
      }
    }
  });
  return items;
}

function resultNoteKeys(
  trace: ToolTrace,
  manifest: AgentEvalFixtureManifest,
): string[] {
  if (trace.name !== 'search_notes' || !trace.result) return [];
  try {
    const parsed = JSON.parse(trace.result) as {
      notes?: Array<{ id?: unknown }>;
    };
    return (parsed.notes ?? [])
      .map((note) => manifest.note_keys_by_id[String(note.id)])
      .filter((key): key is string => Boolean(key));
  } catch {
    // 生产工具结果超过上下文上限时会在 JSON 尾部加 …[truncated]。
    // 前部的 note id 仍按完整顺序存在，用它们恢复排名，不能把解析失败误记成零召回。
    return [...trace.result.matchAll(/"id":(\d+)/g)]
      .map((match) => manifest.note_keys_by_id[match[1]])
      .filter((key): key is string => Boolean(key));
  }
}

function recallAt(
  result: string[],
  gold: Set<string>,
  k: number,
): number | null {
  if (gold.size === 0) return null;
  return (
    new Set(result.slice(0, k).filter((key) => gold.has(key))).size / gold.size
  );
}

function ndcgAt(result: string[], gold: Set<string>, k: number): number | null {
  if (gold.size === 0) return null;
  const dcg = result
    .slice(0, k)
    .reduce(
      (sum, key, index) => sum + (gold.has(key) ? 1 / Math.log2(index + 2) : 0),
      0,
    );
  const ideal = Array.from({ length: Math.min(k, gold.size) }).reduce<number>(
    (sum, _, index) => sum + 1 / Math.log2(index + 2),
    0,
  );
  return ideal === 0 ? null : dcg / ideal;
}

function detectRefusal(text: string): boolean {
  return /找不到|没有(?:相关|足够|这方面|该)|无法(?:从|根据|确定)|资料不足|未提及|not (?:in|found)|no (?:relevant|information)|cannot (?:find|determine|answer)|don.t have/i.test(
    text,
  );
}

function detectClarification(text: string): boolean {
  return /请(?:问|明确|说明|确认)|指的是|哪一个|哪个|哪项|could you clarify|please clarify|which .* (?:mean|refer)|what do you mean|ambiguous/i.test(
    text,
  );
}

function answerModePass(task: AgentEvalTask, text: string): boolean {
  if (task.answerMode === 'refuse') return detectRefusal(text);
  if (task.answerMode === 'clarify') return detectClarification(text);
  return text.trim().length > 0 && !detectRefusal(text);
}

function todosPass(task: AgentEvalTask, saved: TodoData[]): boolean | null {
  if (!task.expectedTodos) return null;
  if (saved.length !== task.expectedTodos.length) return false;
  return task.expectedTodos.every((expected) =>
    saved.some(
      (actual) =>
        actual.dateString === expected.dueDate &&
        containsAlias(actual.title, expected.titleAliases),
    ),
  );
}

function allowedNoteIds(
  task: AgentEvalTask,
  manifest: AgentEvalFixtureManifest,
): Set<number> | null {
  if (task.linkedNoteKeys.length > 0) {
    return new Set(task.linkedNoteKeys.map((key) => manifest.note_ids[key]));
  }
  if (task.workspaceKey) {
    return new Set(
      Object.entries(manifest.note_ids)
        .filter(([key]) =>
          AGENT_EVAL_NOTES.some(
            (note) =>
              note.key === key && note.workspaceKey === task.workspaceKey,
          ),
        )
        .map(([, id]) => id),
    );
  }
  return null;
}

export function scoreAgentCase(options: {
  task: AgentEvalTask;
  result: AgentRunResult;
  savedTodos: TodoData[];
  manifest: AgentEvalFixtureManifest;
  elapsedMs: number;
  judge?: AgentJudgeScore | null;
}): AgentCaseScore {
  const {
    task,
    result,
    savedTodos,
    manifest,
    elapsedMs,
    judge = null,
  } = options;
  const toolTraces = traces(result.steps);
  const factHits = task.requiredFacts.map((aliases) =>
    containsAlias(result.finalText, aliases),
  );
  const forbiddenHits = (task.forbiddenFacts ?? []).filter((fact) =>
    containsAlias(result.finalText, [fact]),
  );
  const modePass = answerModePass(task, result.finalText);
  const searchCalled = toolTraces.some(
    (trace) => trace.name === 'search_notes',
  );
  const todoScore = todosPass(task, savedTodos);
  const extractCalled = toolTraces.some(
    (trace) => trace.name === 'extract_todos',
  );

  const seenCalls = new Set<string>();
  const seenReads = new Set<number>();
  let duplicateCalls = 0;
  let unnecessary = 0;
  let scopeAttempts = 0;
  let scopeSuccesses = 0;
  const allowedIds = allowedNoteIds(task, manifest);
  toolTraces.forEach((trace) => {
    const signature = `${trace.name}:${canonicalArgs(trace.args)}`;
    if (seenCalls.has(signature)) {
      duplicateCalls += 1;
      unnecessary += 1;
    }
    seenCalls.add(signature);
    if (trace.name === 'extract_todos' && !task.expectedTodos) unnecessary += 1;
    const noteId = Number(trace.args.note_id);
    if (trace.name === 'read_note' && Number.isInteger(noteId)) {
      if (seenReads.has(noteId)) unnecessary += 1;
      if (task.linkedNoteKeys.length > 0 && allowedIds?.has(noteId))
        unnecessary += 1;
      seenReads.add(noteId);
    }
    if (
      (trace.name === 'read_note' || trace.name === 'extract_todos') &&
      Number.isInteger(noteId) &&
      allowedIds !== null &&
      !allowedIds.has(noteId)
    ) {
      scopeAttempts += 1;
      if (trace.ok) scopeSuccesses += 1;
    }
  });

  const searchResults = toolTraces
    .filter((trace) => trace.name === 'search_notes')
    .map((trace) => resultNoteKeys(trace, manifest));
  const firstResults = searchResults[0] ?? [];
  const allResults = [...new Set(searchResults.flat())];
  // 关联笔记直接预载进上下文，不属于检索任务，不能把“没有 search 调用”记成 0 分。
  const gold = new Set(task.requiresSearch ? task.relevantNoteKeys : []);
  const firstRank = firstResults.findIndex((key) => gold.has(key));
  let mrr: number | null = null;
  if (gold.size > 0) mrr = firstRank < 0 ? 0 : 1 / (firstRank + 1);
  const readKeys = toolTraces
    .filter((trace) => trace.name === 'read_note')
    .map((trace) => manifest.note_keys_by_id[String(trace.args.note_id)])
    .filter((key): key is string => Boolean(key));
  const retrieval: RetrievalScore = {
    first_result_note_keys: firstResults,
    all_result_note_keys: allResults,
    recall_at_1: recallAt(firstResults, gold, 1),
    recall_at_3: recallAt(firstResults, gold, 3),
    recall_at_5: recallAt(firstResults, gold, 5),
    recall_at_8: recallAt(firstResults, gold, 8),
    mrr,
    ndcg_at_8: ndcgAt(firstResults, gold, 8),
    run_coverage:
      gold.size === 0
        ? null
        : new Set(allResults.filter((key) => gold.has(key))).size / gold.size,
    read_coverage:
      gold.size === 0
        ? null
        : new Set(readKeys.filter((key) => gold.has(key))).size / gold.size,
  };

  const problems: string[] = [];
  factHits.forEach((hit, index) => {
    if (!hit)
      problems.push(`缺少事实 ${index + 1}: ${task.requiredFacts[index][0]}`);
  });
  if (forbiddenHits.length > 0)
    problems.push(`命中禁止事实: ${forbiddenHits.join(', ')}`);
  if (!modePass) problems.push(`答案模式错误，应为 ${task.answerMode}`);
  if (task.requiresSearch && !searchCalled)
    problems.push('需要检索但未调用 search_notes');
  if (task.expectedTodos && !extractCalled)
    problems.push('需要保存待办但未调用 extract_todos');
  if (todoScore === false) problems.push('落库待办与金标不一致');
  if (scopeSuccesses > 0) problems.push(`成功越界操作 ${scopeSuccesses} 次`);
  if (!result.completed) problems.push('未正常完成 Agent 循环');

  return {
    id: task.id,
    split: task.split,
    scenario: task.scenario,
    passed: problems.length === 0,
    problems,
    fact_hits: factHits,
    fact_coverage:
      factHits.length === 0
        ? 1
        : factHits.filter(Boolean).length / factHits.length,
    forbidden_hits: forbiddenHits,
    answer_mode_pass: modePass,
    search_required_and_called: !task.requiresSearch || searchCalled,
    todo_pass: todoScore,
    tool_calls: toolTraces.length,
    model_turns: toolTraces.length + (result.finalText ? 1 : 0),
    unnecessary_tool_calls: unnecessary,
    duplicate_call_attempts: duplicateCalls,
    scope_violation_attempts: scopeAttempts,
    scope_violation_successes: scopeSuccesses,
    retrieval,
    elapsed_ms: elapsedMs,
    judge,
  };
}

export type AgentAggregate = {
  case_count: number;
  passed_cases: number;
  case_pass_rate: number | null;
  fact_coverage: number | null;
  answer_mode_accuracy: number | null;
  mean_tool_calls: number | null;
  mean_model_turns: number | null;
  mean_unnecessary_tool_calls: number | null;
  duplicate_call_attempts: number;
  scope_violation_rate: number | null;
  recall_at_1: number | null;
  recall_at_3: number | null;
  recall_at_5: number | null;
  recall_at_8: number | null;
  mrr: number | null;
  ndcg_at_8: number | null;
  run_coverage: number | null;
  read_coverage: number | null;
  judge_pass_rate: number | null;
  groundedness: number | null;
};

function mean(values: Array<number | null>): number | null {
  const usable = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return usable.length === 0
    ? null
    : usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

export function aggregateAgentScores(scores: AgentCaseScore[]): AgentAggregate {
  const passed = scores.filter((score) => score.passed).length;
  return {
    case_count: scores.length,
    passed_cases: passed,
    case_pass_rate: scores.length ? passed / scores.length : null,
    fact_coverage: mean(scores.map((score) => score.fact_coverage)),
    answer_mode_accuracy: mean(
      scores.map((score) => (score.answer_mode_pass ? 1 : 0)),
    ),
    mean_tool_calls: mean(scores.map((score) => score.tool_calls)),
    mean_model_turns: mean(scores.map((score) => score.model_turns)),
    mean_unnecessary_tool_calls: mean(
      scores.map((score) => score.unnecessary_tool_calls),
    ),
    duplicate_call_attempts: scores.reduce(
      (sum, score) => sum + score.duplicate_call_attempts,
      0,
    ),
    scope_violation_rate: scores.length
      ? scores.filter((score) => score.scope_violation_successes > 0).length /
        scores.length
      : null,
    recall_at_1: mean(scores.map((score) => score.retrieval.recall_at_1)),
    recall_at_3: mean(scores.map((score) => score.retrieval.recall_at_3)),
    recall_at_5: mean(scores.map((score) => score.retrieval.recall_at_5)),
    recall_at_8: mean(scores.map((score) => score.retrieval.recall_at_8)),
    mrr: mean(scores.map((score) => score.retrieval.mrr)),
    ndcg_at_8: mean(scores.map((score) => score.retrieval.ndcg_at_8)),
    run_coverage: mean(scores.map((score) => score.retrieval.run_coverage)),
    read_coverage: mean(scores.map((score) => score.retrieval.read_coverage)),
    judge_pass_rate: mean(
      scores.map((score) => {
        if (!score.judge) return null;
        return score.judge.correctness >= 2 && score.judge.answer_mode_pass
          ? 1
          : 0;
      }),
    ),
    groundedness: mean(
      scores.map((score) => score.judge?.groundedness ?? null),
    ),
  };
}
