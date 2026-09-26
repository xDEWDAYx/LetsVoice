import {
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentStep } from '@shared/types/AgentTypes';
import { AskAIMessage, AskAINote } from '../../AskAI/AskAITypes';
import {
  hasNoteDragPayload,
  readNoteDragPayload,
} from '../../AskAI/AskAIDragPayload';
import i18n from '../../../../i18n';
import SoundWave from '../../../components/SoundWave';
import { StudioWorkspace } from '../StudioTypes';
import { StudioAgentState } from '../useStudioAgent';
import TTSPlayButton from '../../../tts/TTSPlayButton';
import CopyButton from '../../../components/CopyButton';
import MarkdownText from '../../../components/Markdown/MarkdownText';
import { useAppSettings } from '../../../settings/AppSettingsProvider';
import CloseIcon from '../../../components/CloseIcon';

type RecordingUiState = {
  active: boolean;
  /** 是否禁止再开一次采集（录音 / 上传）。转写、语言检测在跑时为 true。 */
  busy: boolean;
  /**
   * 是否禁止停止当前录音。
   *
   * 必须和 busy 分开：录音过程中实时分段一直在转写，livePendingCount 常驻
   * 大于 0，用它挡停止键会让用户停不下来。停止只受会话层状态限制。
   */
  stopBusy: boolean;
  elapsedMs: number;
  error: string | null;
  uploadPending: boolean;
  uploadPercent: number;
  fileProcessing: boolean;
};

type StudioChatPanelProps = {
  messages: AskAIMessage[];
  sources: AskAINote[];
  selectedNote: AskAINote | null;
  allNotes: AskAINote[];
  status: string;
  isSending: boolean;
  recording: RecordingUiState;
  workspaces: StudioWorkspace[];
  conversationName: string;
  linkedNotes: AskAINote[];
  linkedWorkspaceIds: number[];
  onAddLinkedNote: (note: AskAINote) => void;
  onRemoveLinkedNote: (noteId: number) => void;
  onLinkWorkspace: (workspaceId: number) => void;
  onUnlinkWorkspace: (workspaceId: number) => void;
  agentMode: boolean;
  agent: StudioAgentState;
  onToggleAgentMode: () => void;
  onCancelAgent: () => void;
  onAsk: (question: string) => Promise<boolean>;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onUploadAudio: () => void;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function MicIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg {...iconProps}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    </svg>
  );
}

function WorkspaceIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
    </svg>
  );
}

const AGENT_TOOL_NAMES: Record<string, string> = {
  search_notes: 'studio.agent.tool.search',
  read_note: 'studio.agent.tool.read',
  extract_todos: 'studio.agent.tool.todos',
};

const MATCH_LABELS: Record<string, string> = {
  keyword: 'studio.agent.match.keyword',
  semantic: 'studio.agent.match.semantic',
  'keyword+semantic': 'studio.agent.match.both',
  linked: 'studio.agent.match.linked',
};

type AgentStepView = { title: string; details: string[] };

type SearchHit = {
  name?: string;
  match?: string;
  similarity?: number;
};

/** 解析 search_notes 返回的 JSON，列出命中的笔记与命中方式。 */
function describeSearchResult(raw: string): string[] {
  const parsed = JSON.parse(raw) as {
    match?: string;
    notes?: SearchHit[];
    hint?: string;
    semanticUnavailable?: string;
  };
  const hits = parsed.notes ?? [];

  if (hits.length === 0) {
    return [parsed.hint || i18n.t('studio.agent.noNotes')];
  }

  const lines = hits.map((hit) => {
    const viaKey = MATCH_LABELS[hit.match ?? ''];
    const via = viaKey ? i18n.t(viaKey) : (hit.match ?? '');
    const score =
      typeof hit.similarity === 'number' ? ` ${hit.similarity.toFixed(2)}` : '';
    return `${hit.name ?? i18n.t('studio.agent.untitledNote')}${via ? `（${via}${score}）` : ''}`;
  });

  if (parsed.semanticUnavailable) {
    lines.push(i18n.t('studio.agent.semanticUnavailable'));
  }
  return lines;
}

/** 把 Agent 的公开步骤转成可读的标题 + 明细，不暴露模型内部推理。 */
function describeAgentStep(step: AgentStep): AgentStepView {
  if (step.type === 'final') {
    return {
      title: step.truncated
        ? i18n.t('studio.agent.step.finalLimit')
        : i18n.t('studio.agent.step.final'),
      details: [],
    };
  }

  const toolKey = AGENT_TOOL_NAMES[step.tool];
  const tool = toolKey ? i18n.t(toolKey) : step.tool;

  if (step.type === 'tool_call') {
    const query = String(step.args?.query ?? '').trim();
    const noteId = step.args?.note_id ?? step.args?.noteId;
    if (step.tool === 'search_notes') {
      return {
        title: query
          ? `${i18n.t('studio.agent.step.searchPrefix')}${query}${i18n.t('studio.agent.step.searchSuffix')}`
          : i18n.t('studio.agent.step.listRecent'),
        details: [],
      };
    }
    if (step.tool === 'read_note' && noteId !== undefined) {
      return {
        title: `${i18n.t('studio.agent.step.readPrefix')}${noteId}`,
        details: [],
      };
    }
    if (step.tool === 'extract_todos' && noteId !== undefined) {
      return {
        title: `${i18n.t('studio.agent.step.todosPrefix')}${noteId}`,
        details: [],
      };
    }
    return { title: tool, details: [] };
  }

  if (!step.ok) {
    return {
      title: `${tool}${i18n.t('studio.agent.step.failedSuffix')}`,
      details: [step.result.slice(0, 200)],
    };
  }

  try {
    if (step.tool === 'search_notes') {
      const details = describeSearchResult(step.result);
      return {
        title: `${i18n.t('studio.agent.step.foundPrefix')}${details.length}${i18n.t('studio.agent.step.foundSuffix')}`,
        details,
      };
    }
    if (step.tool === 'read_note') {
      const parsed = JSON.parse(step.result) as {
        name?: string;
        transcript?: string;
        transcriptPreview?: string;
      };
      const body = parsed.transcript ?? parsed.transcriptPreview ?? '';
      return {
        title: `${i18n.t('studio.agent.step.readDonePrefix')}${parsed.name ?? i18n.t('studio.agent.untitledNote')}${i18n.t('studio.agent.step.searchSuffix')}`,
        details: body ? [`${body.slice(0, 120)}…`] : [],
      };
    }
    if (step.tool === 'extract_todos') {
      const parsed = JSON.parse(step.result) as {
        todos?: { title?: string; dueDate?: string }[];
        hint?: string;
      };
      const items = parsed.todos ?? [];
      const details = items.map(
        (todo) =>
          `${todo.title ?? ''}${todo.dueDate ? `（${todo.dueDate}）` : ''}`,
      );
      if (parsed.hint) details.push(i18n.t('studio.agent.todosFailed'));
      return {
        title: `${i18n.t('studio.agent.step.todosDonePrefix')}${items.length}${i18n.t('studio.agent.step.todosDoneSuffix')}`,
        details:
          details.length > 0 ? details : [i18n.t('studio.agent.noTodos')],
      };
    }
  } catch {
    // 结果不是预期的 JSON 时退回到概要描述。
  }

  return {
    title: `${i18n.t('studio.agent.step.donePrefix')}${tool}`,
    details: [],
  };
}

/** # 菜单里的一项：整个工作区，或某一条笔记。 */
type MentionItem = {
  kind: 'workspace' | 'note';
  id: number;
  name: string;
  hint?: string;
  note?: AskAINote;
};

/** 单行高度，与输入框内图标按钮的高度保持一致，保证同一水平线。 */
const COMPOSER_MIN_HEIGHT = 36;
const COMPOSER_MAX_HEIGHT = 160;
const MENTION_LIMIT = 8;

/** 光标前若存在未闭合的 #关键词，返回它的起点与关键词，用于弹出关联笔记菜单。 */
function detectMention(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const match = /#([^\s#]*)$/u.exec(value.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[0].length, query: match[1] };
}

export default function StudioChatPanel({
  messages,
  sources,
  selectedNote,
  allNotes,
  status,
  isSending,
  recording,
  workspaces,
  conversationName,
  linkedNotes,
  linkedWorkspaceIds,
  onAddLinkedNote,
  onRemoveLinkedNote,
  onLinkWorkspace,
  onUnlinkWorkspace,
  agentMode,
  agent,
  onToggleAgentMode,
  onCancelAgent,
  onAsk,
  onStartRecording,
  onStopRecording,
  onUploadAudio,
}: StudioChatPanelProps) {
  const { t } = useTranslation();
  // 自动朗读开关来自设置页的「智能助理」分类
  const { settings } = useAppSettings();
  const { agentAutoSpeak } = settings;
  const [question, setQuestion] = useState('');
  const [mention, setMention] = useState<{
    start: number;
    query: string;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动增高：内容变多时撑大，达到上限后固定高度并出现滚动条。
  // 空内容时不去测量 scrollHeight——空状态下测得的值会偏大，把输入框撑成两行，
  // 导致占位文字和左侧图标不在同一水平线上。直接用单行高度即可。
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!question) {
      el.style.height = `${COMPOSER_MIN_HEIGHT}px`;
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.max(
      Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT),
      COMPOSER_MIN_HEIGHT,
    )}px`;
  }, [question]);

  const linkedWorkspaces = useMemo(
    () => workspaces.filter((item) => linkedWorkspaceIds.includes(item.id)),
    [linkedWorkspaceIds, workspaces],
  );

  // # 菜单候选：工作区（= 整个工作区的全部笔记）在前，具体笔记在后。
  const mentionCandidates = useMemo((): MentionItem[] => {
    if (!mention) return [];
    const keyword = mention.query.trim().toLowerCase();
    const linkedIds = new Set(linkedNotes.map((note) => note.id));

    const workspaceItems: MentionItem[] = workspaces
      .filter((item) => !linkedWorkspaceIds.includes(item.id))
      .filter((item) => !keyword || item.name.toLowerCase().includes(keyword))
      .map((item) => ({
        kind: 'workspace',
        id: item.id,
        name: item.name,
        hint: `${allNotes.filter((n) => n.workspaceId === item.id).length} ${t('studio.chat.noteCount')}`,
      }));

    const noteItems: MentionItem[] = allNotes
      .filter((note) => !linkedIds.has(note.id))
      .filter((note) => {
        if (!keyword) return true;
        return (
          note.name.toLowerCase().includes(keyword) ||
          (note.transcriptPreview ?? '').toLowerCase().includes(keyword)
        );
      })
      .map((note) => ({ kind: 'note', id: note.id, name: note.name, note }));

    return [...workspaceItems, ...noteItems].slice(0, MENTION_LIMIT);
  }, [allNotes, linkedNotes, linkedWorkspaceIds, mention, t, workspaces]);

  const mentionOpen = mention !== null && mentionCandidates.length > 0;

  function closeMention() {
    setMention(null);
    setMentionIndex(0);
  }

  function syncMention(value: string, caret: number) {
    const next = detectMention(value, caret);
    setMention(next);
    setMentionIndex(0);
  }

  /** 选中候选项：把输入框里的 #关键词删掉，改为挂成一个关联标签。 */
  function pickMention(item: MentionItem) {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    const next = question.slice(0, mention.start) + question.slice(end);
    setQuestion(next);
    closeMention();
    if (item.kind === 'workspace') onLinkWorkspace(item.id);
    else if (item.note) onAddLinkedNote(item.note);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(mention.start, mention.start);
    });
  }

  /** 拖拽只接受笔记库拖过来的载荷，整块对话面板都是落点。 */
  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasNoteDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    // eslint-disable-next-line no-param-reassign
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    // 移动到面板内部的子元素上时不算离开。
    if (event.currentTarget.contains(event.relatedTarget as Node | null))
      return;
    setDragOver(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    const payload = readNoteDragPayload(event.dataTransfer);
    if (!payload) return;
    event.preventDefault();
    setDragOver(false);
    if (payload.kind === 'workspace') {
      onLinkWorkspace(payload.id);
      return;
    }
    const note = allNotes.find((item) => item.id === payload.id);
    if (note) onAddLinkedNote(note);
  }

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
    // # 菜单打开时，方向键/回车先由菜单消费，避免误发送。
    if (mentionOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex(
          (prev) =>
            (prev - 1 + mentionCandidates.length) % mentionCandidates.length,
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pickMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMention();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuestion();
    }
  }

  const recordingBusy = recording.busy;
  const recordingStopBusy = recording.stopBusy;
  // 挂了笔记或整个工作区，才有可提问的上下文；
  // 智能体模式自己在全部笔记里检索，不需要先挂任何东西。
  const hasContext =
    agentMode ||
    selectedNote !== null ||
    linkedNotes.length > 0 ||
    linkedWorkspaceIds.length > 0;

  return (
    <section
      className={`studio-chat${dragOver ? ' is-drag-over' : ''}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="studio-drop-hint" aria-hidden="true">
          {t('studio.chat.dropHint')}
        </div>
      )}

      <header className="studio-chat-header">
        <div className="studio-chat-heading">
          <h2>{conversationName || t('studio.chat.newChat')}</h2>
        </div>
      </header>

      {sources.length > 0 && (
        <div className="ask-ai-sources">
          <span>{t('studio.chat.citations')}</span>
          {sources.map((source) => (
            <span key={source.id} title={source.transcriptPreview}>
              {source.name}
            </span>
          ))}
        </div>
      )}

      <div className="ask-ai-messages studio-chat-messages">
        {messages.length === 0 && agent.turns.length === 0 && !agent.running ? (
          <div className="ask-ai-empty">
            <span>{t('studio.chat.emptyState')}</span>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={message.role}>
              <span>
                {message.role === 'assistant'
                  ? t('studio.chat.roleAI')
                  : t('studio.chat.roleUser')}
              </span>
              {/* 只有模型回答走富文本；用户自己敲的问题保持原样。 */}
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

        {/* 智能体模式的问答：步骤可折叠，最终答案与普通回答一致 */}
        {agent.turns.map((turn) => (
          <div className="studio-agent-turn" key={turn.id}>
            <article className="user">
              <span>{t('studio.chat.roleUser')}</span>
              <p>{turn.question}</p>
            </article>
            <article className="assistant">
              <span>{t('studio.chat.roleAssistant')}</span>
              {turn.steps.length > 0 && (
                <details className="studio-agent-steps">
                  <summary>
                    {turn.steps.length}
                    {t('studio.chat.stepsSuffix')}
                  </summary>
                  <ol>
                    {turn.steps.map((step, index) => {
                      const view = describeAgentStep(step);
                      return (
                        // eslint-disable-next-line react/no-array-index-key
                        <li key={`${turn.id}-${index}`}>
                          {view.title}
                          {view.details.length > 0 && (
                            <ul>
                              {view.details.map((detail) => (
                                <li key={detail}>{detail}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </details>
              )}
              <MarkdownText content={turn.answer} />
              <div className="message-actions">
                {/* 只有刚答完的这一轮自动朗读，历史回答重渲染时不会再响 */}
                <TTSPlayButton
                  text={turn.answer}
                  autoPlay={
                    agentAutoSpeak && turn.id === agent.turns.at(-1)?.id
                  }
                />
                <CopyButton text={turn.answer} />
              </div>
            </article>
          </div>
        ))}

        {agent.running && (
          <div className="studio-agent-live" aria-live="polite">
            <span className="studio-agent-live__dot" aria-hidden="true" />
            <div>
              <strong>{agent.status || t('studio.chat.working')}</strong>
              <ol>
                {agent.liveSteps.map((step, index) => {
                  const view = describeAgentStep(step);
                  return (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={`live-${index}`}>
                      {view.title}
                      {view.details.length > 0 && (
                        <ul>
                          {view.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
            <button type="button" onClick={onCancelAgent}>
              {t('studio.chat.cancel')}
            </button>
          </div>
        )}

        {agent.error && (
          <p className="studio-record-error" role="alert">
            {agent.error}
          </p>
        )}
      </div>

      {recording.error && (
        <p className="studio-record-error" role="alert">
          {recording.error}
        </p>
      )}

      <form className="studio-composer" onSubmit={handleSubmit}>
        {(recording.uploadPending || recording.fileProcessing) && (
          <div className="studio-audio-task" role="status" aria-live="polite">
            <div>
              {recording.uploadPending ? (
                <UploadIcon />
              ) : (
                <span className="studio-audio-task__spinner" aria-hidden />
              )}
              <span>
                {recording.uploadPending
                  ? t('studio.chat.uploadingAudio')
                  : t('studio.chat.processingAudio')}
              </span>
              {recording.uploadPending && (
                <strong>{recording.uploadPercent}%</strong>
              )}
            </div>
            {recording.uploadPending && (
              <progress max={100} value={recording.uploadPercent} />
            )}
          </div>
        )}

        {mentionOpen && (
          <div
            className="studio-mention"
            role="listbox"
            aria-label={t('studio.chat.mentionAria')}
          >
            {mentionCandidates.map((item, index) => (
              <button
                type="button"
                key={`${item.kind}-${item.id}`}
                role="option"
                aria-selected={index === mentionIndex}
                className={index === mentionIndex ? 'is-active' : ''}
                onMouseEnter={() => setMentionIndex(index)}
                // 用 mousedown 抢在 textarea 失焦之前处理，避免菜单先被关掉。
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickMention(item);
                }}
              >
                {item.kind === 'workspace' ? <WorkspaceIcon /> : <NoteIcon />}
                <span className="studio-mention__name">{item.name}</span>
                {item.hint && (
                  <span className="studio-mention__hint">{item.hint}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {(linkedNotes.length > 0 || linkedWorkspaces.length > 0) && (
          <div className="studio-chips">
            {linkedWorkspaces.map((workspace) => (
              <span
                className="studio-chip studio-chip--workspace"
                key={`ws-${workspace.id}`}
                title={workspace.name}
              >
                <WorkspaceIcon />
                <span className="studio-chip__name">
                  {workspace.name} · {t('studio.chat.all')}
                </span>
                <button
                  type="button"
                  className="studio-chip__remove"
                  onClick={() => onUnlinkWorkspace(workspace.id)}
                  aria-label={`${t('studio.chat.unlinkPrefix')}${workspace.name}`}
                >
                  <CloseIcon size={10} />
                </button>
              </span>
            ))}
            {linkedNotes.map((note) => (
              <span className="studio-chip" key={note.id} title={note.name}>
                <NoteIcon />
                <span className="studio-chip__name">{note.name}</span>
                <button
                  type="button"
                  className="studio-chip__remove"
                  onClick={() => onRemoveLinkedNote(note.id)}
                  aria-label={`${t('studio.chat.unlinkPrefix')}${note.name}`}
                >
                  <CloseIcon size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="studio-composer-row">
          {recording.active ? (
            <button
              type="button"
              className="studio-composer-btn studio-record-button is-recording"
              onClick={onStopRecording}
              disabled={recordingStopBusy}
              aria-label={t('studio.chat.stopRecording')}
              title={t('studio.chat.stopRecording')}
            >
              <StopIcon />
              {/* 起伏的声波是「确实在收音」最直观的反馈；
                只有计时数字在跳的话，看不出麦克风到底通没通。 */}
              <SoundWave active bars={5} size={14} />
              <span className="studio-record-time">
                {formatElapsed(recording.elapsedMs)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="studio-composer-btn studio-record-button"
              onClick={onStartRecording}
              disabled={recordingBusy}
              aria-label={t('studio.chat.startRecording')}
              title={t('studio.chat.startRecording')}
            >
              <MicIcon />
            </button>
          )}
          <button
            type="button"
            className="studio-composer-btn studio-upload-button"
            onClick={onUploadAudio}
            disabled={recording.active || recordingBusy}
            aria-label={t('studio.chat.uploadAudio')}
            title={t('studio.chat.uploadAudio')}
          >
            <UploadIcon />
          </button>
          <button
            type="button"
            className={`studio-composer-btn studio-agent-toggle${
              agentMode ? ' is-active' : ''
            }`}
            onClick={onToggleAgentMode}
            aria-pressed={agentMode}
            aria-label={t('studio.chat.agentToggle')}
            title={
              agentMode
                ? t('studio.chat.agentActive')
                : t('studio.chat.agentInactive')
            }
          >
            <AgentIcon />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            className="studio-composer-input"
            value={question}
            placeholder={
              // eslint-disable-next-line no-nested-ternary
              recording.active
                ? t('studio.chat.placeholder.recording')
                : agentMode
                  ? t('studio.chat.placeholder.agent')
                  : t('studio.chat.placeholder.normal')
            }
            onChange={(event) => {
              setQuestion(event.target.value);
              syncMention(event.target.value, event.target.selectionStart ?? 0);
            }}
            onKeyDown={handleKeyDown}
            onBlur={closeMention}
            disabled={!hasContext || isSending || recording.active}
          />
          <button
            type="submit"
            className="studio-composer-btn studio-send-button"
            aria-label={t('studio.chat.send')}
            title={t('studio.chat.send')}
            disabled={
              !hasContext || !question.trim() || isSending || recording.active
            }
          >
            {isSending ? (
              <span className="studio-send-spinner" aria-hidden="true" />
            ) : (
              <SendIcon />
            )}
          </button>
        </div>
      </form>
      <div className="ask-ai-status" role="status">
        {recording.active ? t('studio.chat.status.recording') : status}
      </div>
    </section>
  );
}
