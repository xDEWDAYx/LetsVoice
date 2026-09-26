import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DailyReminderModal from '../renderer/reminders/DailyReminderModal';
import DailyReminderController, {
  formatLocalDateKey,
  selectDailyReminderTodos,
} from '../renderer/reminders/DailyReminderController';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; title?: string }) =>
      `${key}${options?.count === undefined ? '' : `:${options.count}`}${
        options?.title === undefined ? '' : `:${options.title}`
      }`,
  }),
}));

describe('今日事项提醒', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('使用本地日期而不是 UTC 日期', () => {
    expect(formatLocalDateKey(new Date(2026, 7, 23, 23, 55))).toBe(
      '2026-08-23',
    );
  });

  it('只选当天标记，未完成与置顶事项排在前面', () => {
    const todos = selectDailyReminderTodos(
      {
        notes: [
          { id: 7, name: '面试通知提醒' },
          { id: 8, name: '已经做完' },
        ],
        todos: [
          {
            id: 3,
            noteId: 8,
            title: '已处理事项',
            dateString: '2026-08-23',
            isCompleted: true,
          },
          {
            id: 2,
            noteId: 7,
            title: '普通事项',
            dateString: '2026-08-23',
            isCompleted: false,
          },
          {
            id: 1,
            noteId: 7,
            title: '置顶事项',
            dateString: '2026-08-23',
            isCompleted: false,
            isPinned: true,
          },
          {
            id: 4,
            noteId: 7,
            title: '明天事项',
            dateString: '2026-08-24',
            isCompleted: false,
          },
        ],
      },
      '2026-08-23',
    );

    expect(todos.map((todo) => todo.title)).toEqual([
      '置顶事项',
      '普通事项',
      '已处理事项',
    ]);
    expect(todos[0].noteTitle).toBe('面试通知提醒');
  });

  it('显示今日清单，支持稍后处理、查看仪表板与 Esc 关闭', () => {
    const onClose = jest.fn();
    const onOpenDashboard = jest.fn();
    const { rerender } = render(
      <DailyReminderModal
        todos={[
          {
            id: 1,
            title: '准备面试',
            noteTitle: '面试通知提醒',
            isCompleted: false,
          },
          { id: 2, title: '整理资料', isCompleted: true },
        ]}
        onClose={onClose}
        onOpenDashboard={onOpenDashboard}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('准备面试')).toBeInTheDocument();
    expect(screen.getByText('整理资料')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByText('dashboard.dailyReminder.openDashboard'));
    expect(onOpenDashboard).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <DailyReminderModal
        todos={[]}
        onClose={onClose}
        onOpenDashboard={onOpenDashboard}
      />,
    );
  });

  it('每次启动或从托盘重新显示都会读取今日事项', async () => {
    const today = formatLocalDateKey(new Date());
    localStorage.setItem('speakspace:onboarding:v1', 'completed');
    (window as any).electron = {
      dashboard: {
        getDashboardOverview: jest.fn().mockResolvedValue({
          notes: [{ id: 7, name: '今日笔记' }],
          todos: [
            {
              id: 9,
              noteId: 7,
              title: '今天要处理的事',
              dateString: today,
              isCompleted: false,
            },
          ],
        }),
      },
    };

    const first = render(
      <MemoryRouter>
        <DailyReminderController />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('dashboard.dailyReminder.dismiss'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    fireEvent(document, new Event('visibilitychange'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('dashboard.dailyReminder.dismiss'));
    first.unmount();

    render(
      <MemoryRouter>
        <DailyReminderController />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });
});
