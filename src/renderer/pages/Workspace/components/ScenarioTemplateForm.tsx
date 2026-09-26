import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeTemplateDTO } from '@shared/types/WorkflowTypes';

type Props = {
  template: KnowledgeTemplateDTO | null;
  onSubmit: (
    name: string,
    prompt: string,
  ) => Promise<KnowledgeTemplateDTO | void>;
  onCancel: () => void;
  onSavingChange?: (saving: boolean) => void;
};

export default function ScenarioTemplateForm({
  template,
  onSubmit,
  onCancel,
  onSavingChange,
}: Props) {
  const { t } = useTranslation();
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const promptId = `${fieldId}-prompt`;
  const promptHintId = `${fieldId}-prompt-hint`;
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(template?.name ?? '');
  const [prompt, setPrompt] = useState(template?.prompt ?? '');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    onSavingChange?.(true);
    setErrorMessage('');
    try {
      await onSubmit(name, prompt);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('workflow.form.saveError'),
      );
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  return (
    <form className="scenario-template-form" onSubmit={handleSubmit}>
      <label htmlFor={nameId}>
        {t('workflow.form.nameLabel')}
        <input
          id={nameId}
          ref={nameRef}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </label>
      <label htmlFor={promptId}>
        {t('workflow.form.promptLabel')}
        <textarea
          aria-describedby={promptHintId}
          id={promptId}
          maxLength={4000}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('workflow.form.promptPlaceholder')}
          value={prompt}
        />
        <small className="scenario-template-form-hint" id={promptHintId}>
          {t(
            'workflow.form.promptHint',
            'Write naturally—even rough or mixed requirements are fine. The active local model will organize them into precise, reusable extraction sections before saving.',
          )}
        </small>
      </label>
      {errorMessage && (
        <p className="scenario-template-form-error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="scenario-template-form-actions">
        <button
          className="ws-btn"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          {t('workflow.form.cancelBtn')}
        </button>
        <button
          className="ws-btn ws-btn-primary"
          disabled={saving || !name.trim() || !prompt.trim()}
          type="submit"
        >
          {saving ? t('workflow.form.saving') : t('workflow.form.saveBtn')}
        </button>
      </div>
    </form>
  );
}
