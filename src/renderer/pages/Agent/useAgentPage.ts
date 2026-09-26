import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '@shared/types/AgentTypes';
import { WorkspaceItem } from '../Workspace/WorkspaceController';
import AgentController from './AgentController';
import reduceAgentPageEvent from './AgentPageEventReducer';
import { AgentPageState, EMPTY_AGENT_PAGE_STATE } from './AgentPageTypes';
import useActiveAgentRun from './useActiveAgentRun';

const controller = new AgentController();

/** 保留本页会话历史；关闭应用后不会额外持久化 Agent 运行记录。 */
export default function useAgentPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [page, setPage] = useState<AgentPageState>(EMPTY_AGENT_PAGE_STATE);
  const { activeRunId, abandonRun } = useActiveAgentRun(controller);
  const pendingInstruction = useRef('');

  useEffect(() => {
    controller
      .listWorkspaces()
      .then((items) => {
        setWorkspaces(items);
        setWorkspaceId((current) => current ?? items[0]?.id ?? null);
        return undefined;
      })
      .catch((reason) =>
        setPage((current) => ({
          ...current,
          error: reason instanceof Error ? reason.message : '读取工作空间失败',
        })),
      );
  }, []);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      if (event.runId !== activeRunId.current) return;
      setPage((current) =>
        reduceAgentPageEvent(current, event, pendingInstruction.current),
      );
      if (event.type !== 'step') activeRunId.current = null;
    },
    [activeRunId],
  );

  useEffect(() => controller.onEvent(handleEvent), [handleEvent]);

  const start = async (instruction: string) => {
    const cleanInstruction = instruction.trim();
    if (!cleanInstruction || workspaceId === null || page.running) return;
    try {
      pendingInstruction.current = cleanInstruction;
      setPage((current) => ({
        ...current,
        steps: [],
        running: true,
        error: '',
        status: '正在启动本地 Agent…',
      }));
      const started = await controller.start({
        instruction: cleanInstruction,
        workspaceId,
        history: page.history,
      });
      activeRunId.current = started.runId;
    } catch (reason) {
      setPage((current) => ({
        ...current,
        running: false,
        error: reason instanceof Error ? reason.message : '启动 Agent 失败',
      }));
    }
  };

  const cancel = async () => {
    if (activeRunId.current) await controller.cancel(activeRunId.current);
  };

  // 换工作区等于开新会话，旧 run 的检索范围已经作废；
  // 只丢本地 runId 的话它会在主进程里继续跑完，结果无处可去。
  const selectWorkspace = (nextWorkspaceId: number) => {
    abandonRun();
    setWorkspaceId(nextWorkspaceId);
    setPage(EMPTY_AGENT_PAGE_STATE);
    pendingInstruction.current = '';
  };

  return { workspaces, workspaceId, selectWorkspace, page, start, cancel };
}
