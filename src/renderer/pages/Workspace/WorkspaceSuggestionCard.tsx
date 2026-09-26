import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { WorkspaceSuggestion } from './WorkspaceSuggestionController';
import './WorkspaceSuggestionCard.css';

type WorkspaceSuggestionCardProps = {
  suggestion: WorkspaceSuggestion;
  onUseName: (name: string) => void;
  onRename: (workspaceId: number, name: string) => Promise<void>;
};

/** 自动整理建议卡；只在用户确认后填入名称或重命名现有空间。 */
export default function WorkspaceSuggestionCard({
  suggestion,
  onUseName,
  onRename,
}: WorkspaceSuggestionCardProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState('');

  if (!suggestion.shouldSuggest) return null;

  const renameWorkspace = async () => {
    if (!suggestion.targetWorkspaceId) return;
    try {
      setRenaming(true);
      setError('');
      await onRename(suggestion.targetWorkspaceId, suggestion.name);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('workspace.error.createFailed'),
      );
    } finally {
      setRenaming(false);
    }
  };

  return (
    <aside
      className="workspace-suggestion"
      aria-label={t('workspace.suggestion.prefix')}
    >
      <span className="workspace-suggestion-icon" aria-hidden="true">
        <Sparkles size={16} />
      </span>
      <div className="workspace-suggestion-copy">
        <span>
          {t('workspace.suggestion.prefix')}
          {suggestion.category}
        </span>
        <strong>{suggestion.name}</strong>
        <small>{error || suggestion.reason}</small>
      </div>
      <div className="workspace-suggestion-actions">
        <button onClick={() => onUseName(suggestion.name)} type="button">
          {t('workspace.suggestion.createLabel')}
        </button>
        {suggestion.targetWorkspaceId && (
          <button
            className="is-primary"
            disabled={renaming}
            onClick={renameWorkspace}
            type="button"
          >
            {renaming
              ? t('workspace.suggestion.creating')
              : t('workspace.suggestion.create')}
          </button>
        )}
      </div>
    </aside>
  );
}
