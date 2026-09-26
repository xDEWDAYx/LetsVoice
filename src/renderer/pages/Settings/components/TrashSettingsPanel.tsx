import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CircleAlert,
  FileText,
  Folder,
  LayoutTemplate,
  MessageSquare,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  TrashActionResult,
  TrashFilter,
  TrashItem,
  TrashListResult,
} from '@shared/types/TrashTypes';
import './TrashSettingsPanel.css';
import CloseIcon from '../../../components/CloseIcon';

const PAGE_SIZE = 30;

type TrashSettingsPanelProps = {
  onCountChange: (count: number) => void;
};

type TrashNotice = {
  kind: 'restored' | 'deleted';
  result: TrashActionResult;
};

/** Searchable lifecycle UI for all recoverable user-created content. */
export default function TrashSettingsPanel({
  onCountChange,
}: TrashSettingsPanelProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<TrashFilter>('all');
  const [items, setItems] = useState<TrashItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [busyTarget, setBusyTarget] = useState('');
  const [confirmItem, setConfirmItem] = useState<TrashItem | null>(null);
  const [notice, setNotice] = useState<TrashNotice | null>(null);
  const requestSequence = useRef(0);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.language, i18n.resolvedLanguage],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const refreshCount = useCallback(async () => {
    const count = (await window.electron.trash.count()) as number;
    onCountChange(count);
  }, [onCountChange]);

  const loadPage = useCallback(
    async (requestedPage: number, append = false) => {
      requestSequence.current += 1;
      const sequence = requestSequence.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');

      try {
        const result = (await window.electron.trash.list({
          filter,
          page: requestedPage,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
        })) as TrashListResult;
        if (sequence !== requestSequence.current) return;

        setItems((current) => {
          if (!append) return result.items;
          const existing = new Set(
            current.map((item) => `${item.itemType}:${item.id}`),
          );
          return [
            ...current,
            ...result.items.filter(
              (item) => !existing.has(`${item.itemType}:${item.id}`),
            ),
          ];
        });
        setPage(result.page);
        setTotal(result.total);
      } catch (reason) {
        if (sequence !== requestSequence.current) return;
        setError(
          reason instanceof Error ? reason.message : t('trash.error.load'),
        );
        if (!append) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (sequence === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedSearch, filter, t],
  );

  const refreshAfterAction = useCallback(async () => {
    await loadPage(1);
    try {
      await refreshCount();
    } catch {
      // The item mutation already succeeded. A stale navigation badge must
      // not turn that success into a misleading restore/delete error.
    }
  }, [loadPage, refreshCount]);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    if (!confirmItem) return undefined;
    const focusFrame = window.requestAnimationFrame(() =>
      cancelButtonRef.current?.focus(),
    );
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyTarget) setConfirmItem(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [busyTarget, confirmItem]);

  const itemKey = (item: TrashItem) => `${item.itemType}:${item.id}`;

  const untitledKey = (itemType: TrashItem['itemType']) => {
    if (itemType === 'note') return 'trash.item.untitledNote';
    if (itemType === 'conversation') return 'trash.item.untitledConversation';
    if (itemType === 'template') return 'trash.item.untitledTemplate';
    return 'trash.item.untitledWorkspace';
  };

  const displayName = (item: TrashItem) =>
    item.name || t(untitledKey(item.itemType));

  const renderItemIcon = (itemType: TrashItem['itemType']) => {
    if (itemType === 'note') return <FileText size={19} />;
    if (itemType === 'conversation') return <MessageSquare size={19} />;
    if (itemType === 'workspace') return <Folder size={19} />;
    return <LayoutTemplate size={19} />;
  };

  const permanentDeleteDescription = (item: TrashItem) => {
    if (item.itemType === 'workspace') {
      return t('trash.confirm.workspace', {
        count: item.noteCount,
        name: displayName(item),
      });
    }
    if (item.itemType === 'conversation') {
      return t('trash.confirm.conversation', {
        count: item.messageCount,
        name: displayName(item),
      });
    }
    if (item.itemType === 'template') {
      return t('trash.confirm.template', {
        count: item.outputCount,
        name: displayName(item),
      });
    }
    return t('trash.confirm.note', { name: displayName(item) });
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
  };

  const restore = async (item: TrashItem) => {
    const key = itemKey(item);
    setBusyTarget(key);
    setError('');
    setNotice(null);
    try {
      const result = (await window.electron.trash.restore({
        id: item.id,
        itemType: item.itemType,
      })) as TrashActionResult;
      setNotice({ kind: 'restored', result });
      await refreshAfterAction();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('trash.error.restore'),
      );
    } finally {
      setBusyTarget('');
    }
  };

  const permanentlyDelete = async () => {
    if (!confirmItem) return;
    const key = itemKey(confirmItem);
    setBusyTarget(key);
    setError('');
    setNotice(null);
    try {
      const result = (await window.electron.trash.permanentlyDelete({
        id: confirmItem.id,
        itemType: confirmItem.itemType,
      })) as TrashActionResult;
      setConfirmItem(null);
      setNotice({ kind: 'deleted', result });
      await refreshAfterAction();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('trash.error.delete'),
      );
    } finally {
      setBusyTarget('');
    }
  };

  const viewRestored = (result: TrashActionResult) => {
    // 带上来源，详情页的返回按钮才会回到设置页而不是首页。
    const from = location.pathname;
    if (result.itemType === 'workspace') {
      navigate(`/Workspace/${result.id}`, { state: { from } });
      return;
    }
    if (result.workspaceId) {
      navigate(`/Workspace/${result.workspaceId}`, {
        state: { from, noteId: result.id },
      });
    }
  };

  const hasMore = items.length < total;
  const canViewRestored =
    notice?.result.itemType === 'note' ||
    notice?.result.itemType === 'workspace';
  const emptyFromSearch = Boolean(debouncedSearch) || filter !== 'all';
  const emptyTitleKey = emptyFromSearch
    ? 'trash.empty.searchTitle'
    : 'trash.empty.title';
  const emptyDescriptionKey = emptyFromSearch
    ? 'trash.empty.searchDesc'
    : 'trash.empty.desc';
  const filters: TrashFilter[] = [
    'all',
    'note',
    'conversation',
    'workspace',
    'template',
  ];

  return (
    <section
      className="settings-panel trash-settings"
      data-tour="settings-trash-panel"
      aria-labelledby="trash-title"
    >
      <div className="settings-panel-heading">
        <span
          className="settings-panel-icon trash-settings-icon"
          aria-hidden="true"
        >
          <Trash2 size={20} />
        </span>
        <div>
          <h2 id="trash-title">{t('trash.title')}</h2>
          <p>{t('trash.desc')}</p>
        </div>
      </div>

      <div className="trash-settings-toolbar">
        <label className="trash-search" htmlFor="trash-search-input">
          <span className="trash-search-glyph" aria-hidden="true">
            <Search size={17} />
          </span>
          <span className="trash-visually-hidden">
            {t('trash.search.placeholder')}
          </span>
          <input
            id="trash-search-input"
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('trash.search.placeholder')}
            type="search"
            value={search}
          />
          {search && (
            <button
              aria-label={t('trash.search.clear')}
              className="btn-plain trash-search-clear"
              onClick={() => setSearch('')}
              type="button"
            >
              <CloseIcon size={12} />
            </button>
          )}
        </label>

        <div
          aria-label={t('trash.filter.label')}
          className="trash-filters"
          role="group"
        >
          {filters.map((value) => (
            <button
              aria-pressed={filter === value}
              className={filter === value ? 'is-active' : ''}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {t(`trash.filter.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="trash-settings-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <div className="trash-settings-notice" role="status">
          <span>
            {notice.kind === 'restored'
              ? t('trash.notice.itemRestored', {
                  name:
                    notice.result.name ||
                    t(untitledKey(notice.result.itemType)),
                })
              : t('trash.notice.itemDeleted', {
                  name:
                    notice.result.name ||
                    t(untitledKey(notice.result.itemType)),
                })}
          </span>
          {notice.kind === 'restored' && canViewRestored && (
            <button onClick={() => viewRestored(notice.result)} type="button">
              {t('trash.action.view')}
            </button>
          )}
          <button
            aria-label={t('trash.action.dismiss')}
            className="btn-plain trash-notice-dismiss"
            onClick={() => setNotice(null)}
            type="button"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      <div className="trash-result-summary" aria-live="polite">
        {t('trash.summary', { count: total })}
      </div>

      {loading && items.length === 0 && (
        <div className="trash-settings-state">{t('trash.loading')}</div>
      )}

      {!loading && items.length === 0 && (
        <div className="trash-settings-state">
          <span className="trash-empty-glyph" aria-hidden="true">
            <Trash2 size={22} />
          </span>
          <strong>{t(emptyTitleKey)}</strong>
          <p>{t(emptyDescriptionKey)}</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="trash-items">
          {items.map((item) => {
            const key = itemKey(item);
            const busy = busyTarget === key;
            return (
              <article className="trash-item" key={key}>
                <span
                  className={`trash-item-glyph is-${item.itemType}`}
                  aria-hidden="true"
                >
                  {renderItemIcon(item.itemType)}
                </span>
                <div className="trash-item-content">
                  <div className="trash-item-title-row">
                    <strong>{displayName(item)}</strong>
                    <span className="trash-type-badge">
                      {t(`trash.type.${item.itemType}`)}
                    </span>
                  </div>
                  {item.itemType === 'note' ? (
                    <>
                      <p className="trash-item-preview">
                        {item.preview || t('trash.item.noPreview')}
                      </p>
                      <span className="trash-item-meta">
                        {t('trash.item.originalWorkspace', {
                          name: item.originalWorkspaceName,
                        })}
                      </span>
                    </>
                  ) : null}
                  {item.itemType === 'workspace' && (
                    <span className="trash-item-meta">
                      {t('trash.item.noteCount', { count: item.noteCount })}
                      {item.matchedContainedNote && (
                        <span className="trash-contained-match">
                          {t('trash.item.containsMatch')}
                        </span>
                      )}
                    </span>
                  )}
                  {item.itemType === 'conversation' && (
                    <span className="trash-item-meta">
                      {t('trash.item.messageCount', {
                        count: item.messageCount,
                      })}
                    </span>
                  )}
                  {item.itemType === 'template' && (
                    <>
                      <p className="trash-item-preview">
                        {item.preview || t('trash.item.noTemplatePreview')}
                      </p>
                      <span className="trash-item-meta">
                        {t('trash.item.outputCount', {
                          count: item.outputCount,
                        })}
                      </span>
                    </>
                  )}
                  <time className="trash-item-time" dateTime={item.trashedAt}>
                    {t('trash.item.trashedAt', {
                      date: formatDate(item.trashedAt),
                    })}
                  </time>
                </div>
                <div className="trash-item-actions">
                  <button
                    disabled={Boolean(busyTarget)}
                    onClick={() => restore(item)}
                    type="button"
                  >
                    {busy
                      ? t('trash.action.restoring')
                      : t('trash.action.restore')}
                  </button>
                  <button
                    className="trash-permanent-button"
                    disabled={Boolean(busyTarget)}
                    onClick={() => {
                      setNotice(null);
                      setConfirmItem(item);
                    }}
                    type="button"
                  >
                    {t('trash.action.permanentlyDelete')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasMore && (
        <button
          className="trash-load-more"
          disabled={loadingMore}
          onClick={() => loadPage(page + 1, true)}
          type="button"
        >
          {loadingMore ? t('trash.loadingMore') : t('trash.loadMore')}
        </button>
      )}

      {confirmItem && (
        <div
          className="trash-confirm-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !busyTarget) {
              setConfirmItem(null);
            }
          }}
          role="presentation"
        >
          <section
            aria-describedby="trash-confirm-description"
            aria-labelledby="trash-confirm-title"
            aria-modal="true"
            className="trash-confirm-dialog"
            role="dialog"
          >
            <span className="trash-confirm-glyph" aria-hidden="true">
              <CircleAlert size={22} />
            </span>
            <h3 id="trash-confirm-title">{t('trash.confirm.title')}</h3>
            <p id="trash-confirm-description">
              {permanentDeleteDescription(confirmItem)}
            </p>
            <strong className="trash-confirm-warning">
              {t('trash.confirm.irreversible')}
            </strong>
            <div className="trash-confirm-actions">
              <button
                disabled={Boolean(busyTarget)}
                onClick={() => setConfirmItem(null)}
                ref={cancelButtonRef}
                type="button"
              >
                {t('trash.action.cancel')}
              </button>
              <button
                className="trash-confirm-danger"
                disabled={Boolean(busyTarget)}
                onClick={permanentlyDelete}
                type="button"
              >
                {busyTarget
                  ? t('trash.action.deleting')
                  : t('trash.action.permanentlyDelete')}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
