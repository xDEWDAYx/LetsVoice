import { randomUUID } from 'crypto';
import AgentChatService from './AgentChatService';
import normalizeAgentRequest from './AgentInput';
import createAgentNoteTools from './AgentNoteTools';
import AgentOrchestrator from './AgentOrchestrator';
import {
  AgentEvent,
  AgentRunRequest,
  AgentRunStarted,
  AgentStep,
} from './AgentTypes';

type AgentRunner = Pick<AgentOrchestrator, 'run'>;

type AgentRunManagerDependencies = {
  runner?: AgentRunner;
  ensureRuntime?: () => Promise<unknown>;
};

/** 管理并发 Agent 运行和取消信号；任务状态只保留在应用内存中。 */
export default class AgentRunManager {
  private readonly runner: AgentRunner;

  private readonly ensureRuntime: () => Promise<unknown>;

  private readonly runs = new Map<string, AbortController>();

  public constructor(dependencies: AgentRunManagerDependencies = {}) {
    this.runner = dependencies.runner ?? AgentRunManager.createDefaultRunner();
    this.ensureRuntime =
      dependencies.ensureRuntime ?? AgentRunManager.ensureDefaultRuntime;
  }

  public start(
    rawRequest: unknown,
    onEvent: (event: AgentEvent) => void,
  ): AgentRunStarted {
    const request = normalizeAgentRequest(rawRequest);
    const runId = randomUUID();
    const controller = new AbortController();
    this.runs.set(runId, controller);
    // 下一事件循环再执行，让 IPC 先把 runId 返回给 Renderer。
    setImmediate(() => {
      this.execute(runId, request, controller, onEvent).catch(() => undefined);
    });
    return { runId };
  }

  public cancel(value: unknown): boolean {
    const runId = typeof value === 'string' ? value.trim() : '';
    const controller = this.runs.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  private async execute(
    runId: string,
    request: Required<AgentRunRequest>,
    controller: AbortController,
    onEvent: (event: AgentEvent) => void,
  ): Promise<void> {
    const emit = (event: AgentEvent) => {
      try {
        onEvent(event);
      } catch {
        // 窗口关闭后不再发送事件，但仍清理后台任务。
      }
    };
    try {
      await this.ensureRuntime();
      if (controller.signal.aborted) throw new Error('cancelled');
      const result = await this.runner.run(
        request,
        controller.signal,
        (step: AgentStep) => emit({ runId, type: 'step', step }),
      );
      if (controller.signal.aborted) throw new Error('cancelled');
      emit({ runId, type: 'completed', result });
    } catch (error) {
      if (controller.signal.aborted) {
        emit({ runId, type: 'cancelled' });
      } else {
        emit({
          runId,
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      this.runs.delete(runId);
    }
  }

  private static createDefaultRunner(): AgentRunner {
    const chat = new AgentChatService();
    return new AgentOrchestrator({
      chat: chat.chat.bind(chat),
      tools: createAgentNoteTools(),
    });
  }

  private static async ensureDefaultRuntime(): Promise<unknown> {
    // 延迟导入，避免只读检查或依赖注入时初始化 Electron userData。
    /* eslint-disable global-require */
    const runtime =
      require('../llm/OllamaRuntime') as typeof import('../llm/OllamaRuntime');
    /* eslint-enable global-require */
    return runtime.default.ensureRunning();
  }
}
