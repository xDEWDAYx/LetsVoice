import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '../../../components/CloseIcon';

type WorkspaceOption = {
  id: number;
  name: string;
};

export type WorkspaceSaveSelection = {
  workspaceId: number | null;
  newWorkspaceName: string;
  noteName: string;
};

type Props = {
  open: boolean;
  defaultNoteName: string;
  saving: boolean;
  error: string | null;
  onClose(): void;
  onSave(selection: WorkspaceSaveSelection): Promise<void>;
};

const NEW_WORKSPACE_VALUE = '__new__';

export default function SaveToWorkspaceDialog({
  open,
  defaultNoteName,
  saving,
  error,
  onClose,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceValue, setWorkspaceValue] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [noteName, setNoteName] = useState(defaultNoteName);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setNoteName(defaultNoteName);
    setNewWorkspaceName('');
    setLoadError(null);
    setLoading(true);

    const loadWorkspaces = async () => {
      try {
        const items = (await window.electron.workspace.getList(
          100,
        )) as WorkspaceOption[];
        if (cancelled) return;
        const options = items.filter(
          (item) => Number.isInteger(item.id) && item.id > 0 && item.name,
        );
        setWorkspaces(options);
        setWorkspaceValue(
          options.length > 0 ? String(options[0].id) : NEW_WORKSPACE_VALUE,
        );
      } catch (reason) {
        if (cancelled) return;
        setWorkspaces([]);
        setWorkspaceValue(NEW_WORKSPACE_VALUE);
        setLoadError(
          reason instanceof Error
            ? reason.message
            : t('recording.saveDialog.loadError'),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadWorkspaces().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [defaultNoteName, open, t]);

  const selectedWorkspaceId = useMemo(() => {
    if (workspaceValue === NEW_WORKSPACE_VALUE) return null;
    const id = Number(workspaceValue);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [workspaceValue]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (saving || loading) return;
    onSave({
      workspaceId: selectedWorkspaceId,
      newWorkspaceName: newWorkspaceName.trim(),
      noteName: noteName.trim(),
    }).catch(() => undefined);
  };

  return (
    <div className="workspace-save-modal" role="presentation">
      <form
        className="workspace-save-dialog"
        aria-label={t('recording.saveDialog.title')}
        onSubmit={submit}
      >
        <header>
          <div>
            <span>WORKSPACE NOTE</span>
            <h2>{t('recording.saveDialog.title')}</h2>
          </div>
          <button
            className="workspace-save-dialog__close"
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label={t('recording.saveDialog.close')}
          >
            <CloseIcon size={14} />
          </button>
        </header>

        <p className="workspace-save-dialog__hint">
          {t('recording.saveDialog.hint')}
        </p>

        <label htmlFor="workspace-save-target">
          <span>{t('recording.saveDialog.workspaceLabel')}</span>
          <select
            id="workspace-save-target"
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
              {t('recording.saveDialog.newWorkspaceOption')}
            </option>
          </select>
        </label>

        {workspaceValue === NEW_WORKSPACE_VALUE && (
          <label htmlFor="workspace-save-new-name">
            <span>{t('recording.saveDialog.newWorkspaceNameLabel')}</span>
            <input
              id="workspace-save-new-name"
              type="text"
              value={newWorkspaceName}
              disabled={saving}
              maxLength={80}
              placeholder={t('recording.saveDialog.newWorkspacePlaceholder')}
              onChange={(event) => setNewWorkspaceName(event.target.value)}
            />
          </label>
        )}

        <label htmlFor="workspace-save-note-name">
          <span>{t('recording.saveDialog.noteTitleLabel')}</span>
          <input
            id="workspace-save-note-name"
            type="text"
            value={noteName}
            disabled={saving}
            maxLength={80}
            onChange={(event) => setNoteName(event.target.value)}
          />
        </label>

        {(loadError || error) && (
          <p className="workspace-save-dialog__error" role="alert">
            {error || loadError}
          </p>
        )}

        <footer>
          <button
            className="recording-button--secondary"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            {t('recording.saveDialog.cancel')}
          </button>
          <button
            type="submit"
            disabled={
              saving ||
              loading ||
              !noteName.trim() ||
              (workspaceValue === NEW_WORKSPACE_VALUE &&
                !newWorkspaceName.trim())
            }
          >
            {saving
              ? t('recording.saveDialog.saving')
              : t('recording.saveDialog.saveNote')}
          </button>
        </footer>
      </form>
    </div>
  );
}
