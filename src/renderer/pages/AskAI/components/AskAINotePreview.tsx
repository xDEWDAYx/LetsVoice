import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  NoteKnowledgeBundle,
  StructuredNote,
} from '@shared/types/KnowledgeGenerationTypes';
import { AskAINote, formatAskAIDate } from '../AskAITypes';
import MarkdownText, {
  renderInline,
} from '../../../components/Markdown/MarkdownText';
import { parseInline } from '../../../components/Markdown/markdownAst';

type AskAINotePreviewProps = {
  note: AskAINote | null;
};

function TextList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function StructuredNoteBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ask-ai-structured-note__block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function StructuredNotePreview({ value }: { value: StructuredNote }) {
  const { t } = useTranslation();
  const reminders = value.calendarIntents.filter(
    (item) => item.kind === 'reminder',
  );
  const calendarIntents = value.calendarIntents.filter(
    (item) => item.kind === 'calendar',
  );

  return (
    <div className="ask-ai-structured-note">
      <StructuredNoteBlock title={t('askAI.preview.summaryTitle')}>
        <MarkdownText content={value.summary} />
      </StructuredNoteBlock>

      {value.keyPoints.length > 0 && (
        <StructuredNoteBlock title={t('askAI.preview.keyPointsTitle')}>
          <TextList items={value.keyPoints} />
        </StructuredNoteBlock>
      )}

      {value.tasks.length > 0 && (
        <StructuredNoteBlock title={t('askAI.preview.tasksTitle')}>
          <ul className="ask-ai-structured-note__tasks">
            {value.tasks.map((task) => (
              <li key={task.id}>
                <strong>{task.title}</strong>
                {task.description && <span>{task.description}</span>}
                {task.actionItems.length > 0 && (
                  <TextList
                    items={task.actionItems.map((item) => item.title)}
                  />
                )}
              </li>
            ))}
          </ul>
        </StructuredNoteBlock>
      )}

      {value.unassignedActionItems.length > 0 && (
        <StructuredNoteBlock title={t('askAI.preview.actionItemsTitle')}>
          <TextList
            items={value.unassignedActionItems.map((item) => item.title)}
          />
        </StructuredNoteBlock>
      )}

      {reminders.length > 0 && (
        <StructuredNoteBlock title={t('askAI.preview.remindersTitle')}>
          <TextList items={reminders.map((item) => item.title)} />
        </StructuredNoteBlock>
      )}

      {calendarIntents.length > 0 && (
        <StructuredNoteBlock title={t('askAI.preview.calendarTitle')}>
          <TextList items={calendarIntents.map((item) => item.title)} />
        </StructuredNoteBlock>
      )}
    </div>
  );
}

export default function AskAINotePreview({ note }: AskAINotePreviewProps) {
  const { t } = useTranslation();
  const [structuredNote, setStructuredNote] = useState<StructuredNote | null>(
    null,
  );
  const [loadingStructuredNote, setLoadingStructuredNote] = useState(false);
  const noteId = note?.id ?? null;

  // 双击打开详情时读取保存好的 Structured Note，不再依赖旧 subnotes 摘要。
  useEffect(() => {
    if (noteId === null) {
      setStructuredNote(null);
      return undefined;
    }

    let cancelled = false;
    setStructuredNote(null);
    setLoadingStructuredNote(true);
    window.electron.knowledge
      .get(noteId)
      .then((bundle) => {
        if (cancelled) return null;
        setStructuredNote(
          (bundle as NoteKnowledgeBundle | null | undefined)?.structuredNote ??
            null,
        );
        setLoadingStructuredNote(false);
        return null;
      })
      .catch(() => {
        if (cancelled) return;
        setStructuredNote(null);
        setLoadingStructuredNote(false);
      });

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  if (!note) {
    return (
      <section className="ask-ai-note-preview ask-ai-empty">
        <strong>{t('askAI.preview.emptyTitle')}</strong>
        <span>{t('askAI.preview.emptyDesc')}</span>
      </section>
    );
  }

  const transcript = note.transcript || note.transcriptPreview;

  return (
    <section className="ask-ai-note-preview">
      <header>
        <div>
          <span>{t('askAI.chat.scopeBtnNote')}</span>
          <h1>{renderInline(parseInline(note.name), 'note-title')}</h1>
        </div>
        <time>{formatAskAIDate(note.updatedAt)}</time>
      </header>

      <section className="ask-ai-note-section">
        {structuredNote ? (
          <StructuredNotePreview value={structuredNote} />
        ) : (
          <p className="ask-ai-note-empty">
            {loadingStructuredNote
              ? t('askAI.preview.loadingStructuredNote')
              : t('askAI.preview.noStructuredNote')}
          </p>
        )}
      </section>

      <section className="ask-ai-note-section">
        <h2>{t('askAI.preview.transcriptTitle')}</h2>
        {transcript ? (
          <p>{transcript}</p>
        ) : (
          <p className="ask-ai-note-empty">{t('askAI.preview.noTranscript')}</p>
        )}
      </section>
    </section>
  );
}
