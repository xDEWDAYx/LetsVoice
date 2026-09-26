import { FormEvent, KeyboardEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AskAIMessage, AskAINote, AskAIScope } from '../AskAITypes';
import TTSPlayButton from '../../../tts/TTSPlayButton';
import CopyButton from '../../../components/CopyButton';
import MarkdownText from '../../../components/Markdown/MarkdownText';

type AskAIChatPanelProps = {
  messages: AskAIMessage[];
  sources: AskAINote[];
  selectedNote: AskAINote | null;
  allNotes: AskAINote[];
  scope: AskAIScope;
  status: string;
  isSending: boolean;
  onScopeChange: (scope: AskAIScope) => void;
  onAsk: (question: string) => Promise<boolean>;
};

export default function AskAIChatPanel({
  messages,
  sources,
  selectedNote,
  allNotes,
  scope,
  status,
  isSending,
  onScopeChange,
  onAsk,
}: AskAIChatPanelProps) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const workspaceNoteCount = useMemo(
    () =>
      allNotes.filter((note) => note.workspaceId === selectedNote?.workspaceId)
        .length,
    [allNotes, selectedNote?.workspaceId],
  );

  async function submitQuestion() {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isSending) return;
    if (await onAsk(cleanQuestion)) setQuestion('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitQuestion();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuestion();
    }
  }

  return (
    <section className="ask-ai-chat">
      <header className="ask-ai-chat-header">
        <div>
          <span>{t('askAI.chat.localQA')}</span>
          <h2>
            {scope === 'note'
              ? t('askAI.chat.scopeNote')
              : t('askAI.chat.scopeWorkspace')}
          </h2>
          <p>
            {scope === 'note'
              ? selectedNote?.name || t('askAI.chat.noNoteSelected')
              : `${workspaceNoteCount}${t('askAI.chat.workspaceNoteCountSuffix')}`}
          </p>
        </div>
        <div
          className="ask-ai-scope"
          role="group"
          aria-label={t('askAI.chat.scopeAria')}
        >
          <button
            type="button"
            className={scope === 'note' ? 'active' : ''}
            onClick={() => onScopeChange('note')}
          >
            {t('askAI.chat.scopeBtnNote')}
          </button>
          <button
            type="button"
            className={scope === 'workspace' ? 'active' : ''}
            onClick={() => onScopeChange('workspace')}
          >
            {t('askAI.chat.scopeBtnWorkspace')}
          </button>
        </div>
      </header>

      {sources.length > 0 && (
        <div className="ask-ai-sources">
          <span>{t('askAI.chat.sources')}</span>
          {sources.map((source) => (
            <span key={source.id} title={source.transcriptPreview}>
              {source.name}
            </span>
          ))}
        </div>
      )}

      <div className="ask-ai-messages">
        {messages.length === 0 ? (
          <div className="ask-ai-empty">
            <strong>{t('askAI.chat.noMessagesTitle')}</strong>
            <span>{t('askAI.chat.noMessagesDesc')}</span>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={message.role}>
              <span>
                {message.role === 'assistant'
                  ? t('askAI.chat.roleAI')
                  : t('askAI.chat.roleYou')}
              </span>
              {/* 只有模型回答走富文本；用户自己敲的问题保持原样。
                  朗读和复制仍拿原始文本：朗读有自己的去标记逻辑，
                  复制则应该给出 Markdown 源码。 */}
              {message.role === 'assistant' ? (
                <MarkdownText content={message.content} />
              ) : (
                <p>{message.content}</p>
              )}
              {message.role === 'assistant' && (
                <div className="message-actions">
                  <TTSPlayButton text={message.content} />
                  <CopyButton text={message.content} />
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <form className="ask-ai-composer" onSubmit={handleSubmit}>
        <textarea
          value={question}
          placeholder={t('askAI.chat.inputPlaceholder')}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!selectedNote || isSending}
        />
        <button
          type="submit"
          disabled={!selectedNote || !question.trim() || isSending}
        >
          {isSending ? t('askAI.chat.sending') : t('askAI.chat.askBtn')}
        </button>
      </form>
      <div className="ask-ai-status" role="status">
        {status}
      </div>
    </section>
  );
}
