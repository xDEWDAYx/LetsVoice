import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pin,
  Play,
  Square,
  AlignLeft,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { NoteItem, WorkspaceController } from '../WorkspaceController';
import KnowledgeOutputPanel from './KnowledgeOutputPanel';
import WorkspaceAudioPlayer from './WorkspaceAudioPlayer';
import MarkdownText, {
  renderInline,
} from '../../../components/Markdown/MarkdownText';
import { parseInline } from '../../../components/Markdown/markdownAst';
import TrashCanButton from '../../../components/TrashCanButton';
import NoteInsightsPanel from './NoteInsightsPanel';

type Props = {
  workspaceId: number;
  note: NoteItem;
  isSelected?: boolean;
  onToggleSelection?: (noteId: number) => void;
  onDelete: (noteId: number) => void;
};

/** 协调笔记音视频、转录、派生内容，对应展示保留为独立组件。 */
export default function WorkspaceNoteCard({
  workspaceId,
  note,
  isSelected = false,
  onToggleSelection,
  onDelete,
}: Props) {
  const { t, i18n } = useTranslation();
  // 录音默认不占地方：点了标题行的「播放」才展开播放条。
  const [showAudio, setShowAudio] = useState(false);
  const hasAudio = Boolean(note.audio_relative_path);

  const subNotes = note.subnotes.filter((s) => s.content_type === 'note');
  const chatNotes = note.subnotes.filter((s) => s.content_type === 'chat');

  const handleExport = (format: 'word' | 'pdf') => {
    window.electron.export
      .note({
        workspaceId,
        noteId: note.id,
        format,
      })
      .catch(console.error);
  };

  return (
    <article
      className={`workspace-detail-note ${isSelected ? 'selected' : ''}`}
      id={`workspace-note-${note.id}`}
    >
      <header className="workspace-note-head">
        {onToggleSelection && (
          <span className="workspace-note-pick">
            <input
              aria-label={t('workspace.note.select')}
              checked={isSelected}
              onChange={() => onToggleSelection(note.id)}
              type="checkbox"
            />
          </span>
        )}
        <div className="workspace-note-identity">
          {note.is_pinned ? (
            <span
              className="workspace-note-kind"
              title={t('workspace.note.pin')}
            >
              <Pin size={14} style={{ marginRight: 4 }} />{' '}
              {t('workspace.detail.pinnedLabel')}
            </span>
          ) : null}
          <h2>
            {note.name
              ? renderInline(
                  parseInline(note.name),
                  `workspace-note-${note.id}`,
                )
              : t('workspace.note.unnamed')}
          </h2>
        </div>
        <div className="workspace-note-tools">
          {hasAudio && (
            <button
              className={`ws-btn ws-btn-quiet ${showAudio ? 'is-active' : ''}`}
              onClick={() => setShowAudio((open) => !open)}
              title={t('workspace.note.playTitle')}
              type="button"
            >
              {showAudio ? <Square size={13} /> : <Play size={13} />}
              {showAudio ? t('workspace.note.stop') : t('workspace.note.play')}
            </button>
          )}
          <button
            className="ws-btn ws-btn-quiet"
            onClick={() => handleExport('word')}
            title={t('workspace.note.exportWordTitle')}
            type="button"
          >
            {t('workspace.note.exportWord')}
          </button>
          <button
            className="ws-btn ws-btn-quiet"
            onClick={() => handleExport('pdf')}
            title={t('workspace.note.exportPdfTitle')}
            type="button"
          >
            {t('workspace.note.exportPdf')}
          </button>
          <time
            dateTime={note.updated_at}
            title={t('workspace.detail.updated')}
          >
            {WorkspaceController.formatDate(
              note.updated_at,
              'short',
              i18n.language,
            )}
          </time>
          {/* 删除按钮以前独占一行页脚，其实和上面这些一样是笔记级操作，
              放在日期后面即可。 */}
          <TrashCanButton
            label={t('trash.action.moveNote')}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(note.id);
            }}
          />
        </div>
      </header>

      {showAudio && (
        <div className="workspace-note-audio">
          <WorkspaceAudioPlayer workspaceId={workspaceId} note={note} />
        </div>
      )}

      <div className="workspace-content-grid">
        <section className="workspace-transcript-section">
          <h3>
            <AlignLeft size={16} style={{ marginRight: 6 }} />
            {t('workspace.note.transcription')}
          </h3>
          <p className="workspace-transcript">
            {note.transcript || t('workspace.note.noTranscription')}
          </p>
        </section>

        {/* 一条 sub-note 都没有时整块不渲染：以前空着也照样占一格，
            右边那半栏空荡荡，「AI 输出」被挤到中间去了。 */}
        {(subNotes.length > 0 || chatNotes.length > 0) && (
          <section className="workspace-knowledge-section">
            {subNotes.length > 0 && (
              <div className="workspace-subnotes-list">
                <h3>
                  <Sparkles size={16} style={{ marginRight: 6 }} />
                  {t('workspace.note.subNotes')}
                </h3>
                {subNotes.map((s) => (
                  <div key={s.id} className="workspace-subnote-item">
                    <span className="workspace-subnote-badge">Sub-note</span>
                    <MarkdownText
                      className="workspace-subnote-content"
                      content={s.content}
                    />
                  </div>
                ))}
              </div>
            )}

            {chatNotes.length > 0 && (
              <div className="workspace-subnotes-list">
                <h3>
                  <MessageSquare size={16} style={{ marginRight: 6 }} />
                  {t('workspace.note.aiChat')}
                </h3>
                {chatNotes.map((s) => (
                  <div key={s.id} className="workspace-subnote-item is-chat">
                    <MarkdownText
                      className="workspace-subnote-content"
                      content={s.content}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <KnowledgeOutputPanel note={note} />

        <NoteInsightsPanel
          noteId={note.id}
          hasTranscript={Boolean(note.transcript.trim())}
        />

        <section className="workspace-conversation-section">
          <h3>💬 {t('workspace.note.aiChat', 'AI 对话')}</h3>
          {note.conversations.length === 0 ? (
            <span className="workspace-content-empty">
              {t('workspace.knowledge.empty', '暂无')}
            </span>
          ) : (
            <div className="workspace-content-stack">
              {note.conversations.map((conversation) => (
                <details
                  className="workspace-conversation"
                  key={conversation.id}
                >
                  <summary>
                    {conversation.name}
                    <span className="workspace-conversation-count">
                      💬 {conversation.messages.length}
                    </span>
                  </summary>
                  <div>
                    {conversation.messages.map((message) => (
                      <div
                        className="workspace-conversation-message"
                        key={message.id}
                      >
                        <strong>{message.role}</strong>
                        {/* 存档对话里同样只有 assistant 那侧是模型产出。 */}
                        {message.role === 'assistant' ? (
                          <MarkdownText content={message.content} />
                        ) : (
                          <p>{message.content}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
