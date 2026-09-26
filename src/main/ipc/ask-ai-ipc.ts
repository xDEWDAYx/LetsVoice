import { ipcMain } from 'electron';
import AskAIService from '../ask-ai/AskAIService';
import {
  AskAIRequest,
  AskAIScope,
  CreateAskAINoteRequest,
  RecordAskAITurnRequest,
} from '../ask-ai/AskAITypes';

const askAIService = new AskAIService();

function normalizeId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeScope(value: unknown): AskAIScope {
  if (value === 'multi-note') return 'multi-note';
  return value === 'workspace' ? 'workspace' : 'note';
}

ipcMain.handle('AskAI:listNotes', (_event, workspaceId: unknown) =>
  askAIService.listNotes(normalizeId(workspaceId)),
);

ipcMain.handle('AskAI:getNoteDetail', (_event, noteId: unknown) => {
  const id = normalizeId(noteId);
  return id === null ? null : askAIService.getNoteDetail(id);
});

ipcMain.handle(
  'AskAI:createNote',
  (_event, request: Partial<CreateAskAINoteRequest>) =>
    askAIService.createNote({
      workspaceId: normalizeId(request?.workspaceId),
      name: typeof request?.name === 'string' ? request.name : null,
      transcript: String(request?.transcript || ''),
    }),
);

ipcMain.handle('AskAI:listConversations', () =>
  askAIService.listConversations(),
);

ipcMain.handle('AskAI:getConversation', (_event, conversationId: unknown) => {
  const id = normalizeId(conversationId);
  if (id === null) throw new Error('无效的会话 ID / Invalid conversation ID');
  return askAIService.getConversation(id);
});

ipcMain.handle('AskAI:ask', (_event, request: Partial<AskAIRequest>) =>
  askAIService.ask({
    conversationId: normalizeId(request?.conversationId),
    workspaceId: normalizeId(request?.workspaceId),
    noteId: normalizeId(request?.noteId),
    noteIds: Array.isArray(request?.noteIds)
      ? request.noteIds
          .map(normalizeId)
          .filter((id): id is number => id !== null)
      : null,
    question: String(request?.question || ''),
    scope: normalizeScope(request?.scope),
  }),
);

// 智能体模式的问答已经由 Agent 生成好，这里只负责落库，不再跑一次模型。
ipcMain.handle(
  'AskAI:recordTurn',
  (_event, request: Partial<RecordAskAITurnRequest>) =>
    askAIService.recordTurn({
      conversationId: normalizeId(request?.conversationId),
      question: String(request?.question || ''),
      answer: String(request?.answer || ''),
      noteIds: Array.isArray(request?.noteIds)
        ? request.noteIds
            .map(normalizeId)
            .filter((id): id is number => id !== null)
        : null,
    }),
);

ipcMain.handle('AskAI:autoSegmentNote', (_event, noteId: unknown) => {
  const id = normalizeId(noteId);
  if (id === null) throw new Error('Invalid note ID');
  return askAIService.autoSegmentNote(id);
});
