import { Message } from 'ollama';
import { AIMessage } from '@shared/entities/AIMessage';
import { Note } from '@shared/entities/Note';
import { clipText } from './AskAISerializer';
import { AskAIScope } from './AskAITypes';

const NOTE_TRANSCRIPT_LIMIT = 6000;
const WORKSPACE_NOTE_LIMIT = 1200;
const MAX_CHAT_HISTORY_MESSAGES = 10;

function formatNote(note: Note, index: number, limit: number): string {
  return [
    `[${index + 1}] ${note.getName() || `Note ${note.getId()}`}`,
    `Updated: ${note.getUpdatedAt().toISOString()}`,
    'Transcript:',
    clipText(note.getTranscript(), limit) || '(empty)',
  ].join('\n');
}

export function buildAskAIMessages(
  scope: AskAIScope,
  notes: Note[],
  history: AIMessage[],
  question: string,
): Message[] {
  const noteLimit =
    scope === 'note' ? NOTE_TRANSCRIPT_LIMIT : WORKSPACE_NOTE_LIMIT;
  const evidence = notes.length
    ? notes
        .map((note, index) => formatNote(note, index, noteLimit))
        .join('\n\n---\n\n')
    : '(no saved notes selected)';

  const systemMessage = `You are SpeakSpace Local Ask AI, a local-first assistant.

Answer using only the selected local note transcripts below as factual evidence. Do not use external knowledge. If the notes do not contain enough information, say that directly in the user's language.

Scope: ${scope}

Selected notes:
${evidence}`;

  const historyMessages = history
    .filter((message) => ['user', 'assistant'].includes(message.getRole()))
    .slice(-MAX_CHAT_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.getRole(),
      content: message.getContent(),
    }));

  return [
    { role: 'system', content: systemMessage },
    ...historyMessages,
    { role: 'user', content: question },
  ];
}

export function createEmptyContextAnswer(
  scope: AskAIScope,
  notes: Note[],
  question: string,
): string | null {
  if (notes.length > 0) return null;

  const hasChinese = /[\u3400-\u9fff]/u.test(question);
  if (scope === 'workspace') {
    return hasChinese
      ? '当前工作区还没有可用于回答的已保存笔记。'
      : 'There are no saved notes in this workspace yet.';
  }
  return hasChinese
    ? '请先选择一条当前笔记，再向 Ask AI 提问。'
    : 'Select a current note before asking Ask AI.';
}
