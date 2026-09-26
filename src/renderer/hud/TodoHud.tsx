import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import HudShell from './HudShell';
import useHudVisibility from './useHudVisibility';
import {
  HudTodo,
  HudTodoGroup,
  hudTodoCount,
  selectHudTodos,
  toDateKey,
  todosFromOverview,
} from './HudTodoSelection';

type Section = { key: string; labelKey: string; items: HudTodo[] };

export type TodoHudActions = {
  onComplete: (todo: HudTodo) => void;
  onTogglePin: (todo: HudTodo) => void;
  onOpen: (todo: HudTodo) => void;
};

/** 一条待办：勾掉 · 标题（点开主界面） · 置顶 · 日期。 */
function TodoRow({
  todo,
  actions,
}: {
  todo: HudTodo;
  actions: TodoHudActions;
}) {
  const { t } = useTranslation();
  return (
    // 按钮不能互相嵌套，所以外面包一层，标题那块自己是打开按钮
    <div className={`hud-todo-item${todo.isPinned ? ' is-pinned' : ''}`}>
      <button
        aria-label={t('hud.todos.complete')}
        className="hud-todo-check"
        onClick={() => actions.onComplete(todo)}
        title={t('hud.todos.complete')}
        type="button"
      >
        <svg viewBox="0 0 20 20" width="12" height="12">
          <path
            d="M4.5 10.5l4 4 7-8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
          />
        </svg>
      </button>

      <button
        className="hud-todo-open"
        onClick={() => actions.onOpen(todo)}
        title={todo.noteTitle ?? todo.title}
        type="button"
      >
        <span className="hud-todo-title">{todo.title}</span>
      </button>

      <button
        aria-label={t('hud.todos.pin')}
        aria-pressed={Boolean(todo.isPinned)}
        className="hud-todo-pin"
        onClick={() => actions.onTogglePin(todo)}
        title={t('hud.todos.pin')}
        type="button"
      >
        <svg viewBox="0 0 20 20" width="12" height="12">
          <path
            d="M12.5 2.5l5 5-2.2.7-3.1 3.1.4 3.3-1.6 1.6-3.4-3.4L4 17l-.8-.8 4.2-4.6-3.4-3.4L5.6 6.6l3.3.4L12 3.9z"
            fill={todo.isPinned ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
      </button>

      <span className="hud-todo-date">{todo.dateString.slice(5, 10)}</span>
    </div>
  );
}

/**
 * 待办浮窗的内容：标题 + 今天 / 明天两组。
 *
 * 只负责画，数据和三个动作从外面给。新手引导要在主界面上原样摆一个出来，
 * 拆开之后两边用的是同一段 JSX。
 */
export function TodoHudView({
  group,
  failed = false,
  actions,
}: {
  group: HudTodoGroup | null;
  failed?: boolean;
  actions: TodoHudActions;
}) {
  const { t } = useTranslation();

  const sections: Section[] = group
    ? [
        { key: 'today', labelKey: 'hud.todos.today', items: group.today },
        {
          key: 'tomorrow',
          labelKey: 'hud.todos.tomorrow',
          items: group.tomorrow,
        },
      ].filter((section) => section.items.length > 0)
    : [];

  const empty = group !== null && hudTodoCount(group) === 0;

  return (
    <>
      <div className="hud-head">
        <span className="hud-title">{t('hud.todos.title')}</span>
        {group && (
          <span className="hud-count">
            {t('hud.todos.count', { count: hudTodoCount(group) })}
          </span>
        )}
      </div>

      {failed && <p className="hud-empty">{t('hud.error')}</p>}
      {empty && <p className="hud-empty">{t('hud.todos.empty')}</p>}

      <div className="hud-todo-list">
        {sections.map((section) => (
          <div className="hud-todo-section" key={section.key}>
            <span className={`hud-todo-label is-${section.key}`}>
              {t(section.labelKey)}
            </span>
            {section.items.map((todo) => (
              <TodoRow actions={actions} key={todo.id} todo={todo} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * 待办浮窗：今天 / 明天。
 *
 * 比统计浮窗多留一会儿（用户要读文字），点某一条会打开主界面。
 */
export default function TodoHud() {
  const shownAt = useHudVisibility();
  const [group, setGroup] = useState<HudTodoGroup | null>(null);
  const [failed, setFailed] = useState(false);

  // 浮窗是预热常驻的，每次被叫出来都要重新取数，否则看到的是上次的旧数据
  useEffect(() => {
    let cancelled = false;
    window.electron.dashboard
      .getDashboardOverview()
      .then((overview: any) => {
        if (cancelled) return null;
        setGroup(
          selectHudTodos(todosFromOverview(overview), toDateKey(new Date())),
        );
        return null;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shownAt]);

  // 浮窗只做「看一眼」；真要处理就把主界面调出来，浮窗随即收起。
  // 直接定位到那条笔记要等主窗口的路由接手，属于下一步。
  const openMainWindow = () => {
    window.electron.background?.showWindow?.();
    window.electron.hud?.close?.('todos');
  };

  /**
   * 勾掉一条：先在本地移除再落库。
   *
   * 浮窗就那么几秒，等 IPC 回来再消失会让人觉得点了没反应；
   * 写库失败的话下次呼出它还在，不会丢数据。
   */
  const completeTodo = (todo: HudTodo) => {
    setGroup((current) =>
      current
        ? {
            today: current.today.filter((item) => item.id !== todo.id),
            tomorrow: current.tomorrow.filter((item) => item.id !== todo.id),
          }
        : current,
    );
    window.electron.dashboard?.setTodoCompleted?.(todo.id, true);
  };

  /** 置顶 / 取消置顶：本组内重排，置顶的排最前。 */
  const togglePin = (todo: HudTodo) => {
    const next = !todo.isPinned;
    setGroup((current) => {
      if (!current) return current;
      const apply = (items: HudTodo[]) =>
        items
          .map((item) =>
            item.id === todo.id ? { ...item, isPinned: next } : item,
          )
          .sort(
            (a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)),
          );
      return { today: apply(current.today), tomorrow: apply(current.tomorrow) };
    });
    window.electron.dashboard?.setTodoPinned?.(todo.id, next);
  };

  return (
    <HudShell kind="todos" autoHideMs={9000} shownAt={shownAt}>
      <TodoHudView
        actions={{
          onComplete: completeTodo,
          onTogglePin: togglePin,
          onOpen: openMainWindow,
        }}
        failed={failed}
        group={group}
      />
    </HudShell>
  );
}
