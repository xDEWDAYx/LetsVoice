import { renderHook } from '@testing-library/react';
import useBackgroundRequests from '../renderer/background/useBackgroundRequests';

const navigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

type RequestListener = (request: unknown) => void;

let emit: RequestListener | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  emit = null;
  (window as any).electron = {
    background: {
      onRequest: (listener: RequestListener) => {
        emit = listener;
        return () => {
          emit = null;
        };
      },
    },
  };
});

describe('托盘 / 快捷键请求的落地', () => {
  it('navigate 请求直接跳页', () => {
    renderHook(() => useBackgroundRequests());

    emit!({ type: 'navigate', path: '/Settings' });

    expect(navigate).toHaveBeenCalledWith('/Settings');
  });

  it('开始录音先跳到工作台——录音引擎只在那个页面里', () => {
    // 之前是主进程直接发给页面，用户停在仪表板时根本没人接，
    // 表现就是「按了快捷键没反应、点停止也没反应」
    renderHook(() => useBackgroundRequests());

    emit!({ type: 'startQuickRecord' });

    expect(navigate).toHaveBeenCalledWith('/', {
      state: { quickRecord: expect.any(Number) },
    });
  });

  it('连按两次带的时间戳不同，第二次才会再次触发', () => {
    renderHook(() => useBackgroundRequests());

    emit!({ type: 'startQuickRecord' });
    const first = navigate.mock.calls[0][1].state.quickRecord;
    jest.spyOn(Date, 'now').mockReturnValue(first + 1000);
    emit!({ type: 'startQuickRecord' });

    expect(navigate.mock.calls[1][1].state.quickRecord).not.toBe(first);
  });

  it('停止 / 取消不跳页：能录音就说明工作台已经挂着了', () => {
    renderHook(() => useBackgroundRequests());

    emit!({ type: 'stopQuickRecord' });
    emit!({ type: 'cancelQuickRecord' });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('不认识的消息一律忽略', () => {
    renderHook(() => useBackgroundRequests());

    emit!({ type: 'somethingElse' });
    emit!(null);
    emit!('navigate');

    expect(navigate).not.toHaveBeenCalled();
  });
});
