import type { AgentRunResult } from '../../src/main/agent/AgentTypes';
import type { AgentEvalTask } from './agent-eval-corpus';
import { scoreAgentCase } from './agent-eval-scoring';
import type { AgentEvalFixtureManifest } from './agent-eval-fixture';

const manifest: AgentEvalFixtureManifest = {
  schema_version: 1,
  dataset_hash: 'test',
  database_path: 'test.db',
  note_count: 80,
  task_count: 28,
  workspace_ids: { product: 1 },
  note_ids: { 'p-api-zq': 7 },
  note_keys_by_id: { '7': 'p-api-zq' },
  language_counts: { en: 80 },
  length_counts: { 'short (≤240)': 80 },
};

const task: AgentEvalTask = {
  id: 'retrieval-test',
  split: 'holdout',
  scenario: 'retrieval',
  language: 'en',
  instruction: 'Find the code',
  workspaceKey: null,
  linkedNoteKeys: [],
  relevantNoteKeys: ['p-api-zq'],
  requiredFacts: [['ZQ-17']],
  forbiddenFacts: ['ZQ-71'],
  answerMode: 'answer',
  requiresSearch: true,
};

function result(finalText: string): AgentRunResult {
  return {
    finalText,
    modelName: 'test',
    completed: true,
    steps: [
      { type: 'tool_call', tool: 'search_notes', args: { query: 'code' } },
      {
        type: 'tool_result',
        tool: 'search_notes',
        ok: true,
        result: JSON.stringify({ notes: [{ id: 7 }, { id: 99 }] }),
      },
      { type: 'final', text: finalText },
    ],
  };
}

describe('Agent evaluation scoring', () => {
  it('scores facts and first-search retrieval from the recorded tool trace', () => {
    const score = scoreAgentCase({
      task,
      result: result('The required value is ZQ-17.'),
      savedTodos: [],
      manifest,
      elapsedMs: 12,
    });

    expect(score.passed).toBe(true);
    expect(score.retrieval.recall_at_1).toBe(1);
    expect(score.retrieval.mrr).toBe(1);
    expect(score.retrieval.ndcg_at_8).toBe(1);
    expect(score.model_turns).toBe(2);
  });

  it('fails a fluent answer that uses the forbidden draft value', () => {
    const score = scoreAgentCase({
      task,
      result: result('The value is ZQ-71.'),
      savedTodos: [],
      manifest,
      elapsedMs: 12,
    });

    expect(score.passed).toBe(false);
    expect(score.fact_coverage).toBe(0);
    expect(score.forbidden_hits).toEqual(['ZQ-71']);
  });

  it('counts a repeated call even when the orchestrator blocks execution', () => {
    const repeated = result('The required value is ZQ-17.');
    repeated.steps.splice(
      2,
      0,
      { type: 'tool_call', tool: 'search_notes', args: { query: 'code' } },
      {
        type: 'tool_result',
        tool: 'search_notes',
        ok: false,
        result: 'already called',
      },
    );
    const score = scoreAgentCase({
      task,
      result: repeated,
      savedTodos: [],
      manifest,
      elapsedMs: 12,
    });

    expect(score.duplicate_call_attempts).toBe(1);
    expect(score.unnecessary_tool_calls).toBe(1);
    expect(score.model_turns).toBe(3);
  });

  it('recovers ranked note ids from a production-truncated tool result', () => {
    const truncated = result('The required value is ZQ-17.');
    const toolResult = truncated.steps[1];
    if (toolResult.type !== 'tool_result') throw new Error('bad fixture');
    toolResult.result =
      '{"match":"hybrid","notes":[{"id":7},{"id":99}…[truncated]';

    const score = scoreAgentCase({
      task,
      result: truncated,
      savedTodos: [],
      manifest,
      elapsedMs: 12,
    });

    expect(score.retrieval.first_result_note_keys).toEqual(['p-api-zq']);
    expect(score.retrieval.recall_at_1).toBe(1);
  });
});
