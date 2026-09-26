import type { AgentEvent } from '@shared/types/AgentTypes';
import { AgentPageState } from './AgentPageTypes';

/** 把主进程公开事件转换成页面状态，不在这里执行任何 IPC。 */
export default function reduceAgentPageEvent(
  current: AgentPageState,
  event: AgentEvent,
  instruction: string,
): AgentPageState {
  if (event.type === 'step') {
    return {
      ...current,
      steps: [
        ...current.steps,
        { id: `${event.runId}-${current.steps.length}`, step: event.step },
      ],
      status: event.step.type === 'final' ? '任务已完成' : '正在使用本地工具…',
    };
  }
  if (event.type === 'completed') {
    return {
      ...current,
      history: [
        ...current.history,
        { id: `${event.runId}-user`, role: 'user', content: instruction },
        {
          id: `${event.runId}-assistant`,
          role: 'assistant',
          content: event.result.finalText,
        },
      ],
      running: false,
      status: event.result.completed ? '任务已完成' : '任务已在安全上限停止',
    };
  }
  if (event.type === 'cancelled') {
    return { ...current, running: false, status: '任务已取消' };
  }
  return {
    ...current,
    running: false,
    error: event.message,
    status: '任务失败',
  };
}
