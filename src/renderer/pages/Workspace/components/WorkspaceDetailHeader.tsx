import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Edit3,
  Trash2,
  FileText,
  Pin,
  Clock,
  Activity,
} from 'lucide-react';
import { WorkspaceController, WorkspaceItem } from '../WorkspaceController';
import { useBackNavigation } from '../../../router/BackNavigation';

type Props = {
  workspace: WorkspaceItem;
  onRename(): void;
  onDelete(): void;
  /**
   * 搜索、查找、批量操作这些控件，渲染在元信息那一行的右侧。
   * 放进顶栏而不是另起一块，是为了让它们跟着顶栏一起固定住——
   * 笔记一多，勾选完还得滚回顶部才能点，那就没法用了。
   */
  toolbar?: React.ReactNode;
};

/**
 * 顶部只做一件事：说明当前在哪个工作空间，并提供重命名 / 删除 / 工具条。
 * 元信息用图标承载，完整含义放在 title 里，避免一行全是说明文字。
 * 滚动时整块固定在顶部（见 .workspace-detail-topbar）。
 */
export default function WorkspaceDetailHeader({
  workspace,
  onRename,
  onDelete,
  toolbar,
}: Props) {
  const { t, i18n } = useTranslation();
  // 从哪个页面点进来就回哪去；直接打开（刷新、深链）时回工作空间列表。
  const back = useBackNavigation();
  return (
    <div
      className="workspace-detail-topbar"
      data-tour="workspace-detail-header"
    >
      {/* 返回和标题同一行：吸顶栏本来就该矮，不值得为一个返回链接单开一行。 */}
      <header className="workspace-detail-head">
        <Link className="workspace-back-link" to={back.path}>
          <ArrowLeft size={15} />
          <span>
            {back.labelKey
              ? t('workspace.detail.backTo', { page: t(back.labelKey) })
              : t('workspace.detail.backBtn')}
          </span>
        </Link>
        <span className="workspace-detail-sep" aria-hidden="true" />
        <div className="workspace-detail-identity">
          <h1 title={workspace.name}>{workspace.name}</h1>
        </div>
        <div className="workspace-detail-actions">
          <button
            aria-label="Rename"
            className="ws-btn ws-btn-icon"
            onClick={onRename}
            title="Rename"
            type="button"
          >
            <Edit3 size={18} />
          </button>
          <button
            aria-label={t('workspace.detail.deleteWorkspace')}
            className="ws-btn ws-btn-icon ws-btn-danger"
            onClick={onDelete}
            title={t('workspace.detail.deleteWorkspace')}
            type="button"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {/* 元信息与工具条同一行：左边是这个空间的概况，右边是操作。 */}
      <div className="workspace-detail-subrow">
        <p className="workspace-detail-meta">
          <span title={t('workspace.detail.notesLabel')}>
            <FileText size={14} style={{ marginRight: 4 }} />{' '}
            {workspace.note_count}
          </span>
          <span title={t('workspace.detail.pinnedLabel')}>
            <Pin size={14} style={{ marginRight: 4 }} />{' '}
            {workspace.pinned_count}
          </span>
          <span title={t('workspace.detail.lastOpened')}>
            <Clock size={14} style={{ marginRight: 4 }} />{' '}
            {WorkspaceController.formatDate(
              workspace.recent_at,
              'short',
              i18n.language,
            )}
          </span>
          <span title={t('workspace.detail.updated')}>
            <Activity size={14} style={{ marginRight: 4 }} />{' '}
            {WorkspaceController.formatDate(
              workspace.updated_at,
              'short',
              i18n.language,
            )}
          </span>
        </p>

        {toolbar ? (
          <div className="workspace-detail-tools">{toolbar}</div>
        ) : null}
      </div>
    </div>
  );
}
