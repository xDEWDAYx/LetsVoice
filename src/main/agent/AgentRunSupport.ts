import {
  AgentContext,
  AgentStep,
  AgentTool,
  AgentToolResultStep,
} from './AgentTypes';

const MAX_TOOL_RESULT_CHARACTERS = 2500;

export type AgentToolExecution = {
  step: AgentToolResultStep;
  modelContent: string;
};

export function throwIfAgentAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Agent 已取消 / Agent run cancelled');
  }
}

export function emitAgentStep(
  steps: AgentStep[],
  step: AgentStep,
  onStep?: (step: AgentStep) => void,
): void {
  steps.push(step);
  try {
    onStep?.(step);
  } catch {
    // UI 监听器异常不能中断本地主任务。
  }
}

function createToolResult(
  tool: string,
  ok: boolean,
  output: unknown,
): AgentToolExecution {
  const text = String(output ?? '');
  const result =
    text.length <= MAX_TOOL_RESULT_CHARACTERS
      ? text
      : `${text.slice(0, MAX_TOOL_RESULT_CHARACTERS)}…[truncated]`;
  return {
    step: { type: 'tool_result', tool, ok, result },
    modelContent: ok ? result : `Tool error: ${result}`,
  };
}

export async function runAgentTool(
  tool: AgentTool | undefined,
  name: string,
  args: Record<string, unknown>,
  context: AgentContext,
  signal?: AbortSignal,
): Promise<AgentToolExecution> {
  if (!tool) return createToolResult(name, false, '未知工具');
  try {
    throwIfAgentAborted(signal);
    return createToolResult(name, true, await tool.run(args, context, signal));
  } catch (error) {
    throwIfAgentAborted(signal);
    return createToolResult(
      name,
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}
