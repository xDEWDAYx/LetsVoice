import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckSquare2, Plus, Search, Square, SquareMinus } from 'lucide-react';
import type { TrashActionResult } from '@shared/types/TrashTypes';
import TrashUndoToast from '../../components/TrashUndoToast';
import WorkspaceDetailHeader from './components/WorkspaceDetailHeader';
import WorkspaceNoteCard from './components/WorkspaceNoteCard';
import WorkspaceSemanticSearch from './components/WorkspaceSemanticSearch';
import useWorkspaceDetail from './useWorkspaceDetail';
import { useBackNavigation } from '../../router/BackNavigation';
import './WorkspacePage.css';

/**
 * Workspace 详情页：进入时记录 last_opened_at，并展示该空间的完整内容。
 * updated_at 只用于说明内容或名称最后修改时间。
 */
export default function WorkspacePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const detail = useWorkspaceDetail();
  const back = useBackNavigation();
  const {
    workspace,
    loading,
    error,
    status,
    query,
    setQuery,
    visibleNotes,
    selectedNoteIds,
    setSelectedNoteIds,
    toggleNoteSelection,
    revealNote,
  } = detail;
  const [noteUndo, setNoteUndo] = useState<TrashActionResult | null>(null);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // 批量删除是不可逆感很强的操作，先弹窗确认，避免误点。
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false);
  const [noteName, setNoteName] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [creatingNote, setCreatingNote] = useState(false);
  const [createNoteError, setCreateNoteError] = useState('');

  const handleDeleteNote = async (noteId: number) => {
    const result = await detail.moveNoteToTrash(noteId);
    if (result) setNoteUndo(result);
  };

  /**
   * 带着选中的笔记去对话工作台开一轮问答。
   *
   * 原来是就地弹一个只读的分析窗，问完就没了——既接不上追问，
   * 也不会留进会话历史。改成跳到工作台：笔记自动挂上、新开一个对话、
   * 并自动发出第一个问题，之后可以照常追问。
   */
  const startNoteChat = () => {
    // 走 `/`：侧边栏「对话工作台」那一项高亮的是这个路径，
    // /Transcription 虽然渲染的是同一个页面，但导航项不会亮。
    navigate(`/`, {
      state: { askNoteIds: [...selectedNoteIds] },
    });
  };

  /**
   * 把勾选的笔记逐条移入回收站。
   *
   * 串行是有意的：moveNoteToTrash 每次都会改选中集合和笔记列表，
   * 并发跑几条会互相盖掉对方的状态更新。数量本来也就几条到几十条。
   */
  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      // 先拍一份快照：删除过程中 selectedNoteIds 会被逐条清空。
      const targets = [...selectedNoteIds];
      // eslint-disable-next-line no-restricted-syntax
      for (const noteId of targets) {
        // eslint-disable-next-line no-await-in-loop
        await detail.moveNoteToTrash(noteId);
      }
    } finally {
      setBatchDeleting(false);
      setShowBatchDeleteModal(false);
    }
  };

  useEffect(() => {
    const routedNoteId = (location.state as { noteId?: number } | null)?.noteId;
    if (!loading && routedNoteId) {
      revealNote(routedNoteId);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [loading, location.pathname, location.state, navigate, revealNote]);

  const undoDeleteNote = async () => {
    if (!noteUndo) return;
    await window.electron.trash.restore({
      itemType: 'note',
      id: noteUndo.id,
    });
    await detail.reloadNotes();
    revealNote(noteUndo.id);
  };

  const visibleNoteIds = visibleNotes.map((note) => note.id);
  const selectedVisibleNoteCount = visibleNoteIds.filter((noteId) =>
    selectedNoteIds.includes(noteId),
  ).length;
  const allVisibleNotesSelected =
    visibleNoteIds.length > 0 &&
    selectedVisibleNoteCount === visibleNoteIds.length;
  let visibleSelectionState: boolean | 'mixed' = false;
  if (allVisibleNotesSelected) {
    visibleSelectionState = true;
  } else if (selectedVisibleNoteCount > 0) {
    visibleSelectionState = 'mixed';
  }
  const visibleSelectionLabelKey = allVisibleNotesSelected
    ? 'workspace.detail.deselectAllVisible'
    : 'workspace.detail.selectAllVisible';
  let visibleSelectionIcon = <Square aria-hidden="true" size={16} />;
  if (selectedVisibleNoteCount > 0) {
    visibleSelectionIcon = <SquareMinus aria-hidden="true" size={16} />;
  }
  if (allVisibleNotesSelected) {
    visibleSelectionIcon = <CheckSquare2 aria-hidden="true" size={16} />;
  }

  /**
   * 搜索只改变当前可见笔记，不应静默清除其他搜索结果里的选择。
   * 因此这个切换只增加或移除当前可见的笔记 ID。
   */
  const toggleVisibleNoteSelection = () => {
    const visibleIds = new Set(visibleNoteIds);
    setSelectedNoteIds((current) => {
      const shouldDeselect =
        visibleNoteIds.length > 0 &&
        visibleNoteIds.every((noteId) => current.includes(noteId));

      if (shouldDeselect) {
        return current.filter((noteId) => !visibleIds.has(noteId));
      }

      const next = [...current];
      visibleNoteIds.forEach((noteId) => {
        if (!next.includes(noteId)) next.push(noteId);
      });
      return next;
    });
  };

  if (loading) {
    return (
      <p className="workspace-detail-status">{t('workspace.detail.loading')}</p>
    );
  }

  if (!workspace) {
    return (
      <section className="workspace-detail-page">
        <p className="workspace-detail-error" role="alert">
          {error || t('workspace.error.notFound')}
        </p>
        <Link className="workspace-back-link" to={back.path}>
          {back.labelKey
            ? t('workspace.detail.backTo', { page: t(back.labelKey) })
            : t('workspace.detail.back')}
        </Link>
      </section>
    );
  }

  // 顶栏右侧的工具条：搜索 / 查找 / 批量操作。跟着顶栏一起固定，
  // 勾选笔记之后不必滚回页面顶部就能操作。
  const toolbar = (
    <>
      <div className="workspace-search-field">
        <Search className="workspace-search-icon" size={18} />
        <input
          aria-label={t('workspace.detail.search')}
          id="workspace-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('workspace.detail.searchPlaceholder')}
          title={t('workspace.detail.search')}
          type="search"
          value={query}
        />
      </div>

      <WorkspaceSemanticSearch
        onSelect={revealNote}
        query={query}
        workspaceId={detail.workspaceId}
      />

      <button
        aria-pressed={visibleSelectionState}
        className="ws-btn workspace-note-selection-toggle"
        disabled={visibleNoteIds.length === 0}
        onClick={toggleVisibleNoteSelection}
        title={t(visibleSelectionLabelKey)}
        type="button"
      >
        {visibleSelectionIcon}
        {t(visibleSelectionLabelKey)}
      </button>

      {/* 勾选之后才出现：平时工具条上不该挂着删除之类的按钮。
          两个都带计数，所以不必再单开一行显示「已选中 N 篇」。 */}
      {selectedNoteIds.length > 0 && (
        <>
          <button
            className="ws-btn ws-btn-primary"
            onClick={startNoteChat}
            type="button"
          >
            {t('workspace.detail.noteChat')} ({selectedNoteIds.length})
          </button>
          <button
            className="ws-btn ws-btn-danger-solid"
            onClick={() => setShowBatchDeleteModal(true)}
            type="button"
          >
            {t('workspace.detail.batchDelete')} ({selectedNoteIds.length})
          </button>
        </>
      )}
    </>
  );

  return (
    <section className="workspace-detail-page">
      <WorkspaceDetailHeader
        toolbar={toolbar}
        onDelete={() => setShowDeleteModal(true)}
        onRename={() => {
          setRenameInput(workspace.name);
          setShowRenameModal(true);
        }}
        workspace={workspace}
      />

      {/* 笔记全部装进这个容器，它自己滚。顶栏是页面里另一个独立的块，
          两者互不重叠——内容被这个容器裁掉，根本到不了顶栏那一层。 */}
      <div className="workspace-detail-body" data-tour="workspace-detail-notes">
        {error && (
          <p className="workspace-detail-error" role="alert">
            {error}
          </p>
        )}
        {status && <p className="workspace-detail-success">{status}</p>}

        {visibleNotes.length === 0 && (
          <div className="workspace-detail-empty">
            <strong>
              {query
                ? t('workspace.detail.emptySearch')
                : t('workspace.detail.empty')}
            </strong>
            <span>
              {query
                ? t('workspace.detail.emptySearchDesc')
                : t('workspace.detail.emptyDesc')}
            </span>
          </div>
        )}

        <div className="workspace-detail-notes">
          {visibleNotes.map((note) => (
            <WorkspaceNoteCard
              key={note.id}
              note={note}
              isSelected={selectedNoteIds.includes(note.id)}
              onToggleSelection={toggleNoteSelection}
              onDelete={handleDeleteNote}
              workspaceId={detail.workspaceId}
            />
          ))}
        </div>

        {/* 语义查找已经跟着搜索框搬进顶栏了，这里不再放第二个 */}
        <button
          className="ws-btn ws-btn-primary workspace-create-note-button"
          onClick={() => {
            setCreateNoteError('');
            setShowCreateNoteModal(true);
          }}
          type="button"
        >
          <Plus size={17} /> {t('workspace.note.createButton')}
        </button>
      </div>

      {showRenameModal && (
        <div className="workspace-modal-overlay">
          <div
            className="workspace-modal"
            style={{ width: '400px', margin: 'auto' }}
          >
            <header className="workspace-modal-head">
              <h2>{t('workspace.detail.rename', 'Rename Workspace')}</h2>
            </header>
            <div className="workspace-modal-body" style={{ padding: '24px' }}>
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '16px',
                  boxSizing: 'border-box',
                }}
                // 重命名弹窗打开后光标就该落在输入框里，
                // 这不是页面加载时抢焦点，规则的顾虑在这里不成立。
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    detail.renameWorkspace(renameInput);
                    setShowRenameModal(false);
                  }
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <button
                  className="ws-btn"
                  onClick={() => setShowRenameModal(false)}
                  type="button"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  className="ws-btn ws-btn-primary"
                  onClick={() => {
                    detail.renameWorkspace(renameInput);
                    setShowRenameModal(false);
                  }}
                  type="button"
                >
                  {t('common.confirm', 'Confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBatchDeleteModal && (
        <div className="workspace-modal-overlay">
          <div
            aria-labelledby="workspace-batch-delete-title"
            aria-modal="true"
            className="workspace-modal workspace-confirm-modal"
            role="dialog"
          >
            <header className="workspace-modal-head">
              <h2 id="workspace-batch-delete-title">
                {t('workspace.detail.batchDelete')}
              </h2>
            </header>
            <div className="workspace-modal-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', lineHeight: '1.5' }}>
                {t('workspace.detail.batchDeleteConfirm', {
                  count: selectedNoteIds.length,
                })}
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <button
                  className="ws-btn"
                  disabled={batchDeleting}
                  onClick={() => setShowBatchDeleteModal(false)}
                  type="button"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  className="ws-btn ws-btn-danger-solid"
                  disabled={batchDeleting}
                  onClick={handleBatchDelete}
                  type="button"
                >
                  {batchDeleting
                    ? t('workspace.detail.batchDeleting')
                    : t('workspace.detail.batchDelete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateNoteModal && (
        <div className="workspace-modal-overlay">
          <form
            aria-labelledby="workspace-create-note-title"
            aria-modal="true"
            className="workspace-modal workspace-create-note-modal"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!noteContent.trim() || creatingNote) return;
              try {
                setCreatingNote(true);
                setCreateNoteError('');
                const noteId = await detail.createNote(noteName, noteContent);
                setShowCreateNoteModal(false);
                setNoteName('');
                setNoteContent('');
                detail.revealNote(noteId);
              } catch (reason) {
                setCreateNoteError(
                  reason instanceof Error
                    ? reason.message
                    : t('workspace.note.createFailed'),
                );
              } finally {
                setCreatingNote(false);
              }
            }}
            role="dialog"
          >
            <header className="workspace-modal-head">
              <h2 id="workspace-create-note-title">
                {t('workspace.note.createTitle')}
              </h2>
            </header>
            <div className="workspace-create-note-body">
              <label htmlFor="workspace-new-note-name">
                <span>{t('workspace.note.nameLabel')}</span>
                <input
                  id="workspace-new-note-name"
                  maxLength={80}
                  onChange={(event) => setNoteName(event.target.value)}
                  placeholder={t('workspace.note.namePlaceholder')}
                  value={noteName}
                />
              </label>
              <label htmlFor="workspace-new-note-content">
                <span>{t('workspace.note.contentLabel')}</span>
                <textarea
                  // The primary field should receive focus when this modal opens.
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  id="workspace-new-note-content"
                  onChange={(event) => setNoteContent(event.target.value)}
                  placeholder={t('workspace.note.contentPlaceholder')}
                  required
                  rows={10}
                  value={noteContent}
                />
              </label>
              {createNoteError && (
                <p className="workspace-detail-error" role="alert">
                  {createNoteError}
                </p>
              )}
              <div className="workspace-create-note-actions">
                <button
                  className="ws-btn"
                  disabled={creatingNote}
                  onClick={() => setShowCreateNoteModal(false)}
                  type="button"
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="ws-btn ws-btn-primary"
                  disabled={!noteContent.trim() || creatingNote}
                  type="submit"
                >
                  {creatingNote
                    ? t('workspace.note.creating')
                    : t('workspace.note.createButton')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {showDeleteModal && (
        <div className="workspace-modal-overlay">
          <div
            aria-labelledby="workspace-delete-confirm-title"
            aria-modal="true"
            className="workspace-modal workspace-confirm-modal"
            role="dialog"
          >
            <header className="workspace-modal-head">
              <h2 id="workspace-delete-confirm-title">
                {t('workspace.detail.deleteWorkspace', 'Delete Workspace')}
              </h2>
            </header>
            <div className="workspace-modal-body" style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', lineHeight: '1.5' }}>
                {t(
                  'workspace.detail.deleteConfirm',
                  'Are you sure you want to delete this workspace and all its notes?',
                )}
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <button
                  className="ws-btn"
                  onClick={() => setShowDeleteModal(false)}
                  type="button"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  className="ws-btn ws-btn-danger-solid"
                  onClick={async () => {
                    const moved = await detail.moveWorkspaceToTrash();
                    setShowDeleteModal(false);
                    if (moved) {
                      navigate('/Workspace', {
                        state: { trashUndo: moved },
                      });
                    }
                  }}
                  type="button"
                >
                  {t('workspace.detail.deleteWorkspace', 'Delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {noteUndo && (
        <TrashUndoToast
          dismissLabel={t('trash.action.dismiss')}
          message={t('trash.notice.noteMoved', {
            name: noteUndo.name || t('workspace.note.unnamed'),
          })}
          onDismiss={() => setNoteUndo(null)}
          onUndo={undoDeleteNote}
          undoLabel={t('trash.action.undo')}
          undoingLabel={t('trash.action.restoring')}
        />
      )}
    </section>
  );
}
