import { Message } from 'ollama';
import { readToolCall } from './AgentToolCalls';
import {
  emitAgentStep,
  runAgentTool,
  throwIfAgentAborted,
} from './AgentRunSupport';
import {
  buildAgentSystemPrompt,
  buildDuplicateCallNotice,
  buildRunStateMessage,
} from './AgentPrompt';
import {
  AgentChat,
  AgentRunRequest,
  AgentRunResult,
  AgentStep,
  AgentTool,
} from './AgentTypes';

const DEFAULT_MAX_STEPS = 6;
const MAX_LINKED_CONTEXT_CHARACTERS = 8000;

function truncateLinkedNoteResult(
  value: string,
  transcriptLimit: number,
): string {
  try {
    const note = JSON.parse(value) as Record<string, unknown>;
    const transcript = String(note.transcript ?? '');
    if (transcript.length > transcriptLimit) {
      note.transcript = `${transcript.slice(0, transcriptLimit)}…[truncated]`;
    }
    return JSON.stringify(note);
  } catch {
    return value.slice(0, transcriptLimit);
  }
}

type AgentDependencies = {
  chat: AgentChat;
  tools: AgentTool[];
  maxSteps?: number;
  /** 覆盖分层提示词，目前只有测试会用到。 */
  systemPrompt?: string;
};

/** 同一次调用的身份：工具名 + 规范化后的参数。 */
function callSignature(name: string, args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  const normalized = keys.map((key) => `${key}=${JSON.stringify(args[key])}`);
  return `${name}(${normalized.join(', ')})`;
}

/**
 * 有界工具循环。
 *
 * 三条外部（代码级）约束，用来兜住提示词兜不住的情况：
 *  1. 每轮把运行状态回灌给模型 —— 让它知道还剩几步、已经调过什么
 *  2. 重复调用直接短路，不再真的执行一次工具
 *  3. 最后一步不提供工具，逼出一个真正的答案，而不是撞上限后甩一句模板话
 */
export default class AgentOrchestrator {
  private readonly chat: AgentChat;

  private readonly tools: Map<string, AgentTool>;

  private readonly maxSteps: number;

  private readonly systemPromptOverride?: string;

  public constructor(dependencies: AgentDependencies) {
    this.chat = dependencies.chat;
    this.tools = new Map(
      dependencies.tools.map((tool) => [tool.schema.function.name ?? '', tool]),
    );
    this.maxSteps = dependencies.maxSteps ?? DEFAULT_MAX_STEPS;
    this.systemPromptOverride = dependencies.systemPrompt;
  }

  public async run(
    request: Required<AgentRunRequest>,
    signal?: AbortSignal,
    onStep?: (step: AgentStep) => void,
  ): Promise<AgentRunResult> {
    const context = {
      workspaceId: request.workspaceId,
      linkedNoteIds: request.linkedNoteIds,
    };
    const linkedContext = await this.loadLinkedNoteContext(context, signal);
    const messages: Message[] = [
      {
        role: 'system',
        content: this.systemPromptOverride ?? buildAgentSystemPrompt(context),
      },
      ...(linkedContext
        ? ([{ role: 'system', content: linkedContext }] as Message[])
        : []),
      ...request.history,
      { role: 'user', content: request.instruction },
    ];

    const steps: AgentStep[] = [];
    const availableTools = new Map(this.tools);
    // 用户已经指定笔记时，代码层直接移除全库搜索，避免小模型忽略提示词。
    if (request.linkedNoteIds.length > 0) availableTools.delete('search_notes');
    const schemas = Array.from(availableTools.values()).map(
      (tool) => tool.schema,
    );
    const previousCalls: string[] = [];
    let modelName = '';

    for (let index = 0; index < this.maxSteps; index += 1) {
      throwIfAgentAborted(signal);
      const finalStep = index === this.maxSteps - 1;

      // 运行状态每轮重发一次，放在最后才不会被前面的历史淹没。
      messages.push({
        role: 'system',
        content: buildRunStateMessage({
          step: index + 1,
          maxSteps: this.maxSteps,
          previousCalls,
          finalStep,
        }),
      });

      // 最后一步收走工具：模型没得可调，只能拿现有信息作答。
      // eslint-disable-next-line no-await-in-loop
      const reply = await this.chat(messages, finalStep ? [] : schemas, signal);
      modelName = reply.modelName;
      messages.push(reply.message);

      const call = finalStep ? null : readToolCall(reply.message);

      if (!call) {
        const finalText = reply.message.content?.trim();
        if (!finalText) throw new Error('Agent 模型返回了空内容');
        const step: AgentStep = { type: 'final', text: finalText };
        emitAgentStep(steps, step, onStep);
        return { finalText, modelName, steps, completed: true };
      }

      const signature = callSignature(call.name, call.args);
      emitAgentStep(
        steps,
        { type: 'tool_call', tool: call.name, args: call.args },
        onStep,
      );

      // 重复调用不再执行：既省一次工具开销，也把模型从原地打转里拽出来。
      if (previousCalls.includes(signature)) {
        const notice = buildDuplicateCallNotice(signature);
        emitAgentStep(
          steps,
          { type: 'tool_result', tool: call.name, ok: false, result: notice },
          onStep,
        );
        messages.push({
          role: 'tool',
          tool_name: call.name,
          content: notice,
        });
        // eslint-disable-next-line no-continue
        continue;
      }
      previousCalls.push(signature);

      // eslint-disable-next-line no-await-in-loop
      const result = await runAgentTool(
        availableTools.get(call.name),
        call.name,
        call.args,
        context,
        signal,
      );
      emitAgentStep(steps, result.step, onStep);
      messages.push({
        role: 'tool',
        tool_name: call.name,
        content: result.modelContent,
      });
    }

    // 最后一步已经强制不给工具，正常不会走到这里；
    // 万一模型在无工具的一轮里还是回了空内容，给个可解释的收尾。
    const finalText = `已用满 ${this.maxSteps} 步仍未得出结论，请把问题拆小一点再试。`;
    const step: AgentStep = { type: 'final', text: finalText, truncated: true };
    emitAgentStep(steps, step, onStep);
    return { finalText, modelName, steps, completed: false };
  }

  /**
   * 手动关联是输入，不是一次需要模型自行决定的搜索动作。
   * 在第一轮推理前把对应正文确定性载入，短指令也能直接指向这些内容。
   */
  private async loadLinkedNoteContext(
    context: { workspaceId: number | null; linkedNoteIds: number[] },
    signal?: AbortSignal,
  ): Promise<string | null> {
    if (context.linkedNoteIds.length === 0) return null;
    const readNote = this.tools.get('read_note');
    if (!readNote) return null;

    const transcriptLimit = Math.max(
      400,
      Math.floor(MAX_LINKED_CONTEXT_CHARACTERS / context.linkedNoteIds.length) -
        200,
    );
    const notes = await Promise.all(
      context.linkedNoteIds.map(async (noteId) => {
        try {
          throwIfAgentAborted(signal);
          const result = await readNote.run(
            { note_id: noteId },
            context,
            signal,
          );
          throwIfAgentAborted(signal);
          return truncateLinkedNoteResult(result, transcriptLimit);
        } catch (error) {
          throwIfAgentAborted(signal);
          return JSON.stringify({
            id: noteId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    return [
      '[LINKED NOTE CONTEXT]',
      'The user explicitly selected the notes below for this request. Answer from their contents directly. Do not ask the user to restate the context and do not search other notes.',
      ...notes.map((note, index) => `Linked note ${index + 1}: ${note}`),
    ].join('\n');
  }
}
