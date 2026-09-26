/**
 * SpeakSpace Agent 端到端评测。
 *
 * 使用真实 AgentOrchestrator、Agent 工具、Repository、bge-m3 混合检索和
 * TodoExtractionService。数据库与日志都在 benchmarkRoot()，不接触用户数据。
 *
 *   npm run bench:agent
 *   npm run bench:agent -- --rounds 1 --split dev --no-judge
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import fs from 'fs';
import os from 'os';
import path from 'path';
import ollama, { Message } from 'ollama';
import AgentChatService from '../../src/main/agent/AgentChatService';
import createAgentNoteTools from '../../src/main/agent/AgentNoteTools';
import AgentOrchestrator from '../../src/main/agent/AgentOrchestrator';
import { buildAgentSystemPrompt } from '../../src/main/agent/AgentPrompt';
import AgentRunManager from '../../src/main/agent/AgentRunManager';
import type {
  AgentChat,
  AgentContext,
  AgentRunResult,
  AgentStep,
  AgentTool,
} from '../../src/main/agent/AgentTypes';
import { NoteRepository } from '../../src/main/database/repositories/NoteRepository';
import NoteEmbeddingRepository from '../../src/main/database/repositories/NoteEmbeddingRepository';
import { TodoRepository } from '../../src/main/database/repositories/TodoRepository';
import { TodoExtractionService } from '../../src/main/dashboard/TodoExtractionService';
import { NoteClassificationService } from '../../src/main/dashboard/NoteClassificationService';
import LocalChatService from '../../src/main/llm/LocalChatService';
import OllamaEmbeddingService from '../../src/main/semantic/OllamaEmbeddingService';
import SemanticNoteContentRepository from '../../src/main/semantic/SemanticNoteContentRepository';
import SemanticNoteService from '../../src/main/semantic/SemanticNoteService';
import {
  AGENT_EVAL_NOTES,
  AGENT_EVAL_TASKS,
  AgentEvalTask,
} from './agent-eval-corpus';
import { rebuildAgentEvalFixture } from './agent-eval-fixture';
import {
  aggregateAgentScores,
  AgentAggregate,
  AgentCaseScore,
  AgentJudgeScore,
  scoreAgentCase,
} from './agent-eval-scoring';
import {
  buildEvidencePrompt,
  buildHarnessBlock,
  buildRouterPrompt,
  describeAgentHarness,
  parseAgentHarness,
  preloadEvidence,
  readEvidence,
  readRouter,
} from './agent-harness';
import { benchmarkResultsRoot, benchmarkRoot } from './tts-paths';

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const MODEL = flagValue('--model') ?? 'qwen2.5:3b-instruct';
const JUDGE_MODEL = flagValue('--judge-model') ?? MODEL;
const EMBEDDING_MODEL = flagValue('--embedding-model') ?? 'bge-m3';
const ROUNDS = Number(flagValue('--rounds') ?? 3);
const SPLIT = flagValue('--split');
const TASK_ID = flagValue('--task');
const RUN_JUDGE = !process.argv.includes('--no-judge');
/** Agent 外层脚手架：preloadN / router / evidence，逗号分隔。 */
const AGENT_HARNESS_SPEC = flagValue('--harness');
const AGENT_HARNESS = parseAgentHarness(AGENT_HARNESS_SPEC);
const TEMPERATURE = 0.1;
const JUDGE_TEMPERATURE = 0;

type ModelInfo = {
  name: string;
  digest: string;
  size: number;
  details?: Record<string, unknown>;
};

type CaseResult = {
  task: AgentEvalTask;
  request: {
    workspace_id: number | null;
    linked_note_ids: number[];
  };
  final_text: string;
  completed: boolean;
  steps: AgentStep[];
  agent_elapsed_ms: number;
  judge_elapsed_ms: number | null;
  saved_todos: Array<{
    title: string;
    due_date: string;
    completed: boolean;
  }>;
  error: string | null;
  harness: Record<string, unknown> | null;
  score: AgentCaseScore;
};

type RoundResult = {
  round: number;
  elapsed_ms: number;
  overall: AgentAggregate;
  dev: AgentAggregate;
  holdout: AgentAggregate;
  by_scenario: Record<string, AgentAggregate>;
  cases: CaseResult[];
};

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function clamp(value: unknown, minimum: number, maximum: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(minimum, numeric))
    : minimum;
}

async function installedModels(): Promise<ModelInfo[]> {
  const response = await ollama.list();
  return response.models.map((model) => ({
    name: model.name || model.model,
    digest: model.digest,
    size: model.size,
    details: model.details as unknown as Record<string, unknown>,
  }));
}

function findModel(models: ModelInfo[], name: string): ModelInfo | null {
  const normalize = (value: string) =>
    value.toLocaleLowerCase().includes(':')
      ? value.toLocaleLowerCase()
      : `${value.toLocaleLowerCase()}:latest`;
  return (
    models.find((model) => normalize(model.name) === normalize(name)) ?? null
  );
}

function createModelManager(modelName: string): {
  getActivatedModel: () => Promise<{ modelName: string }>;
} {
  return {
    getActivatedModel: async () => ({ modelName }),
  };
}

function createTodoExtractor(options: {
  notes: NoteRepository;
  todos: TodoRepository;
  chat: LocalChatService;
  embedding: OllamaEmbeddingService;
}): TodoExtractionService {
  // 构造函数会连接应用 userData；评测通过注入相同生产依赖来保持数据库隔离。
  const extractor = Object.create(
    TodoExtractionService.prototype,
  ) as TodoExtractionService;
  const classification = new NoteClassificationService({
    noteRepository: options.notes,
    chatService: options.chat,
  });
  Object.assign(extractor, {
    noteRepository: options.notes,
    todoRepository: options.todos,
    chatService: options.chat,
    embeddingService: options.embedding,
    classificationService: classification,
  });
  return extractor;
}

/**
 * 脚手架用的单轮问答：只要一个词的答案，不带工具、不带历史。
 * 用被测模型本身而不是 judge 模型 —— 脚手架是产品的一部分，
 * 上线后也只有这一个模型可用，不能拿一个更强的模型来兜底。
 */
async function simpleAsk(prompt: string): Promise<string> {
  const response = await ollama.chat({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    think: false,
    options: { temperature: TEMPERATURE },
  });
  return (response.message?.content ?? '').trim();
}

function evidenceFor(task: AgentEvalTask): string {
  if (task.relevantNoteKeys.length === 0) {
    return '(The allowed note scope contains no evidence that answers this question.)';
  }
  return task.relevantNoteKeys
    .map((key) => {
      const note = AGENT_EVAL_NOTES.find((item) => item.key === key);
      return note
        ? `[${key}] ${note.title}\n${note.transcript}`
        : `[${key}] missing fixture note`;
    })
    .join('\n\n');
}

function parseJudge(raw: string): AgentJudgeScore {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('没有 JSON object');
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      correctness: Math.round(clamp(parsed.correctness, 0, 2)) as 0 | 1 | 2,
      groundedness: clamp(parsed.groundedness, 0, 1),
      answer_mode_pass: Boolean(parsed.answer_mode_pass),
      unsupported_claims: Array.isArray(parsed.unsupported_claims)
        ? parsed.unsupported_claims.map(String)
        : [],
      contradictions: Array.isArray(parsed.contradictions)
        ? parsed.contradictions.map(String)
        : [],
      reason: String(parsed.reason ?? '').slice(0, 1000),
    };
  } catch (error) {
    return {
      correctness: 0,
      groundedness: 0,
      answer_mode_pass: false,
      unsupported_claims: [],
      contradictions: [],
      reason: 'Judge 输出无法解析。',
      parse_error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function judgeCase(options: {
  task: AgentEvalTask;
  result: AgentRunResult;
  savedTodos: Array<{
    title: string;
    dateString: string;
    isCompleted: boolean;
  }>;
}): Promise<AgentJudgeScore> {
  const { task, result, savedTodos } = options;
  const prompt = [
    'You are evaluating a local note agent. Use only the supplied allowed evidence.',
    'Return one JSON object. Do not reward fluent wording if required facts or actions are missing.',
    'correctness: 0=wrong, 1=partly correct, 2=complete and correct.',
    'groundedness: supported factual claims divided by all checkable factual claims, from 0 to 1.',
    `Expected answer mode: ${task.answerMode}.`,
    `Required fact groups: ${JSON.stringify(task.requiredFacts)}.`,
    `Forbidden facts: ${JSON.stringify(task.forbiddenFacts ?? [])}.`,
    `Expected saved todos: ${JSON.stringify(task.expectedTodos ?? [])}.`,
    '',
    `Question: ${task.instruction}`,
    '',
    `Allowed evidence:\n${evidenceFor(task)}`,
    '',
    `Actual saved todos: ${JSON.stringify(savedTodos)}`,
    '',
    `Agent answer:\n${result.finalText}`,
  ].join('\n');
  const response = await ollama.chat({
    model: JUDGE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    think: false,
    format: {
      type: 'object',
      required: [
        'correctness',
        'groundedness',
        'answer_mode_pass',
        'unsupported_claims',
        'contradictions',
        'reason',
      ],
      properties: {
        correctness: { type: 'integer', minimum: 0, maximum: 2 },
        groundedness: { type: 'number', minimum: 0, maximum: 1 },
        answer_mode_pass: { type: 'boolean' },
        unsupported_claims: { type: 'array', items: { type: 'string' } },
        contradictions: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
      },
    },
    options: { temperature: JUDGE_TEMPERATURE },
  });
  return parseJudge(response.message.content ?? '');
}

function aggregateByTaskSubset(
  cases: CaseResult[],
  predicate: (task: AgentEvalTask) => boolean,
): AgentAggregate {
  return aggregateAgentScores(
    cases.filter((item) => predicate(item.task)).map((item) => item.score),
  );
}

function meanAggregates(
  rounds: RoundResult[],
  pick: (round: RoundResult) => AgentAggregate,
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
  const base = pick(rounds[0]);
  const output = { ...base } as AgentAggregate;
  fields.forEach((field) => {
    const values = rounds
      .map((round) => pick(round)[field])
      .filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value),
      );
    (output[field] as number | null) = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  });
  output.duplicate_call_attempts = rounds.reduce(
    (sum, round) => sum + pick(round).duplicate_call_attempts,
    0,
  );
  return output;
}

async function runProtocolProbes(): Promise<Record<string, unknown>> {
  const makeTool = (name: string, run: AgentTool['run']): AgentTool => ({
    schema: {
      type: 'function',
      function: { name, description: name, parameters: { type: 'object' } },
    },
    run,
  });
  const call = (name: string, args: Record<string, unknown>): Message => ({
    role: 'assistant',
    content: '',
    tool_calls: [{ function: { name, arguments: args } }],
  });
  const request = {
    instruction: 'protocol probe',
    workspaceId: null,
    linkedNoteIds: [],
    history: [],
  };

  let duplicateExecutions = 0;
  const duplicateReplies: Message[] = [
    call('search_notes', { query: 'same' }),
    call('search_notes', { query: 'same' }),
    { role: 'assistant', content: 'done' },
  ];
  const duplicateChat: AgentChat = async () => ({
    message: duplicateReplies.shift() ?? { role: 'assistant', content: 'done' },
    modelName: 'scripted-probe',
  });
  const duplicateResult = await new AgentOrchestrator({
    chat: duplicateChat,
    tools: [
      makeTool('search_notes', async () => {
        duplicateExecutions += 1;
        return '{"notes":[]}';
      }),
    ],
  }).run(request);
  const duplicateBlocked = duplicateResult.steps.some(
    (step) => step.type === 'tool_result' && !step.ok,
  );

  const toolCounts: number[] = [];
  const limitReplies: Message[] = [
    call('search_notes', { query: 'a' }),
    call('search_notes', { query: 'b' }),
    { role: 'assistant', content: 'budget final' },
  ];
  const limitChat: AgentChat = async (_messages, tools) => {
    toolCounts.push(tools.length);
    return {
      message: limitReplies.shift() ?? {
        role: 'assistant',
        content: 'budget final',
      },
      modelName: 'scripted-probe',
    };
  };
  const limitResult = await new AgentOrchestrator({
    chat: limitChat,
    tools: [makeTool('search_notes', async () => '{"notes":[]}')],
    maxSteps: 3,
  }).run(request);

  let sideEffects = 0;
  const cancelChat: AgentChat = async () => ({
    message: call('extract_todos', { note_id: 1 }),
    modelName: 'scripted-probe',
  });
  const cancelRunner = new AgentOrchestrator({
    chat: cancelChat,
    tools: [
      makeTool('extract_todos', async (_args, _context, signal) => {
        if (signal?.aborted) throw new Error('cancelled');
        sideEffects += 1;
        return '{}';
      }),
    ],
  });
  const cancellation = await new Promise<{ event: string; latency_ms: number }>(
    (resolve) => {
      const manager = new AgentRunManager({
        runner: cancelRunner,
        ensureRuntime: async () => undefined,
      });
      let cancelledAt = 0;
      const started = manager.start(request, (event) => {
        if (event.type === 'step' && event.step.type === 'tool_call') {
          cancelledAt = Date.now();
          manager.cancel(event.runId);
        }
        if (
          event.type === 'cancelled' ||
          event.type === 'completed' ||
          event.type === 'error'
        ) {
          resolve({
            event: event.type,
            latency_ms: cancelledAt ? Date.now() - cancelledAt : -1,
          });
        }
      });
      if (!started.runId) resolve({ event: 'start-failed', latency_ms: -1 });
    },
  );

  return {
    duplicate_call: {
      passed: duplicateExecutions === 1 && duplicateBlocked,
      attempted: 2,
      executed: duplicateExecutions,
      blocked_result_observed: duplicateBlocked,
    },
    step_limit: {
      passed: limitResult.completed && toolCounts.join(',') === '1,1,0',
      tools_offered_by_turn: toolCounts,
      final_text: limitResult.finalText,
    },
    cancellation: {
      passed: cancellation.event === 'cancelled' && sideEffects === 0,
      terminal_event: cancellation.event,
      cancellation_latency_ms: cancellation.latency_ms,
      side_effects_after_cancel: sideEffects,
    },
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writePlotData(rounds: RoundResult[], resultsRoot: string): void {
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
    round.cases.map((item) => {
      const { score } = item;
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

function writeHumanTemplate(rounds: RoundResult[], resultsRoot: string): void {
  const firstRound = rounds[0];
  const template = {
    schema_version: 1,
    instructions:
      '在不查看 judge 结论的情况下填写 human_pass、human_groundedness 和 human_notes。',
    sampling: '第一轮全部 28 个任务；避免按模型成败挑样本。',
    review_provenance: {
      reviewer_type: null,
      reviewer_label: '',
      blind_to_judge: true,
      reviewed_at: null,
    },
    items: firstRound.cases.map((item) => ({
      task_id: item.task.id,
      scenario: item.task.scenario,
      question: item.task.instruction,
      allowed_evidence: evidenceFor(item.task),
      agent_answer: item.final_text,
      actual_saved_todos: item.saved_todos,
      human_pass: null,
      human_groundedness: null,
      human_notes: '',
    })),
  };
  fs.writeFileSync(
    path.join(resultsRoot, 'agent-eval-human-review.json'),
    `${JSON.stringify(template, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  if (!Number.isInteger(ROUNDS) || ROUNDS <= 0)
    throw new Error(`无效轮数: ${ROUNDS}`);
  const tasks = AGENT_EVAL_TASKS.filter(
    (task) =>
      (!SPLIT || task.split === SPLIT) && (!TASK_ID || task.id === TASK_ID),
  );
  if (tasks.length === 0) {
    throw new Error(
      `没有匹配的任务: split=${SPLIT ?? 'all'} task=${TASK_ID ?? 'all'}`,
    );
  }
  const models = await installedModels();
  const modelInfo = findModel(models, MODEL);
  const judgeInfo = RUN_JUDGE ? findModel(models, JUDGE_MODEL) : null;
  const embeddingInfo = findModel(models, EMBEDDING_MODEL);
  if (!modelInfo) throw new Error(`本地没有 Agent 模型 ${MODEL}`);
  if (RUN_JUDGE && !judgeInfo)
    throw new Error(`本地没有 judge 模型 ${JUDGE_MODEL}`);
  if (!embeddingInfo)
    throw new Error(`本地没有 Embedding 模型 ${EMBEDDING_MODEL}`);

  const resultsRoot = benchmarkResultsRoot();
  fs.mkdirSync(resultsRoot, { recursive: true });
  const logDir = path.join(benchmarkRoot(), 'agent-eval', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  process.env.SPEAKSPACE_LOG_DIR = logDir;

  const { database, manifest } = rebuildAgentEvalFixture();
  const notes = new NoteRepository(database);
  const todos = new TodoRepository(database);
  const embeddings = new NoteEmbeddingRepository(database);
  const embedding = new OllamaEmbeddingService(ollama, EMBEDDING_MODEL);
  const content = new SemanticNoteContentRepository(database);
  const semantic = new SemanticNoteService(
    notes,
    embeddings,
    embedding,
    content,
  );
  const modelManager = createModelManager(MODEL);
  const agentChat = new AgentChatService({
    modelManager: modelManager as never,
  });
  const localChat = new LocalChatService({
    modelManager: modelManager as never,
  });
  const todoExtractor = createTodoExtractor({
    notes,
    todos,
    chat: localChat,
    embedding,
  });
  const tools = createAgentNoteTools({ notes, semantic, todoExtractor, todos });
  const orchestrator = new AgentOrchestrator({
    chat: agentChat.chat.bind(agentChat),
    tools,
  });

  process.stdout.write(
    `Agent 模型: ${MODEL}\nEmbedding: ${EMBEDDING_MODEL}\n` +
      `Judge: ${RUN_JUDGE ? JUDGE_MODEL : '关闭'}\n轮数: ${ROUNDS}\n` +
      `任务: ${tasks.length} · 笔记: ${manifest.note_count}\n` +
      `隔离数据库: ${manifest.database_path}\n\n`,
  );

  const rounds: RoundResult[] = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    const roundStart = Date.now();
    const cases: CaseResult[] = [];
    process.stdout.write(`===== Agent 第 ${round} 轮 =====\n`);
    for (const task of tasks) {
      const linkedIds = task.linkedNoteKeys.map(
        (key) => manifest.note_ids[key],
      );
      const todoNoteId = task.expectedTodos ? linkedIds[0] : null;
      if (todoNoteId) todos.deleteTodosByNoteId(todoNoteId);
      const request = {
        instruction: task.instruction,
        workspaceId: task.workspaceKey
          ? manifest.workspace_ids[task.workspaceKey]
          : null,
        linkedNoteIds: linkedIds,
        history: [],
      };
      const agentStarted = Date.now();
      let error: string | null = null;
      let result: AgentRunResult;
      /*
       * 外层脚手架。关闭时 harnessOrchestrator 就是原来的 orchestrator，
       * 这条路径与对照组逐字相同，不会因为「加了 if」而引入差异。
       */
      let harnessOrchestrator = orchestrator;
      let harnessInfo: Record<string, unknown> | null = null;
      if (
        AGENT_HARNESS.preload > 0 ||
        AGENT_HARNESS.router ||
        AGENT_HARNESS.evidenceCheck
      ) {
        const context = {
          workspaceId: request.workspaceId,
          linkedNoteIds: request.linkedNoteIds,
        } as AgentContext;
        const mode =
          AGENT_HARNESS.router &&
          readRouter(await simpleAsk(buildRouterPrompt(task.instruction))) ===
            'ambiguous'
            ? 'ambiguous'
            : 'direct';
        const preloaded =
          AGENT_HARNESS.preload > 0
            ? await preloadEvidence(
                tools,
                context,
                task.instruction,
                AGENT_HARNESS.preload,
              )
            : { evidence: '', searchedIds: [], readIds: [] };
        const evidenceVerdict =
          AGENT_HARNESS.evidenceCheck && AGENT_HARNESS.preload > 0
            ? readEvidence(
                await simpleAsk(
                  buildEvidencePrompt(task.instruction, preloaded.evidence),
                ),
              )
            : null;
        const block = buildHarnessBlock({
          mode,
          evidenceVerdict,
          evidence: preloaded.evidence,
          readIds: preloaded.readIds,
        });
        harnessInfo = {
          mode,
          evidence_verdict: evidenceVerdict,
          preloaded_search_ids: preloaded.searchedIds,
          preloaded_read_ids: preloaded.readIds,
        };
        if (block) {
          harnessOrchestrator = new AgentOrchestrator({
            chat: agentChat.chat.bind(agentChat),
            tools,
            systemPrompt: buildAgentSystemPrompt(context) + block,
          });
        }
      }
      try {
        result = await harnessOrchestrator.run(request);
      } catch (caught) {
        error =
          caught instanceof Error
            ? (caught.stack ?? caught.message)
            : String(caught);
        result = {
          finalText: '',
          modelName: MODEL,
          completed: false,
          steps: [{ type: 'final', text: '', truncated: true }],
        };
      }
      const agentElapsedMs = Date.now() - agentStarted;
      const savedTodos = todoNoteId ? todos.getTodosByNoteId(todoNoteId) : [];
      let judge: AgentJudgeScore | null = null;
      let judgeElapsedMs: number | null = null;
      if (RUN_JUDGE) {
        const judgeStarted = Date.now();
        try {
          judge = await judgeCase({ task, result, savedTodos });
        } catch (caught) {
          judge = {
            correctness: 0,
            groundedness: 0,
            answer_mode_pass: false,
            unsupported_claims: [],
            contradictions: [],
            reason: 'Judge 调用失败。',
            parse_error:
              caught instanceof Error ? caught.message : String(caught),
          };
        }
        judgeElapsedMs = Date.now() - judgeStarted;
      }
      const score = scoreAgentCase({
        task,
        result,
        savedTodos,
        manifest,
        elapsedMs: agentElapsedMs,
        judge,
      });
      cases.push({
        task,
        request: {
          workspace_id: request.workspaceId,
          linked_note_ids: request.linkedNoteIds,
        },
        final_text: result.finalText,
        completed: result.completed,
        steps: result.steps,
        agent_elapsed_ms: agentElapsedMs,
        judge_elapsed_ms: judgeElapsedMs,
        // 脚手架当时做了什么判断（路由结果、证据核查结论、预载了哪些笔记），
        // 留档才能事后追问「这条为什么错」，而不是只看到一个总分。
        harness: harnessInfo,
        saved_todos: savedTodos.map((todo) => ({
          title: todo.title,
          due_date: todo.dateString,
          completed: todo.isCompleted,
        })),
        error,
        score,
      });
      process.stdout.write(
        `  ${task.id} ${score.passed ? '✓' : '✗'} ` +
          `${task.scenario} · tools ${score.tool_calls} · ${(score.elapsed_ms / 1000).toFixed(1)}s` +
          `${score.problems.length ? `\n      ${score.problems.join('；')}` : ''}\n`,
      );
    }
    const scenarios = [...new Set(tasks.map((task) => task.scenario))];
    const roundResult: RoundResult = {
      round,
      elapsed_ms: Date.now() - roundStart,
      overall: aggregateByTaskSubset(cases, () => true),
      dev: aggregateByTaskSubset(cases, (task) => task.split === 'dev'),
      holdout: aggregateByTaskSubset(cases, (task) => task.split === 'holdout'),
      by_scenario: Object.fromEntries(
        scenarios.map((scenario) => [
          scenario,
          aggregateByTaskSubset(cases, (task) => task.scenario === scenario),
        ]),
      ),
      cases,
    };
    rounds.push(roundResult);
    process.stdout.write(
      `第 ${round} 轮：严格通过 ${roundResult.overall.passed_cases}/${roundResult.overall.case_count}` +
        ` · Judge ${percent(roundResult.overall.judge_pass_rate)}` +
        ` · R@8 ${percent(roundResult.overall.recall_at_8)}` +
        ` · ${(roundResult.elapsed_ms / 1000).toFixed(0)}s\n\n`,
    );
  }

  const protocolProbes = await runProtocolProbes();
  const output = {
    schema_version: 2,
    scoring_revision: 2,
    measured_at: new Date().toISOString(),
    dataset: {
      hash: manifest.dataset_hash,
      note_count: manifest.note_count,
      task_count: tasks.length,
      full_task_count: manifest.task_count,
      language_counts: manifest.language_counts,
      length_counts: manifest.length_counts,
      split: SPLIT ?? 'all',
      task_filter: TASK_ID ?? 'all',
    },
    model: MODEL,
    model_digest: modelInfo.digest,
    model_size_bytes: modelInfo.size,
    model_details: modelInfo.details ?? null,
    temperature: TEMPERATURE,
    harness: AGENT_HARNESS_SPEC ?? 'off',
    harness_describe: describeAgentHarness(AGENT_HARNESS),
    random_seed: null,
    random_seed_note:
      '生产 AgentChatService 未传 seed；固定温度 0.1，并用三轮结果记录随机性。',
    embedding_model: EMBEDDING_MODEL,
    embedding_model_digest: embeddingInfo.digest,
    judge: RUN_JUDGE
      ? {
          model: JUDGE_MODEL,
          digest: judgeInfo?.digest ?? null,
          temperature: JUDGE_TEMPERATURE,
          human_validation_status: 'pending',
        }
      : null,
    platform: {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cpu_threads: os.cpus().length,
      total_memory_bytes: os.totalmem(),
      node: process.version,
      electron: process.versions.electron ?? null,
    },
    rounds_run: ROUNDS,
    mean_across_rounds: {
      overall: meanAggregates(rounds, (round) => round.overall),
      dev: meanAggregates(rounds, (round) => round.dev),
      holdout: meanAggregates(rounds, (round) => round.holdout),
    },
    protocol_probes: protocolProbes,
    rounds,
  };
  const outputPath = path.join(resultsRoot, 'agent-eval.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  // 再按模型名留一份：跨模型扫描时逐个模型跑，规范名会被后一个覆盖，
  // 扫描结束只剩最后一次的数据。规范名保留，现有报告生成器不受影响。
  fs.writeFileSync(
    path.join(
      resultsRoot,
      // 文件名带上脚手架与子集，避免消融时后一轮静默覆盖前一轮
      `agent-eval-${MODEL.replace(/[^\w.-]+/g, '_')}${
        AGENT_HARNESS_SPEC
          ? `--h_${AGENT_HARNESS_SPEC.replace(/[^\w]+/g, '_')}`
          : ''
      }${SPLIT ? `--${SPLIT}` : ''}.json`,
    ),
    `${JSON.stringify(output, null, 2)}\n`,
  );
  writePlotData(rounds, resultsRoot);
  writeHumanTemplate(rounds, resultsRoot);
  database.close();

  const mean = output.mean_across_rounds.overall;
  process.stdout.write(
    '===== Agent 多轮平均 =====\n' +
      `严格任务完成率 ${percent(mean.case_pass_rate)} · Judge 通过率 ${percent(mean.judge_pass_rate)}\n` +
      `事实覆盖率 ${percent(mean.fact_coverage)} · Groundedness ${percent(mean.groundedness)}\n` +
      `Recall@8 ${percent(mean.recall_at_8)} · MRR ${mean.mrr?.toFixed(3) ?? 'n/a'} · nDCG@8 ${mean.ndcg_at_8?.toFixed(3) ?? 'n/a'}\n` +
      `范围违规率 ${percent(mean.scope_violation_rate)} · 平均工具调用 ${mean.mean_tool_calls?.toFixed(2) ?? 'n/a'}\n` +
      `结果: ${outputPath}\n` +
      `绘图明细: ${path.join(resultsRoot, 'agent-eval-plot-data.csv')}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
