import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search } from 'lucide-react';
import { DashboardNoteItem } from '../models/DashboardNoteItem';
import { TodoItem } from '../models/TodoItem';
import {
  DASHBOARD_CATEGORY_FILTERS,
  DashboardCategory,
  DashboardCategoryKey,
} from '../models/DashboardCategory';
import TrashCanButton from '../../../components/TrashCanButton';
import {
  buildSnippet,
  highlightSegments,
  splitSearchTerms,
} from '../models/NoteSearch';
import {
  computeHeaderMenuPosition,
  MenuPosition,
} from '../models/HeaderMenuPosition';

/** 下拉最多这么高，超出内部滚动；定位时也按这个高度算放不放得下。 */
const TYPE_MENU_MAX_HEIGHT = 260;
const TYPE_MENU_MIN_WIDTH = 132;

/** 一条笔记在列表里显示的待办日期摘要。 */
export type NoteTodoSummary = {
  /** 主显日期：最近一个还没到的，全过期则取最后一个。 */
  primary: string;
  /** 除主显之外还有几个不同日期。 */
  extraCount: number;
  /** 全部日期，挂在 title 上供悬浮查看。 */
  allDates: string[];
  overdue: boolean;
};

/**
 * 按笔记归并待办日期。
 *
 * 重复待办会被展开成很多行（「每天」就是九十多条），
 * 表格里只显示一个代表日期加计数，否则一行塞不下也没法看。
 */
export function summarizeTodosByNote(
  todos: TodoItem[],
  today: string,
): Map<number, NoteTodoSummary> {
  const byNote = new Map<number, Set<string>>();
  todos.forEach((todo) => {
    const noteId = todo.getAssociatedNoteId();
    if (!noteId) return;
    if (!byNote.has(noteId)) byNote.set(noteId, new Set());
    byNote.get(noteId)!.add(todo.getDateString().slice(0, 10));
  });

  const summaries = new Map<number, NoteTodoSummary>();
  byNote.forEach((dateSet, noteId) => {
    const allDates = [...dateSet].sort();
    if (allDates.length === 0) return;
    const upcoming = allDates.find((date) => date >= today);
    const primary = upcoming ?? allDates[allDates.length - 1];
    summaries.set(noteId, {
      primary,
      extraCount: allDates.length - 1,
      allDates,
      overdue: primary < today,
    });
  });
  return summaries;
}

interface NoteListTableProps {
  notes: DashboardNoteItem[];
  /** 用来在列表里显示每条笔记的待办日期。 */
  todos: TodoItem[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: DashboardCategoryKey | 'all';
  onCategoryChange: (category: DashboardCategoryKey | 'all') => void;
  onTogglePin: (noteId: number, e: React.MouseEvent) => void;
  onSelectNote: (noteId: number) => void;
  /** 把笔记移入回收站。右键菜单已被显式的回收站按钮取代。 */
  onDelete: (noteId: number) => void;
  /**
   * 悬停某条「待办日期」时把该笔记的全部日期报上去，供日历闪烁提示；
   * 移开时传 null。
   */
  onHoverTodoDates?: (dates: string[] | null) => void;
  /**
   * 日历上正在看的那一天（YYYY-MM-DD）。当天有待办的笔记会在列表里闪烁；
   * 闪的那几行如果被滚出可视区，则改用列表上/下边缘发光提示。
   */
  flashDate?: string | null;
  /**
   * 弹窗里正被悬停的那条待办所属的笔记。
   * 给了就只闪这一条并自动滚到它，边缘提示线也不出——已经滚过去了，不用再提示。
   */
  focusNoteId?: number | null;
  /** 未经筛选的笔记总数，用来在搜索框旁显示「命中 / 总数」。 */
  totalCount?: number;
}

export const NoteListTable: React.FC<NoteListTableProps> = ({
  notes,
  todos,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  onTogglePin,
  onSelectNote,
  onDelete,
  onHoverTodoDates = () => {},
  flashDate = null,
  focusNoteId = null,
  totalCount,
}) => {
  const { t } = useTranslation();

  // 表头里的两个就地控件：标题列的搜索框、类型列的下拉。
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  // 表格滚动区与行的引用：闪烁提示要量位置，类型下拉滚动时要收起。
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const [flashEdges, setFlashEdges] = useState({ above: false, below: false });
  const typeMenuRef = useRef<HTMLTableCellElement | null>(null);
  const typeButtonRef = useRef<HTMLButtonElement | null>(null);
  // 菜单是 fixed 定位的，坐标要在打开的那一刻按按钮位置算出来
  const [typeMenuPos, setTypeMenuPos] = useState<MenuPosition | null>(null);
  const searchCellRef = useRef<HTMLTableCellElement | null>(null);
  const searchTerms = useMemo(
    () => splitSearchTerms(searchQuery),
    [searchQuery],
  );
  const hasActiveFilters = searchQuery !== '' || selectedCategory !== 'all';

  // 查询被外部清空（比如点了「清除筛选」）时，搜索框自己收起来。
  useEffect(() => {
    if (searchQuery === '') setIsSearchOpen(false);
  }, [searchQuery]);

  // 搜索框：点到别处就收起来（叉号已经去掉了）。已输入的词照旧生效，
  // 只是折回列名旁边那个小标签，不再占着一整列的宽度。
  useEffect(() => {
    if (!isSearchOpen) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && searchCellRef.current?.contains(target)) return;
      setIsSearchOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isSearchOpen]);

  /**
   * 键盘唤起：按 / 或 Ctrl/Cmd+F 直接开始搜索，不用先去找那一列点一下。
   * 已经在输入框里打字时不抢，否则连「/」都打不出来。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isTyping) return;

      const isFindShortcut =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f';
      if (event.key === '/' || isFindShortcut) {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /**
   * 打开类型下拉。
   *
   * 菜单用 fixed 定位：它长在表格的滚动容器里，absolute 会被容器裁掉，
   * 列表区一短就只露出一点点甚至完全看不见（表现就是「点了没反应」）。
   */
  const openTypeMenu = () => {
    const anchor = typeButtonRef.current?.getBoundingClientRect();
    if (anchor) {
      setTypeMenuPos(
        computeHeaderMenuPosition(
          anchor,
          { width: window.innerWidth, height: window.innerHeight },
          { width: TYPE_MENU_MIN_WIDTH, maxHeight: TYPE_MENU_MAX_HEIGHT },
        ),
      );
    }
    setIsTypeMenuOpen(true);
  };

  // 类型下拉：点别处或按 Esc 关掉，和日历弹窗保持一样的习惯。
  useEffect(() => {
    if (!isTypeMenuOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsTypeMenuOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && typeMenuRef.current?.contains(target)) return;
      setIsTypeMenuOpen(false);
    };

    // fixed 定位的菜单不会跟着表格滚，滚动时直接收起，免得它悬在半空
    const onScroll = () => setIsTypeMenuOpen(false);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    scrollRef.current?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const scroller = scrollRef.current;
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      scroller?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [isTypeMenuOpen]);

  const todoSummaries = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    return summarizeTodosByNote(todos, today);
  }, [todos]);

  /**
   * 当前需要闪烁的笔记。
   *
   * 悬停日历上的某天＝当天有待办的笔记全闪；
   * 鼠标再往弹窗里挪、停在具体某条待办上，就收窄成只闪那一条。
   */
  const flashNoteIds = useMemo(() => {
    const ids = new Set<number>();
    if (focusNoteId !== null) {
      ids.add(focusNoteId);
      return ids;
    }
    if (!flashDate) return ids;
    todos.forEach((todo) => {
      const noteId = todo.getAssociatedNoteId();
      if (noteId && todo.isOnDate(flashDate)) ids.add(noteId);
    });
    return ids;
  }, [todos, flashDate, focusNoteId]);

  /**
   * 判断要闪的行是不是被滚出了可视区。
   *
   * 列表有高度上限，命中的笔记可能在上面或下面看不见的地方，
   * 这时光让行闪没用，得在列表边缘给个「上面/下面还有」的提示。
   * 表头是 sticky 的，被它盖住的行同样算看不见。
   */
  useEffect(() => {
    const container = scrollRef.current;
    // 盯着单条时不出提示线：下面那个 effect 会直接把它滚进视野。
    if (!container || flashNoteIds.size === 0 || focusNoteId !== null) {
      setFlashEdges({ above: false, below: false });
      return undefined;
    }

    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const visibleTop = theadRef.current
        ? theadRef.current.getBoundingClientRect().bottom
        : bounds.top;
      let above = false;
      let below = false;

      flashNoteIds.forEach((noteId) => {
        const row = rowRefs.current.get(noteId);
        // 被筛选条件挡掉的笔记根本没渲染，这里也就没什么可提示的。
        if (!row) return;
        const rect = row.getBoundingClientRect();
        // 露出一点点就算看得见，不必整行都在框内。
        if (rect.bottom <= visibleTop + 2) above = true;
        else if (rect.top >= bounds.bottom - 2) below = true;
      });

      setFlashEdges((prev) =>
        prev.above === above && prev.below === below ? prev : { above, below },
      );
    };

    measure();
    container.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      container.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
    // notes 变了行的位置就变了，得重新量一遍。
  }, [flashNoteIds, notes, focusNoteId]);

  /**
   * 停在弹窗里某条待办上时，把对应的行滚进视野。
   *
   * 用容器自己的 scrollTo 而不是 row.scrollIntoView()：后者会顺带滚动
   * 所有祖先滚动容器，整个页面都会跟着动一下。
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || focusNoteId === null) return;
    const row = rowRefs.current.get(focusNoteId);
    // 被筛选条件挡掉的笔记不在列表里，没什么可滚的。
    if (!row) return;

    const bounds = container.getBoundingClientRect();
    const headHeight = theadRef.current
      ? theadRef.current.getBoundingClientRect().height
      : 0;
    const rect = row.getBoundingClientRect();
    const margin = 8;

    let delta = 0;
    if (rect.top < bounds.top + headHeight + margin) {
      delta = rect.top - bounds.top - headHeight - margin;
    } else if (rect.bottom > bounds.bottom - margin) {
      delta = rect.bottom - bounds.bottom + margin;
    }
    if (delta === 0) return;

    // 系统开了「减少动态效果」就直接跳过去，不做平滑滚动。
    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    container.scrollTo({
      top: container.scrollTop + delta,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [focusNoteId, notes]);

  /** 把命中的词包成 <mark>，让用户一眼看出这条为什么被搜出来。 */
  const renderHighlighted = (text: string) =>
    highlightSegments(text, searchTerms).map((segment, index) =>
      segment.hit ? (
        // 片段是按位置切出来的，没有比下标更稳定的 key
        // eslint-disable-next-line react/no-array-index-key
        <mark key={index} className="search-hit">
          {segment.text}
        </mark>
      ) : (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={index}>{segment.text}</React.Fragment>
      ),
    );

  const getCategoryBadgeClass = (categoryKey: DashboardCategoryKey) => {
    switch (categoryKey) {
      case 'meeting':
        return 'badge-blue';
      case 'personal':
        return 'badge-green';
      case 'idea':
        return 'badge-brass';
      case 'learning':
        return 'badge-orange';
      default:
        return 'badge-gray';
    }
  };

  return (
    <section
      className={`note-list-section ${flashEdges.above ? 'has-flash-above' : ''} ${flashEdges.below ? 'has-flash-below' : ''}`}
      // 手把手引导指向这里（见 onboarding/OnboardingSteps.ts）
    >
      <div className="table-header-controls">
        <div className="table-title">
          <h3>{t('dashboard.notes.title', { total: notes.length })}</h3>
        </div>

        {/* 搜索和筛选都收进了表头，这里只留一个「全部清掉」的出口，
            否则筛完之后想恢复得挨个再点回去。 */}
        {hasActiveFilters && (
          <button
            type="button"
            className="btn-plain filters-reset"
            onClick={() => {
              onSearchChange('');
              onCategoryChange('all');
            }}
          >
            ✕ {t('dashboard.notes.filter.reset')}
          </button>
        )}
      </div>

      {/* 多包一层是为了让上下边缘的发光条能停在滚动区之外：
          放进 .table-responsive 里的绝对定位元素会跟着内容一起滚走。 */}
      <div className="table-scroll-frame">
        <div className="table-responsive" ref={scrollRef}>
          <table className="notes-table">
            <thead ref={theadRef}>
              <tr>
                <th className="th-star">
                  {t('dashboard.notes.column.pinned')}
                </th>
                {/* 标题列点一下（或按 /）就地展开搜索框，
                    省掉表格上方那一排控件。 */}
                <th className="th-title" ref={searchCellRef}>
                  {isSearchOpen ? (
                    <div className="th-search">
                      <Search className="search-icon" size={13} />
                      <input
                        type="text"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        className="search-input"
                        placeholder={t('dashboard.notes.search.placeholder')}
                        value={searchQuery}
                        onChange={(event) => onSearchChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setIsSearchOpen(false);
                        }}
                      />
                      {/* 边打边报命中数，不用自己数还剩几行 */}
                      {searchQuery && totalCount !== undefined && (
                        <span className="search-count">
                          {t('dashboard.notes.search.count', {
                            shown: notes.length,
                            total: totalCount,
                          })}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-plain th-button"
                      title={t('dashboard.notes.search.toggle')}
                      onClick={() => setIsSearchOpen(true)}
                    >
                      <span className="th-label">
                        {t('dashboard.notes.column.title')}
                      </span>
                      {searchQuery ? (
                        <span className="th-active-chip">{searchQuery}</span>
                      ) : null}
                      <Search className="th-affordance" size={12} />
                    </button>
                  )}
                </th>
                {/* 类型列点一下出下拉，本来就是按类型筛选，不必再单开一个控件。 */}
                <th className="th-type" ref={typeMenuRef}>
                  <button
                    type="button"
                    ref={typeButtonRef}
                    className="btn-plain th-button"
                    aria-haspopup="listbox"
                    aria-expanded={isTypeMenuOpen}
                    title={t('dashboard.notes.filter.menu')}
                    onClick={() =>
                      isTypeMenuOpen ? setIsTypeMenuOpen(false) : openTypeMenu()
                    }
                  >
                    <span className="th-label">
                      {t('dashboard.notes.column.type')}
                    </span>
                    {selectedCategory !== 'all' ? (
                      <span className="th-active-chip">
                        {t(DashboardCategory.translationKey(selectedCategory))}
                      </span>
                    ) : null}
                    <ChevronDown className="th-affordance" size={12} />
                  </button>
                  {isTypeMenuOpen && (
                    <ul
                      className="th-menu"
                      role="listbox"
                      style={
                        typeMenuPos
                          ? {
                              left: typeMenuPos.left,
                              top: typeMenuPos.top,
                              minWidth: typeMenuPos.minWidth,
                            }
                          : undefined
                      }
                    >
                      {DASHBOARD_CATEGORY_FILTERS.map((category) => (
                        <li key={category}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={category === selectedCategory}
                            className={`btn-plain th-menu-item ${category === selectedCategory ? 'is-active' : ''}`}
                            onClick={() => {
                              onCategoryChange(category);
                              setIsTypeMenuOpen(false);
                            }}
                          >
                            {t(DashboardCategory.translationKey(category))}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </th>
                {/* 时长 / 创建 / 更新三列已按需求移除，改为待办日期；
                    回收站的操作列保留在最后。 */}
                <th className="th-todo">{t('dashboard.notes.column.todo')}</th>
                <th className="th-actions">
                  <span className="sr-only">{t('trash.column.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {notes.length === 0 ? (
                <tr>
                  {/* 置顶 / 标题 / 类型 / 待办日期 / 操作 = 5 列 */}
                  <td colSpan={5} className="no-data-cell">
                    <div className="empty-table-state">
                      <div className="empty-icon">📂</div>
                      <p>{t('dashboard.notes.empty')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                notes.map((note) => {
                  const isPinned = note.isPinned();
                  const categoryKey = note.getCategoryKey();
                  const noteTodo = todoSummaries.get(note.getId());
                  const isFlashing = flashNoteIds.has(note.getId());
                  return (
                    <tr
                      key={note.getId()}
                      ref={(element) => {
                        if (element) rowRefs.current.set(note.getId(), element);
                        else rowRefs.current.delete(note.getId());
                      }}
                      className={`note-row ${isPinned ? 'pinned-row' : ''} ${isFlashing ? 'is-flash-target' : ''}`}
                      onClick={() => onSelectNote(note.getId())}
                    >
                      <td
                        className="td-star"
                        onClick={(e) => onTogglePin(note.getId(), e)}
                      >
                        <span
                          className={`star-icon ${isPinned ? 'active' : 'inactive'}`}
                        >
                          {isPinned ? '★' : '☆'}
                        </span>
                      </td>
                      <td className="td-title">
                        <div className="note-title-text">
                          {renderHighlighted(note.getName() ?? '')}
                        </div>
                        {/* 搜索时概览会挪到第一个命中词附近，
                            否则命中的内容在正文八百字外，看开头没意义。 */}
                        <div className="note-snippet-text">
                          {renderHighlighted(
                            buildSnippet(note.getTranscript(), searchTerms),
                          )}
                        </div>
                      </td>
                      <td className="td-type">
                        <span
                          className={`type-badge ${getCategoryBadgeClass(categoryKey)}`}
                        >
                          {t(DashboardCategory.translationKey(categoryKey))}
                        </span>
                      </td>
                      <td
                        className="td-todo"
                        // 悬停整格就联动日历，不必精确压在那颗药丸上
                        onMouseEnter={() =>
                          onHoverTodoDates(noteTodo ? noteTodo.allDates : null)
                        }
                        onMouseLeave={() => onHoverTodoDates(null)}
                      >
                        {noteTodo ? (
                          <span
                            className={`todo-date-pill ${noteTodo.overdue ? 'is-overdue' : ''}`}
                            title={noteTodo.allDates.join('  ')}
                          >
                            🗓 {noteTodo.primary}
                            {noteTodo.extraCount > 0 && (
                              <span className="todo-date-more">
                                +{noteTodo.extraCount}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="todo-date-none">—</span>
                        )}
                      </td>
                      <td className="td-actions">
                        <TrashCanButton
                          label={t('trash.action.moveNote')}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(note.getId());
                          }}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 命中的笔记滚出视野时，上/下边缘发光提示那边还有内容。 */}
        <span className="flash-edge flash-edge-top" aria-hidden="true" />
        <span className="flash-edge flash-edge-bottom" aria-hidden="true" />
      </div>
    </section>
  );
};
