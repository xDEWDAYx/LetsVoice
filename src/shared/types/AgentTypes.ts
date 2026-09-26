/*
 * Agent 的跨进程契约：Renderer 与 Main 都用这里的定义。
 * 依赖 ollama 的工具/对话类型留在 src/main/agent/AgentTypes.ts，
 * 渲染层不该看到那些。
 */

export type AgentHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AgentRunRequest = {
  instruction: string;
  workspaceId?: number | null;
  /** 用户手动挂上的笔记；存在时就是本轮明确的笔记范围。 */
  linkedNoteIds?: number[];
  history?: AgentHistoryMessage[];
};

export type AgentToolCallStep = {
  type: 'tool_call';
  tool: string;
  args: Record<string, unknown>;
};

export type AgentToolResultStep = {
  type: 'tool_result';
  tool: string;
  ok: boolean;
  result: string;
};

export type AgentFinalStep = {
  type: 'final';
  text: string;
  truncated?: boolean;
};

export type AgentStep =
  | AgentToolCallStep
  | AgentToolResultStep
  | AgentFinalStep;

export type AgentRunResult = {
  finalText: string;
  modelName: string;
  steps: AgentStep[];
  completed: boolean;
};

export type AgentRunStarted = { runId: string };

export type AgentEvent =
  | { runId: string; type: 'step'; step: AgentStep }
  | { runId: string; type: 'completed'; result: AgentRunResult }
  | { runId: string; type: 'cancelled' }
  | { runId: string; type: 'error'; message: string };

export type AgentContext = {
  workspaceId: number | null;
  /** 用户挂上的笔记 ID；存在时读取与派生操作只能使用这些笔记。 */
  linkedNoteIds?: number[];
};
