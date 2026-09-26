/*
 * 只放依赖 ollama 的主进程侧类型。跨进程契约在 @shared/types/AgentTypes，
 * 这里顺带 re-export 一份，主进程代码仍可只 import 本文件。
 */
import type { Message, Tool } from 'ollama';
import type { AgentContext } from '@shared/types/AgentTypes';

export type {
  AgentHistoryMessage,
  AgentRunRequest,
  AgentToolCallStep,
  AgentToolResultStep,
  AgentFinalStep,
  AgentStep,
  AgentRunResult,
  AgentRunStarted,
  AgentEvent,
  AgentContext,
} from '@shared/types/AgentTypes';

export type AgentTool = {
  schema: Tool;
  run(
    args: Record<string, unknown>,
    context: AgentContext,
    signal?: AbortSignal,
  ): Promise<string>;
};

export type AgentChatReply = {
  message: Message;
  modelName: string;
};

export type AgentChat = (
  messages: Message[],
  tools: Tool[],
  signal?: AbortSignal,
) => Promise<AgentChatReply>;
