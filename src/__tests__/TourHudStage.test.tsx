import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { HUD_SIZES } from '@shared/hud/HudLayout';
import TourHudStage from '../renderer/onboarding/TourHudStage';
import { HUD_DEMO_TARGET } from '../renderer/onboarding/OnboardingSteps';

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
  ],
};

const dashboard = {
  getDashboardOverview: jest.fn(),
  setTodoCompleted: jest.fn(),
  setTodoPinned: jest.fn(),
};

const hud = {
  close: jest.fn(),
  stopRecording: jest.fn(),
  cancelRecording: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 21, 10, 0, 0));
  dashboard.getDashboardOverview.mockResolvedValue(overview);
  (window as any).electron = {
    dashboard,
    hud,
    background: { showWindow: jest.fn() },
  };
});

afterEach(() => {
  // 统计环那个「先画 0 再补真值」的定时器，跑完再收，免得 act 报警
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

/**
 * 引导里那三步摆的是真浮窗，不是缩略图。这组用例盯的就是「真」这件事：
 * 选择器对得上、尺寸对得上、数据是用户自己的、而且点不坏东西。
 */
describe('引导里的实物浮窗', () => {
  it('引导用的选择器能找到它——找不到就只剩一张飘着的卡片', async () => {
    const { container } = render(<TourHudStage kind="stats" />);

    await waitFor(() =>
      expect(container.querySelectorAll('.hud-ring')).toHaveLength(4),
    );
    expect(document.querySelector(HUD_DEMO_TARGET)).not.toBeNull();
  });

  it.each(['stats', 'todos', 'record'] as const)(
    '%s：摆的是真浮窗的卡片，尺寸也跟真窗口一样',
    async (kind) => {
      const { container } = render(<TourHudStage kind={kind} />);
      // 取数那一下要跑完，否则 React 会抱怨状态更新在 act 外面
      await act(async () => undefined);

      const stage = container.querySelector(HUD_DEMO_TARGET) as HTMLElement;
      expect(stage.style.width).toBe(`${HUD_SIZES[kind].width}px`);
      expect(stage.style.height).toBe(`${HUD_SIZES[kind].height}px`);
      // 外壳和卡片都来自 hud/ 那套组件，不是引导自己另画的一版
      expect(
        stage.querySelector(`.hud.hud-${kind} > .hud-card`),
      ).not.toBeNull();
    },
  );

  it('统计环显示的是用户自己的数据，不是示例', async () => {
    const { container } = render(<TourHudStage kind="stats" />);

    // 2 篇笔记、1 篇置顶、1 条待办、8 个字
    await waitFor(() =>
      expect(
        [...container.querySelectorAll('.hud-ring strong')].map(
          (node) => node.textContent,
        ),
      ).toEqual(['2', '1', '1', '8']),
    );
  });

  it('待办列的是今天和明天的真待办', async () => {
    render(<TourHudStage kind="todos" />);

    await waitFor(() =>
      expect(screen.getByText('去银行办对公账号')).toBeInTheDocument(),
    );
  });

  it('库里还是空的时候退回示例，而不是给新用户看一句「没有待办」', async () => {
    dashboard.getDashboardOverview.mockResolvedValue({ notes: [], todos: [] });

    render(<TourHudStage kind="todos" />);

    await waitFor(() =>
      expect(
        screen.getByText('onboarding.tour.hudTodos.sampleA'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('hud.todos.empty')).toBeNull();
  });

  it('演示归演示：点了不会真勾掉待办，也不会真去停录音', async () => {
    const { container, unmount } = render(<TourHudStage kind="todos" />);

    await waitFor(() =>
      expect(container.querySelector('.hud-todo-check')).not.toBeNull(),
    );
    (container.querySelector('.hud-todo-check') as HTMLElement).click();
    (container.querySelector('.hud-todo-pin') as HTMLElement).click();
    expect(dashboard.setTodoCompleted).not.toHaveBeenCalled();
    expect(dashboard.setTodoPinned).not.toHaveBeenCalled();
    unmount();

    const capsule = render(<TourHudStage kind="record" />);
    (
      capsule.container.querySelector('.hud-record-btn.is-done') as HTMLElement
    ).click();
    (
      capsule.container.querySelector(
        '.hud-record-btn.is-cancel',
      ) as HTMLElement
    ).click();
    expect(hud.stopRecording).not.toHaveBeenCalled();
    expect(hud.cancelRecording).not.toHaveBeenCalled();
  });

  it('演示浮窗不碰 is-hud —— 那个类会把整个主界面刷成透明', async () => {
    render(<TourHudStage kind="stats" />);

    await waitFor(() => expect(document.querySelector('.hud')).not.toBeNull());
    expect(document.documentElement).not.toHaveClass('is-hud');
  });
});
