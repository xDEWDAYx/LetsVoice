import { renderHook, act } from '@testing-library/react';
import AgentController from '../renderer/pages/Agent/AgentController';
import useActiveAgentRun from '../renderer/pages/Agent/useActiveAgentRun';

/**
 * 主进程只在 webContents 销毁时自动取消 run，单窗口应用里切路由不会销毁它。
 * 所以本地放弃 runId 之前必须先发取消，否则后台会继续调模型、继续写库。
 */

function makeController(cancel: jest.Mock): AgentController {
  return new AgentController(
    {
      start: jest.fn(),
      cancel,
      onEvent: () => () => {},
    },
    { getList: jest.fn() },
  );
}

describe('useActiveAgentRun', () => {
  it('卸载时取消正在跑的 run', async () => {
    const cancel = jest.fn().mockResolvedValue(true);
    const controller = makeController(cancel);

    const { result, unmount } = renderHook(() => useActiveAgentRun(controller));
    result.current.activeRunId.current = 'run-1';

    unmount();

    expect(cancel).toHaveBeenCalledWith('run-1');
  });

  it('没有正在跑的 run 时卸载不发取消', () => {
    const cancel = jest.fn().mockResolvedValue(true);
    const { unmount } = renderHook(() =>
      useActiveAgentRun(makeController(cancel)),
    );

    unmount();

    expect(cancel).not.toHaveBeenCalled();
  });

  it('abandonRun 取消并交还归属权', () => {
    const cancel = jest.fn().mockResolvedValue(true);
    const controller = makeController(cancel);
    const { result } = renderHook(() => useActiveAgentRun(controller));
    result.current.activeRunId.current = 'run-2';

    act(() => result.current.abandonRun());

    expect(cancel).toHaveBeenCalledWith('run-2');
    expect(result.current.activeRunId.current).toBeNull();
  });

  it('取消失败不抛出，前端状态照样清干净', async () => {
    const cancel = jest.fn().mockRejectedValue(new Error('run already gone'));
    const controller = makeController(cancel);
    const { result } = renderHook(() => useActiveAgentRun(controller));
    result.current.activeRunId.current = 'run-3';

    expect(() => act(() => result.current.abandonRun())).not.toThrow();
    // 让被吞掉的 rejection 有机会结算，避免污染后续用例。
    await Promise.resolve();

    expect(result.current.activeRunId.current).toBeNull();
  });

  it('同一次 run 不会被重复取消', () => {
    const cancel = jest.fn().mockResolvedValue(true);
    const controller = makeController(cancel);
    const { result, unmount } = renderHook(() => useActiveAgentRun(controller));
    result.current.activeRunId.current = 'run-4';

    act(() => result.current.abandonRun());
    unmount();

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
