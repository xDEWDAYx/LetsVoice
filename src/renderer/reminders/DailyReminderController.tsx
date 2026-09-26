import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoutePath } from '../router/RouteManager';
import { OnboardingController } from '../onboarding/OnboardingController';
import useOnboardingActive from '../onboarding/useOnboardingActive';
import DailyReminderModal, { DailyReminderTodo } from './DailyReminderModal';

type DashboardTodo = {
  id?: number;
  noteId: number;
  title: string;
  dateString: string;
  isCompleted: boolean;
  isPinned?: boolean;
};

type DashboardNote = {
  id: number;
  name?: string | null;
};

type DashboardOverview = {
  notes?: DashboardNote[];
  todos?: DashboardTodo[];
};

export function formatLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function selectDailyReminderTodos(
  overview: DashboardOverview,
  dateKey: string,
): DailyReminderTodo[] {
  const noteNames = new Map(
    (overview.notes ?? []).map((note) => [note.id, note.name ?? undefined]),
  );

  return (overview.todos ?? [])
    .filter(
      (todo): todo is DashboardTodo & { id: number } =>
        Number.isInteger(todo.id) &&
        todo.id! > 0 &&
        todo.dateString.slice(0, 10) === dateKey,
    )
    .sort((left, right) => {
      if (left.isCompleted !== right.isCompleted) {
        return left.isCompleted ? 1 : -1;
      }
      if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
        return left.isPinned ? -1 : 1;
      }
      return left.id - right.id;
    })
    .map((todo) => ({
      id: todo.id,
      title: todo.title,
      noteTitle: noteNames.get(todo.noteId),
      isCompleted: todo.isCompleted,
    }));
}

/**
 * 应用级今日提醒。放在 Router 内而不是仪表板页面里，确保用户从工作台、
 * 工作空间或设置页启动应用时也能收到提醒。主窗口从系统托盘重新显示时会
 * 再查一次；同一次前台使用期间切换页面不会重复弹出。
 */
export default function DailyReminderController() {
  const navigate = useNavigate();
  const onboardingActive = useOnboardingActive();
  const [todos, setTodos] = useState<DailyReminderTodo[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const loadReminder = useCallback(async (): Promise<DailyReminderTodo[]> => {
    const dateKey = formatLocalDateKey(new Date());
    try {
      const overview =
        (await window.electron.dashboard.getDashboardOverview()) as DashboardOverview;
      return selectDailyReminderTodos(overview, dateKey);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load daily reminder:', error);
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const showReminder = async () => {
      const nextTodos = await loadReminder();
      if (cancelled) return;
      setTodos(nextTodos);
      setDismissed(false);
    };

    showReminder().catch(() => undefined);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      showReminder().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadReminder]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const openDashboard = useCallback(() => {
    dismiss();
    navigate(RoutePath.Dashboard);
  }, [dismiss, navigate]);

  const onboardingBlocksReminder =
    onboardingActive || OnboardingController.shouldOpen();

  if (dismissed || onboardingBlocksReminder || todos.length === 0) {
    return null;
  }

  return (
    <DailyReminderModal
      todos={todos}
      onClose={dismiss}
      onOpenDashboard={openDashboard}
    />
  );
}
