import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '../../../components/CloseIcon';

type AskAICreateNoteDialogProps = {
  onClose: () => void;
  onCreate: (name: string, transcript: string) => Promise<boolean>;
};

export default function AskAICreateNoteDialog({
  onClose,
  onCreate,
}: AskAICreateNoteDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [transcript, setTranscript] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transcript.trim() || isSaving) return;

    setIsSaving(true);
    const created = await onCreate(name.trim(), transcript.trim());
    setIsSaving(false);
    if (created) onClose();
  }

  return (
    <div className="ask-ai-dialog-backdrop" role="presentation">
      <form className="ask-ai-dialog" onSubmit={handleSubmit}>
        <header>
          <div>
            <span>{t('askAI.createNote.library')}</span>
            <h2>{t('askAI.createNote.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('askAI.createNote.close')}
          >
            <CloseIcon size={14} />
          </button>
        </header>

        <label htmlFor="ask-ai-note-name">
          {t('askAI.createNote.nameLabel')}
          <input
            id="ask-ai-note-name"
            value={name}
            placeholder={t('askAI.createNote.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label htmlFor="ask-ai-note-transcript">
          {t('askAI.createNote.contentLabel')}
          <textarea
            id="ask-ai-note-transcript"
            value={transcript}
            placeholder={t('askAI.createNote.contentPlaceholder')}
            onChange={(event) => setTranscript(event.target.value)}
          />
        </label>

        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            {t('askAI.createNote.cancel')}
          </button>
          <button type="submit" disabled={!transcript.trim() || isSaving}>
            {isSaving
              ? t('askAI.createNote.saving')
              : t('askAI.createNote.saveBtn')}
          </button>
        </footer>
      </form>
    </div>
  );
}
