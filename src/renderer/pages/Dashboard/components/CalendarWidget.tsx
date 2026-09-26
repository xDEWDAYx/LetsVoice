import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { TodoItem } from '../models/TodoItem';
import { DashboardTimeUtil } from '../models/DashboardTimeUtil';

interface CalendarWidgetProps {
  todos: TodoItem[];
  onSelectNote?: (noteId: number) => void;
  /**
   * 需要闪烁提示的日期（YYYY-MM-DD）。
   * 笔记列表里悬停某条「待办日期」时传进来，用于一眼看出是哪几天。
   */
  highlightedDates?: string[] | null;
  /**
   * 当前正在看哪一天（弹窗打开着的那天），null 表示没有。
   * 笔记列表据此把当天的待办闪出来，和上面的 highlightedDates 正好是反向联动。
   */
  onFocusDate?: (date: string | null) => void;
  /**
   * 鼠标停在弹窗里某一条待办上时，报出它所属的笔记 id。
   * 这时列表只闪这一条并自动滚过去，比整天的全闪更精确。
   */
  onFocusTodoNote?: (noteId: number | null) => void;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * 弹窗的最大高度，和 CSS 里 .floating-popover 的 max-height 是同一个值。
 * 定位要先知道它能有多高，才知道该往下展开还是往上贴。
 */
const POPOVER_MAX_HEIGHT = 360;
const EDGE_MARGIN = 8;

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({
  todos,
  onSelectNote = () => {},
  highlightedDates,
  onFocusDate = () => {},
  onFocusTodoNote = () => {},
}) => {
  const { t, i18n } = useTranslation();
  const [activePopoverDate, setActivePopoverDate] = useState<string | null>(
    null,
  );
  const [popoverPos, setPopoverPos] = useState<React.CSSProperties | null>(
    null,
  );
  // 点击过的日期会「钉住」，移开鼠标也不关，方便慢慢点里面的待办。
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const closePopover = useCallback(() => {
    cancelScheduledClose();
    setActivePopoverDate(null);
    setPopoverPos(null);
    setPinned(false);
  }, [cancelScheduledClose]);

  /**
   * 悬浮离开后延迟再关。
   * 从日期格挪到弹窗的路上鼠标会短暂脱离两者，立刻关会让弹窗点不到。
   */
  const scheduleClose = useCallback(() => {
    if (pinned) return;
    cancelScheduledClose();
    closeTimer.current = setTimeout(() => {
      setActivePopoverDate(null);
      setPopoverPos(null);
    }, 220);
  }, [pinned, cancelScheduledClose]);

  /** 以日期格为锚点定位，避免贴边时弹窗被裁掉。 */
  const openPopoverAt = useCallback(
    (dateStr: string, anchor: DOMRect) => {
      cancelScheduledClose();
      setActivePopoverDate(dateStr);

      const pos: React.CSSProperties = {};
      if (anchor.left + 350 > window.innerWidth) {
        pos.right = Math.max(8, window.innerWidth - anchor.left + 8);
      } else {
        pos.left = anchor.right + 8;
      }

      // 弹窗最高就这么高（CSS 里同一个值），够不够放得下按它来算。
      const maxHeight = Math.min(
        POPOVER_MAX_HEIGHT,
        window.innerHeight - EDGE_MARGIN * 2,
      );
      if (anchor.top + maxHeight > window.innerHeight - EDGE_MARGIN) {
        // 往上贴：底边对齐日期格，但不许越过屏幕顶部
        pos.bottom = Math.max(
          EDGE_MARGIN,
          Math.min(
            window.innerHeight - anchor.bottom - EDGE_MARGIN,
            window.innerHeight - maxHeight - EDGE_MARGIN,
          ),
        );
      } else {
        pos.top = anchor.top;
      }
      setPopoverPos(pos);
    },
    [cancelScheduledClose],
  );

  // 组件卸载时别留下定时器
  useEffect(() => cancelScheduledClose, [cancelScheduledClose]);

  // 回调放进 ref：父组件通常直接传 setState 或内联箭头函数，
  // 直接进依赖数组会让每次重渲染都重跑一次通知。
  const focusDateCallback = useRef(onFocusDate);
  focusDateCallback.current = onFocusDate;
  const focusNoteCallback = useRef(onFocusTodoNote);
  focusNoteCallback.current = onFocusTodoNote;

  /**
   * 把「当前在看哪一天」报给上层。
   *
   * 跟的是弹窗打开的那天而不是原始的 mouseenter：鼠标从日期格挪进弹窗时
   * 会短暂离开格子，跟 hover 的话右边列表就会跟着闪一下断一下。
   */
  useEffect(() => {
    focusDateCallback.current(activePopoverDate);
    // 弹窗关掉时，单条待办的高亮也一起收掉，否则会留在列表里不走。
    if (activePopoverDate === null) focusNoteCallback.current(null);
  }, [activePopoverDate]);

  // 卸载时清掉上层的高亮，否则日历没了列表还在闪。
  useEffect(() => {
    return () => {
      focusDateCallback.current(null);
      focusNoteCallback.current(null);
    };
  }, []);

  const popoverRef = useRef<HTMLDivElement | null>(null);

  /**
   * 钉住的弹窗原来靠标题栏那个 ✕ 关闭，按钮去掉之后改成两条常规出路：
   * Esc、以及点弹窗和日历以外的地方。再点一次同一天依旧能收起。
   */
  useEffect(() => {
    if (!pinned) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopover();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      // 日历自己的日期格有各自的点击逻辑（再点一次＝收起），别抢
      if ((target as Element).closest?.('.calendar-day')) return;
      closePopover();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [pinned, closePopover]);

  // Base system date for styling "today"
  const {
    year: currentYear,
    month: currentMonth,
    currentDay,
  } = DashboardTimeUtil.getCurrentYearMonth();

  // UI View state
  const [viewYear, setViewYear] = useState<number>(currentYear);
  const [viewMonth, setViewMonth] = useState<number>(currentMonth);

  const { daysInMonth, startDayOfWeek } =
    DashboardTimeUtil.getMonthCalendarInfo(viewYear, viewMonth);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((v) => v - 1);
    } else {
      setViewMonth((v) => v - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((v) => v + 1);
    } else {
      setViewMonth((v) => v + 1);
    }
  };

  // 网格单元自带 key：占位格没有日期，用「年-月-第几格」当身份，
  // 换月时年月变化会整片重建，不会出现跨月复用节点。
  type CalendarCell = { key: string; day: number | null };
  const weeks: CalendarCell[][] = [];
  let currentWeek: CalendarCell[] = [];
  let cellIndex = 0;

  const pushCell = (day: number | null) => {
    currentWeek.push({
      key:
        day === null
          ? `${viewYear}-${viewMonth}-pad-${cellIndex}`
          : `${viewYear}-${viewMonth}-${day}`,
      day,
    });
    cellIndex += 1;
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  };

  // Empty prefix padding for previous month days
  for (let i = 0; i < startDayOfWeek; i += 1) {
    pushCell(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    pushCell(day);
  }
  while (currentWeek.length > 0) {
    pushCell(null);
  }

  const getDateString = (day: number) => {
    return DashboardTimeUtil.formatYYYYMMDD(viewYear, viewMonth, day);
  };

  const getTodosForDate = (dateStr: string) => {
    return todos.filter((todo) => todo.isOnDate(dateStr));
  };

  const popoverTodos = activePopoverDate
    ? getTodosForDate(activePopoverDate)
    : [];

  // 用 Set 查表：一条「每天」的待办能有九十多个日期，逐格 includes 太亏。
  const highlighted = useMemo(
    () => new Set(highlightedDates ?? []),
    [highlightedDates],
  );

  // 高亮的日期可能落在别的月份，这时当月一个都不会闪。
  // 在月份导航上给个提示，免得用户以为功能没生效。
  const highlightOutsideView = useMemo(() => {
    if (highlighted.size === 0) return { before: 0, after: 0 };
    const prefix = `${viewYear}-${`${viewMonth}`.padStart(2, '0')}`;
    let before = 0;
    let after = 0;
    highlighted.forEach((date: string) => {
      if (date.slice(0, 7) < prefix) before += 1;
      if (date.slice(0, 7) > prefix) after += 1;
    });
    return { before, after };
  }, [highlighted, viewYear, viewMonth]);

  return (
    <section className="calendar-widget">
      <div className="calendar-header">
        <h3 className="calendar-title">📅 {t('dashboard.calendar.title')}</h3>
        <div className="calendar-month-badge">
          <button
            className={`calendar-nav-btn ${highlightOutsideView.before > 0 ? 'has-highlight-elsewhere' : ''}`}
            onClick={handlePrevMonth}
            type="button"
            title={
              highlightOutsideView.before > 0
                ? `${highlightOutsideView.before} 个待办日期在更早的月份`
                : undefined
            }
          >
            &lt;
          </button>
          <span className="calendar-month-text">
            {DashboardTimeUtil.formatYearMonthDisplay(
              viewYear,
              viewMonth,
              i18n.language,
            )}
          </span>
          <button
            className={`calendar-nav-btn ${highlightOutsideView.after > 0 ? 'has-highlight-elsewhere' : ''}`}
            onClick={handleNextMonth}
            type="button"
            title={
              highlightOutsideView.after > 0
                ? `${highlightOutsideView.after} 个待办日期在更晚的月份`
                : undefined
            }
          >
            &gt;
          </button>
        </div>
      </div>

      <div className="calendar-grid-container">
        <div className="calendar-weekdays">
          {WEEKDAY_KEYS.map((weekdayKey) => (
            <span key={weekdayKey}>
              {t(`dashboard.calendar.weekday.${weekdayKey}`)}
            </span>
          ))}
        </div>

        <div className="calendar-days">
          {weeks.map((week) => (
            <div key={week[0].key} className="calendar-row">
              {week.map((cell) => {
                const { day } = cell;
                if (day === null) {
                  return <div key={cell.key} className="calendar-day empty" />;
                }
                const dateStr = getDateString(day);
                const dayTodos = getTodosForDate(dateStr);
                const hasTodos = dayTodos.length > 0;
                const isToday =
                  day === currentDay &&
                  viewYear === currentYear &&
                  viewMonth === currentMonth;

                return (
                  <button
                    type="button"
                    key={dateStr}
                    className={`btn-plain calendar-day ${hasTodos ? 'has-events' : ''} ${isToday ? 'is-today' : ''} ${activePopoverDate === dateStr ? 'selected' : ''} ${highlighted.has(dateStr) ? 'is-flashing' : ''}`}
                    // 悬浮即展开，不必再点一次
                    onMouseEnter={(e) => {
                      if (!hasTodos) {
                        if (!pinned) closePopover();
                        return;
                      }
                      openPopoverAt(
                        dateStr,
                        e.currentTarget.getBoundingClientRect(),
                      );
                    }}
                    onMouseLeave={scheduleClose}
                    // 键盘 Tab 过来也要能看到，不能只照顾鼠标
                    onFocus={(e) => {
                      if (!hasTodos) return;
                      openPopoverAt(
                        dateStr,
                        e.currentTarget.getBoundingClientRect(),
                      );
                    }}
                    onBlur={scheduleClose}
                    // 点击＝钉住，鼠标移开也不收，方便逐条点待办
                    onClick={(e) => {
                      if (!hasTodos) {
                        closePopover();
                        return;
                      }
                      if (activePopoverDate === dateStr && pinned) {
                        closePopover();
                        return;
                      }
                      openPopoverAt(
                        dateStr,
                        e.currentTarget.getBoundingClientRect(),
                      );
                      setPinned(true);
                    }}
                  >
                    <span className="day-number">{day}</span>
                    {hasTodos && (
                      <div className="indicator-dots">
                        <span className="dot dot-orange" />
                        {dayTodos.length > 1 && (
                          <span className="dot dot-blue" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Floating Popover Panel */}
      {activePopoverDate && popoverTodos.length > 0 && popoverPos && (
        <div
          className="calendar-popover-panel floating-popover"
          ref={popoverRef}
          style={popoverPos}
          // 鼠标挪进弹窗就取消关闭，否则里面的待办点不到
          onMouseEnter={cancelScheduledClose}
          onMouseLeave={() => {
            // 离开弹窗＝不再盯着某一条，退回「整天都闪」
            focusNoteCallback.current(null);
            scheduleClose();
          }}
        >
          <div className="event-list">
            {/* 关闭按钮已去掉：移开鼠标就收，钉住时 Esc / 点别处 / 再点当天都能关。 */}
            <div className="event-list-header">
              <span className="event-date">
                📌{' '}
                {t('dashboard.calendar.popover.title', {
                  date: activePopoverDate,
                })}
              </span>
            </div>
            {/* 条目单独放一层：日期标题固定，只有这里滚。 */}
            <div className="event-list-scroll">
              {popoverTodos.map((todo) => (
                <button
                  type="button"
                  key={todo.getId()}
                  className={`btn-plain todo-item-card ${todo.isCompleted() ? 'completed' : ''}`}
                  // 停在某一条上：列表只闪它一条，并自动滚过去
                  onMouseEnter={() =>
                    focusNoteCallback.current(
                      todo.getAssociatedNoteId() ?? null,
                    )
                  }
                  onFocus={() =>
                    focusNoteCallback.current(
                      todo.getAssociatedNoteId() ?? null,
                    )
                  }
                  onClick={() => {
                    const noteId = todo.getAssociatedNoteId();
                    if (!noteId) return;
                    onSelectNote(noteId);
                    // 跳走之后弹窗留着没意义
                    closePopover();
                  }}
                >
                  <span className="todo-checkbox">
                    {todo.isCompleted() ? '☑' : '☐'}
                  </span>
                  <div className="todo-info">
                    <div className="todo-title">{todo.getTitle()}</div>
                    {todo.getNoteTitle() && (
                      <div className="todo-note-link">
                        🔗{' '}
                        {t('dashboard.calendar.todo.jump', {
                          title: todo.getNoteTitle(),
                        })}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
