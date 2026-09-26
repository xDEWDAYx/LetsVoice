import {
  CSSProperties,
  FormEvent,
  useRef,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { TrashActionResult } from '@shared/types/TrashTypes';
import { WorkspaceController, WorkspaceItem } from './WorkspaceController';
import WorkspaceSuggestionCard from './WorkspaceSuggestionCard';
import {
  WorkspaceSuggestion,
  WorkspaceSuggestionController,
} from './WorkspaceSuggestionController';
import useSpotlight from '../../components/useSpotlight';
import TrashUndoToast from '../../components/TrashUndoToast';
import './WorkspaceHomePage.css';

const workspaceController = new WorkspaceController();
const suggestionController = new WorkspaceSuggestionController();

type WorkspaceHomePageProps = {
  limit: number;
  directory: boolean;
};

/**
 * 首页只展示最近使用的 Workspace 摘要；完整内容留在独立详情页。
 * The home page remains a lightweight recent-entry surface.
 */
export default function WorkspaceHomePage({
  limit,
  directory,
}: WorkspaceHomePageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // 进详情页时留下来源，返回按钮才知道该回哪一页（见 BackNavigation）。
  const detailState = { from: location.pathname };
  // 卡片跟随光标的柔光。写的是 CSS 变量，不进 React 状态，
  // 因此 pointermove 再密也不会触发重渲染。
  const spotlight = useSpotlight();
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [name, setName] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [trashUndo, setTrashUndo] = useState<TrashActionResult | null>(null);
  const [restoredWorkspace, setRestoredWorkspace] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [suggestion, setSuggestion] = useState<WorkspaceSuggestion | null>(
    null,
  );

  const loadWorkspaces = useCallback(async () => {
    try {
      setError('');
      const [workspaces, nextSuggestion] = await Promise.all([
        workspaceController.getWorkspaces(limit),
        suggestionController.getSuggestion(),
      ]);
      setItems(workspaces);
      setSuggestion(nextSuggestion);
    } catch (reason) {
      setError(
        WorkspaceController.getErrorMessage(
          reason,
          t('workspace.error.readFailed'),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [limit, t]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    const routedUndo = (
      location.state as { trashUndo?: TrashActionResult } | null
    )?.trashUndo;
    if (routedUndo?.itemType === 'workspace') {
      setTrashUndo(routedUndo);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const undoWorkspaceMove = async () => {
    if (!trashUndo) return;
    const restored = (await window.electron.trash.restore({
      itemType: 'workspace',
      id: trashUndo.id,
    })) as TrashActionResult;
    await loadWorkspaces();
    setRestoredWorkspace({ id: restored.id, name: restored.name });
  };

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    try {
      setCreating(true);
      setError('');
      const created = await workspaceController.createWorkspace(name);
      navigate(`/Workspace/${created.id}`, { state: detailState });
    } catch (reason) {
      setError(
        WorkspaceController.getErrorMessage(
          reason,
          t('workspace.error.createFailed'),
        ),
      );
    } finally {
      setCreating(false);
    }
  };

  const renameSuggestedWorkspace = async (
    workspaceId: number,
    suggestedName: string,
  ) => {
    const renamed = await workspaceController.renameWorkspace(
      workspaceId,
      suggestedName,
    );
    if (!renamed) throw new Error(t('workspace.error.notFound'));
    await loadWorkspaces();
  };

  return (
    <section className="workspace-home">
      <header className="workspace-home-header">
        <div>
          <span className="workspace-home-eyebrow">
            {directory ? t('workspace.title.all') : t('workspace.title.recent')}
          </span>
          <h1>
            {directory ? t('workspace.title.all') : t('workspace.title.recent')}
          </h1>
          <p>
            {directory ? t('workspace.desc.all') : t('workspace.desc.recent')}
          </p>
        </div>

        <form
          className="workspace-home-create"
          data-tour="workspace-home-create"
          onSubmit={createWorkspace}
        >
          <label htmlFor="recent-workspace-name">
            <span>{t('workspace.create.label')}</span>
            <div>
              <input
                ref={createInputRef}
                id="recent-workspace-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('workspace.create.placeholder')}
                value={name}
              />
              <button disabled={!name.trim() || creating} type="submit">
                {creating
                  ? t('workspace.create.busy')
                  : t('workspace.create.button')}
              </button>
            </div>
          </label>
        </form>
      </header>

      {suggestion && (
        <WorkspaceSuggestionCard
          onRename={renameSuggestedWorkspace}
          onUseName={setName}
          suggestion={suggestion}
        />
      )}

      {error && (
        <p className="workspace-home-error" role="alert">
          {error}
        </p>
      )}

      {restoredWorkspace && (
        <div className="workspace-home-restored" role="status">
          <span>
            {t('trash.notice.workspaceRestored', {
              name: restoredWorkspace.name,
            })}
          </span>
          <button
            onClick={() =>
              navigate(`/Workspace/${restoredWorkspace.id}`, {
                state: detailState,
              })
            }
            type="button"
          >
            {t('trash.action.view')}
          </button>
        </div>
      )}

      <div className="workspace-home-section-heading">
        <div>
          <h2>
            {directory
              ? t('workspace.list.title')
              : t('workspace.recent.title')}
          </h2>
          <p>{t('workspace.list.desc')}</p>
        </div>
        <div className="workspace-list-actions">
          <button
            className="workspace-new-button"
            onClick={() => {
              createInputRef.current?.focus();
              createInputRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }}
            type="button"
          >
            + {t('workspace.create.newButton')}
          </button>
          {!directory && <Link to="/Workspace">{t('workspace.viewAll')}</Link>}
        </div>
      </div>

      {loading && (
        <p className="workspace-home-status">{t('workspace.loading')}</p>
      )}

      {!loading && items.length === 0 && (
        <div className="workspace-home-empty">
          <span aria-hidden="true">◇</span>
          <h2>{t('workspace.empty.title')}</h2>
          <p>{t('workspace.empty.desc')}</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="workspace-home-grid">
          {items.map((item, index) => (
            <button
              className="workspace-home-card fx-spotlight fx-sheen"
              key={item.id}
              onClick={() =>
                navigate(`/Workspace/${item.id}`, { state: detailState })
              }
              type="button"
              // 错位进场的序号。上限 10 是故意的：再往后延迟会长到
              // 让人觉得列表在卡，超出的都跟第 10 张一起出现。
              style={{ '--i': Math.min(index, 10) } as CSSProperties}
              onPointerMove={spotlight.onPointerMove}
              onPointerLeave={spotlight.onPointerLeave}
            >
              <span className="workspace-home-card-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="workspace-home-card-icon" aria-hidden="true">
                W
              </span>
              <span className="workspace-home-card-copy">
                <strong>{item.name}</strong>
                <small>
                  {item.note_count} {t('workspace.detail.noteCount')} ·{' '}
                  {item.pinned_count} {t('workspace.detail.pinnedCount')}
                </small>
                <time dateTime={item.recent_at}>
                  {item.last_opened_at
                    ? t('workspace.opened')
                    : t('workspace.created')}{' '}
                  {WorkspaceController.formatDate(
                    item.recent_at,
                    'long',
                    i18n.language,
                  )}
                </time>
              </span>
              <span className="workspace-home-card-arrow" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      )}

      {trashUndo && (
        <TrashUndoToast
          dismissLabel={t('trash.action.dismiss')}
          message={t('trash.notice.workspaceMoved', {
            name: trashUndo.name,
          })}
          onDismiss={() => setTrashUndo(null)}
          onUndo={undoWorkspaceMove}
          undoLabel={t('trash.action.undo')}
          undoingLabel={t('trash.action.restoring')}
        />
      )}
    </section>
  );
}
