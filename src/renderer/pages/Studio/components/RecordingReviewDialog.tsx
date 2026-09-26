import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceSaveSelection } from '../../Recording/components/SaveToWorkspaceDialog';
import MarkdownText from '../../../components/Markdown/MarkdownText';
import CloseIcon from '../../../components/CloseIcon';

type WorkspaceOption = { id: number; name: string };

type Props = {
  open: boolean;
  defaultNoteName: string;
  rawTranscript: string;
  summary: string;
  /** 转录、Structured Note 或标题是否仍在后台生成。 */
  processing: boolean;
  saving: boolean;
  error: string | null;
  onSave(selection: WorkspaceSaveSelection): Promise<void>;
  onRerecord(): void;
  onClose(): void;
};

const NEW_WORKSPACE_VALUE = '__new__';

/**
 * 录音结束后的复核弹窗：并排展示 Structured Note 的 Summary 与原始转录，
 * 底部可保存为工作区笔记或重新录制。保存成功由父级负责把笔记挂到对话上。
 */
export default function RecordingReviewDialog({
  open,
  defaultNoteName,
  rawTranscript,
  summary,
  processing,
  saving,
  error,
  onSave,
  onRerecord,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceValue, setWorkspaceValue] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [noteName, setNoteName] = useState(defaultNoteName);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 用户是否手动改过标题：改过之后就不再被自动生成的标题覆盖。
  const [titleDirty, setTitleDirty] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setNewWorkspaceName('');
    setTitleDirty(false);
    setLoadError(null);
    setLoading(true);

    window.electron.workspace
      .getList(100)
      .then((items) => {
        if (cancelled) return null;
        const options = (items as WorkspaceOption[]).filter(
          (item) => Number.isInteger(item.id) && item.id > 0 && item.name,
        );
        setWorkspaces(options);
        setWorkspaceValue(
          options.length > 0 ? String(options[0].id) : NEW_WORKSPACE_VALUE,
        );
        return null;
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setWorkspaces([]);
        setWorkspaceValue(NEW_WORKSPACE_VALUE);
        setLoadError(
          reason instanceof Error
            ? reason.message
            : t('recording.review.loadError'),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, t]);

  // 标题随外部默认值更新（如稍后生成的 AI 标题），但不覆盖用户已手动输入的内容。
  useEffect(() => {
    if (!open || titleDirty) return;
    setNoteName(defaultNoteName);
  }, [open, defaultNoteName, titleDirty]);

  const selectedWorkspaceId = useMemo(() => {
    if (workspaceValue === NEW_WORKSPACE_VALUE) return null;
    const id = Number(workspaceValue);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [workspaceValue]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (saving || loading || processing) return;
    onSave({
      workspaceId: selectedWorkspaceId,
      newWorkspaceName: newWorkspaceName.trim(),
      noteName: noteName.trim(),
    }).catch(() => undefined);
  };

  return (
    <div className="studio-review-modal" role="presentation">
      <form className="studio-review-dialog" onSubmit={submit}>
        <header>
          <div>
            <h2>{t('recording.review.title')}</h2>
            {processing && (
              <p className="studio-review-progress">
                <span className="studio-review-spinner" aria-hidden="true" />
                {t('recording.review.summarizing')}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-plain studio-review-dialog__close"
            disabled={saving}
            onClick={onClose}
            aria-label={t('recording.review.close')}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="studio-review-texts">
          <section>
            <h3>{t('recording.review.summaryTitle')}</h3>
            <div className="studio-review-text">
              {/* 整理结果由模型产出，按富文本显示；
                  下面的转录原文是语音识别结果，保持纯文本。 */}
              <MarkdownText
                content={summary}
                fallback={
                  <span className="studio-review-empty">
                    {processing
                      ? t('recording.review.summarizing')
                      : t('recording.review.noSummary')}
                  </span>
                }
              />
            </div>
          </section>
          <section>
            <h3>{t('recording.review.transcriptTitle')}</h3>
            <div className="studio-review-text">
              {rawTranscript || (
                <span className="studio-review-empty">
                  {processing
                    ? t('recording.review.transcribing')
                    : t('recording.review.noText')}
                </span>
              )}
            </div>
          </section>
        </div>

        <div className="studio-review-form">
          <label htmlFor="studio-review-workspace">
            <span>{t('recording.review.workspace')}</span>
            <select
              id="studio-review-workspace"
              value={workspaceValue}
              disabled={saving || loading}
              onChange={(event) => setWorkspaceValue(event.target.value)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
              <option value={NEW_WORKSPACE_VALUE}>
                {t('recording.review.newWorkspace')}
              </option>
            </select>
          </label>

          {/* 选了「新建」才出现，直接用占位符提示，不再重复一行标签。 */}
          {workspaceValue === NEW_WORKSPACE_VALUE && (
            <input
              id="studio-review-new-workspace"
              type="text"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={newWorkspaceName}
              disabled={saving}
              maxLength={80}
              placeholder={t('recording.review.newWorkspacePlaceholder')}
              aria-label={t('recording.review.newWorkspacePlaceholder')}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
            />
          )}

          <label htmlFor="studio-review-note-name">
            <span>{t('recording.review.noteNameTitle')}</span>
            <input
              id="studio-review-note-name"
              type="text"
              value={noteName}
              disabled={saving}
              maxLength={80}
              onChange={(event) => {
                setTitleDirty(true);
                setNoteName(event.target.value);
              }}
            />
          </label>
        </div>

        {(loadError || error) && (
          <p className="studio-review-dialog__error" role="alert">
            {error || loadError}
          </p>
        )}

        <footer>
          <button
            type="button"
            className="studio-review-dialog__secondary"
            disabled={saving}
            onClick={onRerecord}
          >
            {t('recording.review.rerecordLabel')}
          </button>
          <button
            type="submit"
            disabled={
              saving ||
              loading ||
              processing ||
              !rawTranscript.trim() ||
              !noteName.trim() ||
              (workspaceValue === NEW_WORKSPACE_VALUE &&
                !newWorkspaceName.trim())
            }
          >
            {saving
              ? t('recording.review.savingState')
              : t('recording.review.saveAndChat')}
          </button>
        </footer>
      </form>
    </div>
  );
}
