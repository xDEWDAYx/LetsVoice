import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TrashActionResult } from '@shared/types/TrashTypes';
import { RouteManager } from '../../router/RouteManager';
import TrashUndoToast from '../../components/TrashUndoToast';
import {
  DashboardCategory,
  DashboardCategoryKey,
} from './models/DashboardCategory';
import { DashboardNoteItem } from './models/DashboardNoteItem';
import { TodoItem } from './models/TodoItem';
import { DashboardStatistics } from './models/DashboardStatistics';
import { HeaderBar } from './components/HeaderBar';
import { MetricCardsGrid } from './components/MetricCardsGrid';
import { CalendarWidget } from './components/CalendarWidget';
import { NoteListTable } from './components/NoteListTable';
import './DashboardPage.css';

// Initial Mock Data initialized via OOP Constructors
const INITIAL_NOTES: DashboardNoteItem[] = [];

const INITIAL_TODOS: TodoItem[] = [];

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // 带上当前路径：从仪表板点进去的笔记，返回时应该回到仪表板。
  const routeManager = useMemo(
    () => new RouteManager(navigate, location.pathname),
    [navigate, location.pathname],
  );

  const [notes, setNotes] = useState<DashboardNoteItem[]>(INITIAL_NOTES);
  const [todos, setTodos] = useState<TodoItem[]>(INITIAL_TODOS);
  // 悬停笔记列表的「待办日期」时，让日历把这几天闪出来。
  const [highlightedDates, setHighlightedDates] = useState<string[] | null>(
    null,
  );
  // 反过来的一路联动：悬停日历上的某天，右边列表把当天的待办闪出来。
  const [flashDate, setFlashDate] = useState<string | null>(null);
  // 鼠标停在弹窗里某一条待办上时收窄成只闪这一条，并滚到它。
  const [flashNoteId, setFlashNoteId] = useState<number | null>(null);
  const [trashUndo, setTrashUndo] = useState<TrashActionResult | null>(null);
  const [trashError, setTrashError] = useState('');

  const fetchDashboardData = React.useCallback(async () => {
    try {
      const overview = await window.electron.dashboard.getDashboardOverview();
      const fetchedNotes = overview.notes.map(
        (n: any) =>
          new DashboardNoteItem(
            n.id,
            n.workspaceId,
            n.name,
            n.audioRelativePath,
            n.transcript,
            n.isPinned,
            n.pinnedAt,
            n.createdAt,
            n.updatedAt,
            n.typeCategory,
            n.durationSeconds,
          ),
      );
      setNotes(fetchedNotes);

      if (overview.todos) {
        const fetchedTodos = overview.todos.map(
          (todo: any) =>
            new TodoItem(
              todo.id,
              todo.title,
              todo.dateString,
              todo.isCompleted,
              todo.noteId,
              fetchedNotes
                .find((n: DashboardNoteItem) => n.getId() === todo.noteId)
                ?.getName(),
            ),
        );
        setTodos(fetchedTodos);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, []);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // 分类是后加的：先把列表按现有数据画出来，再在后台给还没分类的历史笔记
  // 补上类型，补完了才刷新一次。整个过程不挡界面，失败也只是继续显示「未分类」。
  React.useEffect(() => {
    let cancelled = false;
    window.electron.dashboard
      .classifyPendingNotes()
      .then((updated: number) => {
        if (!cancelled && updated > 0) fetchDashboardData();
        return updated;
      })
      .catch((error: unknown) => {
        console.error('Failed to classify pending notes:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchDashboardData]);

  // Filters and Sorting State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<
    DashboardCategoryKey | 'all'
  >('all');
  const [isPinnedFilterActive, setIsPinnedFilterActive] = useState(false);
  const [isTodoFilterActive, setIsTodoFilterActive] = useState(false);

  // OOP Calculation Service Instance
  const stats = useMemo(() => {
    return new DashboardStatistics(notes, todos);
  }, [notes, todos]);

  // Handle Pin Toggle using OOP entity cloning and state update
  const handleDeleteNote = async (noteId: number) => {
    try {
      setTrashError('');
      const moved = (await window.electron.trash.moveNote(
        noteId,
      )) as TrashActionResult;
      setNotes((prev) => prev.filter((n) => n.getId() !== noteId));
      setTodos((prev) =>
        prev.filter((todo) => todo.getAssociatedNoteId() !== noteId),
      );
      setTrashUndo(moved);
    } catch (reason) {
      setTrashError(
        reason instanceof Error ? reason.message : t('trash.error.move'),
      );
    }
  };

  const undoDeleteNote = async () => {
    if (!trashUndo) return;
    await window.electron.trash.restore({
      itemType: 'note',
      id: trashUndo.id,
    });
    await fetchDashboardData();
  };

  const handleTogglePin = async (noteId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    const noteToToggle = notes.find((n) => n.getId() === noteId);
    if (!noteToToggle) return;

    const newPinnedState = !noteToToggle.isPinned();

    setNotes((prevNotes) =>
      prevNotes.map((n) => {
        if (n.getId() === noteId) {
          const updated = new DashboardNoteItem(
            n.getId(),
            n.getWorkspaceId(),
            n.getName(),
            n.getAudioRelativePath(),
            n.getTranscript(),
            newPinnedState,
            newPinnedState ? new Date() : null,
            n.getCreatedAt(),
            n.getUpdatedAt(),
            n.getTypeCategory(),
            n.getDurationSeconds(),
          );
          return updated;
        }
        return n;
      }),
    );

    try {
      await window.electron.dashboard.toggleNotePin(noteId, newPinnedState);
    } catch (error) {
      console.error('Failed to toggle pin state on backend:', error);
      // Optionally revert the state here on failure
    }
  };

  // Filter and Sort Notes cleanly utilizing OOP helper methods on each instance
  const filteredNotes = useMemo(() => {
    return (
      notes
        .filter((note) => {
          const categoryKey = note.getCategoryKey();
          const matchesSearch = note.matchesSearch(
            searchQuery,
            t(DashboardCategory.translationKey(categoryKey)),
          );
          const matchesCategory =
            selectedCategory === 'all' || categoryKey === selectedCategory;
          const matchesPinned = !isPinnedFilterActive || note.isPinned();
          const matchesTodo =
            !isTodoFilterActive || stats.hasTodoForNote(note.getId());
          return (
            matchesSearch && matchesCategory && matchesPinned && matchesTodo
          );
        })
        // 固定顺序：置顶的先来，其余按最近更新。原来那个「最新更新 / 创建时间」
        // 下拉去掉了——列表本来就该这么排，为它单开一个控件没什么意义。
        .sort((a, b) => {
          if (a.isPinned() !== b.isPinned()) return a.isPinned() ? -1 : 1;
          return b.getUpdatedAt().getTime() - a.getUpdatedAt().getTime();
        })
    );
  }, [
    notes,
    searchQuery,
    selectedCategory,
    isPinnedFilterActive,
    isTodoFilterActive,
    stats,
    t,
  ]);

  const handleSelectNote = (noteId: number) => {
    const note = notes.find((n) => n.getId() === noteId);
    if (note && note.getWorkspaceId()) {
      routeManager.navigateToWorkspace(note.getWorkspaceId()!);
    } else {
      routeManager.navigateToTranscription({ state: { noteId } });
    }
  };

  return (
    <div className="dashboard-page-container">
      <HeaderBar onCreateNote={() => routeManager.navigateToTranscription()} />

      <main className="dashboard-main-content">
        {/* Left Column: Metric Cards + Calendar & ToDos */}
        <aside className="dashboard-left-column">
          <MetricCardsGrid
            stats={stats}
            isPinnedFilterActive={isPinnedFilterActive}
            onTogglePinnedFilter={() =>
              setIsPinnedFilterActive(!isPinnedFilterActive)
            }
            isTodoFilterActive={isTodoFilterActive}
            onToggleTodoFilter={() =>
              setIsTodoFilterActive(!isTodoFilterActive)
            }
          />

          <CalendarWidget
            todos={todos}
            onSelectNote={handleSelectNote}
            highlightedDates={highlightedDates}
            onFocusDate={setFlashDate}
            onFocusTodoNote={setFlashNoteId}
          />
        </aside>

        {/* Right Column: Note Table with Search, Filter & Sort */}
        <section className="dashboard-right-column">
          <NoteListTable
            notes={filteredNotes}
            todos={todos}
            onHoverTodoDates={setHighlightedDates}
            flashDate={flashDate}
            focusNoteId={flashNoteId}
            totalCount={notes.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            onTogglePin={handleTogglePin}
            onSelectNote={handleSelectNote}
            onDelete={handleDeleteNote}
          />
        </section>
      </main>
      {trashError && (
        <p className="dashboard-trash-error" role="alert">
          {trashError}
        </p>
      )}
      {trashUndo && (
        <TrashUndoToast
          dismissLabel={t('trash.action.dismiss')}
          message={t('trash.notice.noteMoved', {
            name: trashUndo.name,
          })}
          onDismiss={() => setTrashUndo(null)}
          onUndo={undoDeleteNote}
          undoLabel={t('trash.action.undo')}
          undoingLabel={t('trash.action.restoring')}
        />
      )}
    </div>
  );
};
