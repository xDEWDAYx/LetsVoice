import { useCallback, useEffect, useRef } from 'react';
import AgentController from './AgentController';

/**
 * 管理「当前这次 Agent run」的归属权。
 *
 * 主进程只在 webContents 销毁时自动取消 run（见 main/ipc/agent-ipc.ts），
 * 但单窗口应用里切路由并不会销毁 webContents。页面卸载、重置对话、切换
 * 工作区时如果只把本地 runId 丢掉，主进程那次 run 会继续调 Ollama、跑语义
 * 检索、甚至继续往待办表写数据，而 UI 再也收不到事件，用户也没法取消。
 *
 * 所以本地放弃 runId 之前，必须先通知主进程取消。
 */
export default function useActiveAgentRun(controller: AgentController) {
  const activeRunId = useRef<string | null>(null);

  /**
   * 取消当前 run 并交还归属权。没有正在跑的 run 时是空操作。
   *
   * 同步返回：调用方（卸载、重置、切工作区）都不关心取消什么时候落地，
   * 只要请求发出去了就行。先清 ref 再发取消，取消途中到达的事件本来
   * 就该被 handleEvent 的 runId 比对丢掉。
   */
  const abandonRun = useCallback((): void => {
    const runId = activeRunId.current;
    activeRunId.current = null;
    if (!runId) return;
    // 主进程可能已经自己结束了这次 run，取消失败不影响前端状态。
    controller.cancel(runId).catch(() => undefined);
  }, [controller]);

  useEffect(() => () => abandonRun(), [abandonRun]);

  return { activeRunId, abandonRun };
}
