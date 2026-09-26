import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import StatsHud from '../renderer/hud/StatsHud';
import TodoHud from '../renderer/hud/TodoHud';
import RecordHud from '../renderer/hud/RecordHud';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh' },
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

const overview = {
  notes: [
    { id: 1, name: '会议', isPinned: true, transcript: '一二三四五' },
    { id: 2, name: '银行', isPinned: false, transcript: '六七八' },
  ],
  todos: [
    {
      id: 11,
      noteId: 2,
      title: '去银行办对公账号',
      dateString: '2026-08-21',
      isCompleted: false,
    },
    {
      id: 12,
      noteId: 1,
      title: '已经做完的事',
      dateString: '2026-08-21',
      isCompleted: true,
    },
    {
      id: 13,
      noteId: 1,
      title: '明天的 Stand Up',
      dateString: '2026-08-22',
      isCompleted: false,
    },
    {
      id: 14,
      noteId: 1,
      title: '上周就该交的物业费',
      dateString: '2026-08-14',
      isCompleted: false,
    },
    {
      id: 15,
      noteId: 1,
      title: '下个月的季度汇报',
      dateString: '2026-09-20',
      isCompleted: false,
    },
  ],
};

type RecordingListener = (state: unknown) => void;

type ShownListener = () => void;

const hudApi = {
  close: jest.fn(),
  stopRecording: jest.fn(),
  cancelRecording: jest.fn(),
  onShown: jest.fn<() => void, [ShownListener]>(() => () => undefined),
  // 默认实现直接返回取消订阅函数；需要拿到 listener 的用例会自己覆盖它
  onRecordingState: jest.fn<() => void, [RecordingListener]>(
    () => () => undefined,
  ),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 21, 10, 0, 0));
  (window as any).electron = {
    dashboard: { getDashboardOverview: jest.fn().mockResolvedValue(overview) },
    hud: hudApi,
    background: { showWindow: jest.fn() },
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('统计浮窗', () => {
  it('四个环各显示一项数据', async () => {
    const { container } = render(<StatsHud />);

    await waitFor(() =>
      expect(container.querySelectorAll('.hud-ring')).toHaveLength(4),
    );
    // 2 篇笔记、1 篇置顶、4 条未完成待办（统计不分日期）、8 个字
    const values = [...container.querySelectorAll('.hud-ring strong')].map(
      (node) => node.textContent,
    );
    expect(values).toEqual(['2', '1', '4', '8']);
  });

  it('看完自动淡出并关窗', async () => {
    render(<StatsHud />);
    await waitFor(() => expect(screen.getByTestId('hud-stats')).toBeTruthy());

    jest.advanceTimersByTime(4200);
    expect(document.documentElement).toHaveClass('is-hud-leaving');

    jest.advanceTimersByTime(500);
    expect(hudApi.close).toHaveBeenCalledWith('stats');
  });

  it('取数失败时给一句话，而不是空白窗', async () => {
    (window as any).electron.dashboard.getDashboardOverview = jest
      .fn()
      .mockRejectedValue(new Error('db down'));

    render(<StatsHud />);

    await waitFor(() => expect(screen.getByText('hud.error')).toBeTruthy());
  });
});

describe('待办浮窗', () => {
  it('只列今天和明天：逾期的、更远的、已完成的都不占位置', async () => {
    render(<TodoHud />);

    await waitFor(() =>
      expect(screen.getByText('去银行办对公账号')).toBeInTheDocument(),
    );
    expect(screen.getByText('明天的 Stand Up')).toBeInTheDocument();
    expect(screen.queryByText('上周就该交的物业费')).not.toBeInTheDocument();
    expect(screen.queryByText('下个月的季度汇报')).not.toBeInTheDocument();
    expect(screen.queryByText('已经做完的事')).not.toBeInTheDocument();
    expect(screen.getByText('hud.todos.count:2')).toBeInTheDocument();
  });

  it('今天排在明天前面', async () => {
    const { container } = render(<TodoHud />);
    await waitFor(() =>
      expect(container.querySelectorAll('.hud-todo-section')).toHaveLength(2),
    );

    const labels = [...container.querySelectorAll('.hud-todo-label')].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['hud.todos.today', 'hud.todos.tomorrow']);
  });

  it('浮窗被再次呼出时重新取数，不会显示上一次的旧列表', async () => {
    let notifyShown: ShownListener | null = null;
    hudApi.onShown.mockImplementation((listener: ShownListener) => {
      notifyShown = listener;
      return () => undefined;
    });

    render(<TodoHud />);
    await waitFor(() =>
      expect(
        (window as any).electron.dashboard.getDashboardOverview,
      ).toHaveBeenCalledTimes(1),
    );

    act(() => notifyShown!());

    await waitFor(() =>
      expect(
        (window as any).electron.dashboard.getDashboardOverview,
      ).toHaveBeenCalledTimes(2),
    );
  });

  it('点一条就把主界面调出来，浮窗收起', async () => {
    render(<TodoHud />);
    const item = await screen.findByText('去银行办对公账号');

    item.closest('button')!.click();

    expect((window as any).electron.background.showWindow).toHaveBeenCalled();
    expect(hudApi.close).toHaveBeenCalledWith('todos');
  });
});

describe('录音浮窗', () => {
  it('只有取消、波纹、完成三件，不显示时长和文字', () => {
    const { container } = render(<RecordHud />);

    expect(container.querySelectorAll('.hud-wave-bar').length).toBeGreaterThan(
      0,
    );
    expect(container.querySelectorAll('.hud-record-btn')).toHaveLength(2);
    // 胶囊上不该出现 mm:ss 这样的时长
    expect(container.textContent).not.toMatch(/\d{2}:\d{2}/);
  });

  it('录音出错时波纹转红，并给读屏软件一句话', () => {
    let push: ((state: unknown) => void) | null = null;
    hudApi.onRecordingState.mockImplementation(
      (listener: RecordingListener) => {
        push = listener;
        return () => undefined;
      },
    );

    const { container } = render(<RecordHud />);
    // 状态是主进程推过来的，包在 act 里让 React 完成这一轮渲染
    act(() => {
      push!({ active: true, startedAt: Date.now(), error: '麦克风被占用' });
    });

    expect(container.querySelector('.hud-wave')).toHaveClass('has-error');
    expect(screen.getByRole('alert')).toHaveTextContent('麦克风被占用');
  });

  it('勾＝完成：请求主进程收尾并走转录流程', () => {
    render(<RecordHud />);

    screen.getByRole('button', { name: 'hud.record.done' }).click();

    expect(hudApi.stopRecording).toHaveBeenCalled();
    expect(hudApi.cancelRecording).not.toHaveBeenCalled();
  });

  it('叉＝取消：丢掉这段，不走转录', () => {
    render(<RecordHud />);

    screen.getByRole('button', { name: 'hud.record.cancel' }).click();

    expect(hudApi.cancelRecording).toHaveBeenCalled();
    expect(hudApi.stopRecording).not.toHaveBeenCalled();
  });

  it('取消在左、完成在右', () => {
    const { container } = render(<RecordHud />);

    const buttons = [...container.querySelectorAll('.hud-record-btn')].map(
      (node) => node.getAttribute('aria-label'),
    );
    expect(buttons).toEqual(['hud.record.cancel', 'hud.record.done']);
  });

  it('不自动关闭——录音期间必须一直看得见', () => {
    render(<RecordHud />);

    jest.advanceTimersByTime(30_000);

    expect(hudApi.close).not.toHaveBeenCalled();
  });
});

describe('统计环的边界情况', () => {
  it('数值为 0 时不画圆头小点，否则看着像「有一点点」', async () => {
    (window as any).electron.dashboard.getDashboardOverview = jest
      .fn()
      .mockResolvedValue({ notes: [], todos: [] });

    const { container } = render(<StatsHud />);

    await waitFor(() =>
      expect(container.querySelectorAll('.hud-ring')).toHaveLength(4),
    );
    const caps = [...container.querySelectorAll('.hud-ring-fill')].map((node) =>
      node.getAttribute('stroke-linecap'),
    );
    expect(caps).toEqual(['butt', 'butt', 'butt', 'butt']);
  });
});

describe('录音条的结构', () => {
  it('内层那一行不能和外层窗口壳同名', () => {
    // 两者都叫 hud-record 时，行的 flex 规则会连外壳一起套上，
    // 卡片不再撑满窗口，圆按钮就把胶囊撑得上下一点缝都没有
    const { container } = render(<RecordHud />);

    const shell = container.querySelector('.hud.hud-record');
    expect(shell).not.toBeNull();
    expect(shell!.querySelector('.hud-record-bar')).not.toBeNull();
    // 外壳里不应该再有第二个同名节点
    expect(container.querySelectorAll('.hud-record').length).toBe(1);
  });
});

describe('待办浮窗的快捷操作', () => {
  const setTodoCompleted = jest.fn();
  const setTodoPinned = jest.fn();

  beforeEach(() => {
    (window as any).electron.dashboard.setTodoCompleted = setTodoCompleted;
    (window as any).electron.dashboard.setTodoPinned = setTodoPinned;
  });

  it('勾掉一条：立刻从列表消失，并写回数据库', async () => {
    render(<TodoHud />);
    await screen.findByText('去银行办对公账号');

    const row = screen.getByText('去银行办对公账号').closest('.hud-todo-item')!;
    fireEvent.click(
      within(row as HTMLElement).getByLabelText('hud.todos.complete'),
    );

    expect(setTodoCompleted).toHaveBeenCalledWith(11, true);
    // 等 IPC 回来再消失会让人觉得点了没反应，所以本地先移除
    expect(screen.queryByText('去银行办对公账号')).not.toBeInTheDocument();
  });

  it('置顶一条：状态写回数据库，并排到本组最前', async () => {
    render(<TodoHud />);
    await screen.findByText('去银行办对公账号');

    const row = screen.getByText('去银行办对公账号').closest('.hud-todo-item')!;
    fireEvent.click(within(row as HTMLElement).getByLabelText('hud.todos.pin'));

    expect(setTodoPinned).toHaveBeenCalledWith(11, true);
    expect(
      screen.getByText('去银行办对公账号').closest('.hud-todo-item'),
    ).toHaveClass('is-pinned');
  });

  it('再点一次取消置顶', async () => {
    render(<TodoHud />);
    await screen.findByText('去银行办对公账号');
    const pin = () =>
      within(
        screen.getByText('去银行办对公账号').closest('.hud-todo-item')!,
      ).getByLabelText('hud.todos.pin');

    fireEvent.click(pin());
    fireEvent.click(pin());

    expect(setTodoPinned).toHaveBeenLastCalledWith(11, false);
  });

  it('点标题仍然是打开主界面，不会误触发这两个操作', async () => {
    render(<TodoHud />);
    const title = await screen.findByText('去银行办对公账号');

    fireEvent.click(title);

    expect((window as any).electron.background.showWindow).toHaveBeenCalled();
    expect(setTodoCompleted).not.toHaveBeenCalled();
    expect(setTodoPinned).not.toHaveBeenCalled();
  });
});

describe('浮窗的自动消失', () => {
  it('鼠标停在上面就不倒计时', async () => {
    render(<StatsHud />);
    const hud = await screen.findByTestId('hud-stats');

    fireEvent.mouseEnter(hud);
    jest.advanceTimersByTime(20_000);

    expect(hudApi.close).not.toHaveBeenCalled();
    expect(document.documentElement).not.toHaveClass('is-hud-leaving');
  });

  it('鼠标移开之后重新从头计时', async () => {
    render(<StatsHud />);
    const hud = await screen.findByTestId('hud-stats');

    fireEvent.mouseEnter(hud);
    jest.advanceTimersByTime(20_000);
    fireEvent.mouseLeave(hud);

    // 移开后还没到时间，不该消失
    jest.advanceTimersByTime(3000);
    expect(hudApi.close).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2000);
    expect(document.documentElement).toHaveClass('is-hud-leaving');
    jest.advanceTimersByTime(500);
    expect(hudApi.close).toHaveBeenCalledWith('stats');
  });
});
