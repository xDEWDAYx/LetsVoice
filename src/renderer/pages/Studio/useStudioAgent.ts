import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, AgentStep } from '@shared/types/AgentTypes';
import AgentController from '../Agent/AgentController';
import useActiveAgentRun from '../Agent/useActiveAgentRun';

const controller = new AgentController();

export type StudioAgentTurn = {
  id: string;
  question: string;
  answer: string;
  steps: AgentStep[];
};

export type StudioAgentState = {
  turns: StudioAgentTurn[];
  liveSteps: AgentStep[];
  running: boolean;
  status: string;
  error: string;
};

const EMPTY: StudioAgentState = {
  turns: [],
  liveSteps: [],
  running: false,
  status: '',
  error: '',
};

/**
 * 对话工作台里的智能体模式：复用主进程 Agent（搜索 / 读取笔记 / 提取待办），
 * 没有关联笔记时可检索全部笔记；有关联笔记时直接以它们为本轮上下文。
 * 运行过程以步骤流的形式回显，
 * 最终答案作为一轮对话追加到列表里。
 */
export default function useStudioAgent() {
  const [state, setState] = useState<StudioAgentState>(EMPTY);
  const { activeRunId, abandonRun } = useActiveAgentRun(controller);
  const pendingQuestion = useRef('');

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      if (event.runId !== activeRunId.current) return;

      setState((current) => {
        if (event.type === 'step') {
          return {
            ...current,
            liveSteps: [...current.liveSteps, event.step],
            status:
              event.step.type === 'final' ? '整理答案中…' : '正在使用本地工具…',
          };
        }

        if (event.type === 'completed') {
          return {
            ...current,
            turns: [
              ...current.turns,
              {
                id: event.runId,
                question: pendingQuestion.current,
                answer: event.result.finalText,
                steps: event.result.steps,
              },
            ],
            liveSteps: [],
            running: false,
            status: event.result.completed ? '' : '已在安全上限处停止',
          };
        }

        if (event.type === 'cancelled') {
          return {
            ...current,
            liveSteps: [],
            running: false,
            status: '已取消',
          };
        }

        return {
          ...current,
          liveSteps: [],
          running: false,
          error: event.message,
          status: '',
        };
      });

      if (event.type !== 'step') activeRunId.current = null;
    },
    [activeRunId],
  );

  useEffect(() => controller.onEvent(handleEvent), [handleEvent]);

  const run = useCallback(
    async (
      question: string,
      linkedNoteIds: number[] = [],
    ): Promise<boolean> => {
      const instruction = question.trim();
      if (!instruction) return false;

      pendingQuestion.current = instruction;
      setState((current) => ({
        ...current,
        liveSteps: [],
        running: true,
        error: '',
        status: '正在启动本地助理…',
      }));

      try {
        // 把已有的问答带上，保证多轮追问能延续上下文。
        const started = await controller.start({
          instruction,
          // 不挂笔记时可跨工作区检索；手动挂上后则由主进程把它们
          // 作为本轮明确上下文载入，不再让模型自行猜测检索词。
          workspaceId: null,
          linkedNoteIds,
          history: state.turns.flatMap((turn) => [
            { role: 'user' as const, content: turn.question },
            { role: 'assistant' as const, content: turn.answer },
          ]),
        });
        activeRunId.current = started.runId;
        return true;
      } catch (reason) {
        setState((current) => ({
          ...current,
          running: false,
          status: '',
          error: reason instanceof Error ? reason.message : '启动助理失败',
        }));
        return false;
      }
    },
    [state.turns, activeRunId],
  );

  const cancel = useCallback(async () => {
    if (activeRunId.current) await controller.cancel(activeRunId.current);
  }, [activeRunId]);

  // 清空对话前先收回后台任务，否则这次 run 会在主进程里跑到底，
  // 而它的事件已经没有任何 UI 接收了。
  const reset = useCallback(() => {
    abandonRun();
    pendingQuestion.current = '';
    setState(EMPTY);
  }, [abandonRun]);

  return {
    agent: state,
    runAgent: run,
    cancelAgent: cancel,
    resetAgent: reset,
  };
}
