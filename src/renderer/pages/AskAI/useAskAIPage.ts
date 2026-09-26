import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AskAIConversation,
  AskAIConversationDetail,
  AskAIMessage,
  AskAINote,
  AskAIResult,
  AskAIScope,
} from './AskAITypes';

/**
 * 提问时的上下文：调用方把挂上的工作区展开成笔记后一起传进来，
 * 因此这里只需要一份笔记 id 列表，天然支持多工作区混合。
 */
export type AskAIContext = {
  noteIds?: number[];
};

export default function useAskAIPage() {
  const [notes, setNotes] = useState<AskAINote[]>([]);
  const [conversations, setConversations] = useState<AskAIConversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<AskAIConversation | null>(null);
  const [messages, setMessages] = useState<AskAIMessage[]>([]);
  const [sources, setSources] = useState<AskAINote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [scope, setScope] = useState<AskAIScope>('note');
  const [status, setStatus] = useState('');
  const [isSending, setIsSending] = useState(false);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const loadNotes = useCallback(async (preferredId?: number) => {
    const list = (await window.electron.askAI.listNotes()) as AskAINote[];
    setNotes(list);
    setSelectedNoteId((currentId) => {
      const candidateId = preferredId ?? currentId;
      return candidateId !== null &&
        candidateId !== undefined &&
        list.some((note) => note.id === candidateId)
        ? candidateId
        : (list[0]?.id ?? null);
    });
    return list;
  }, []);

  const loadConversations = useCallback(async () => {
    const list =
      (await window.electron.askAI.listConversations()) as AskAIConversation[];
    setConversations(list);
  }, []);

  useEffect(() => {
    Promise.all([loadNotes(), loadConversations()]).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '页面加载失败');
    });
  }, [loadConversations, loadNotes]);

  const resetChat = useCallback(() => {
    setActiveConversation(null);
    setMessages([]);
    setSources([]);
    setStatus('');
  }, []);

  const removeSourceNote = useCallback((noteId: number) => {
    setSources((current) => current.filter((note) => note.id !== noteId));
  }, []);

  const restoreSourceNote = useCallback((note: AskAINote, index: number) => {
    setSources((current) => {
      if (current.some((item) => item.id === note.id)) return current;
      const next = [...current];
      next.splice(Math.min(Math.max(index, 0), next.length), 0, note);
      return next;
    });
  }, []);

  const selectNote = useCallback(
    (noteId: number) => {
      setSelectedNoteId(noteId);
      setScope('note');
      resetChat();
    },
    [resetChat],
  );

  const openConversation = useCallback(async (conversationId: number) => {
    setStatus('正在加载会话…');
    try {
      const detail = (await window.electron.askAI.getConversation(
        conversationId,
      )) as AskAIConversationDetail;
      setActiveConversation(detail.conversation);
      setMessages(detail.messages);
      setSources(detail.sources ?? []);
      if (detail.sources[0]) setSelectedNoteId(detail.sources[0].id);
      setScope(detail.sources.length > 1 ? 'workspace' : 'note');
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '会话加载失败');
    }
  }, []);

  const createNote = useCallback(
    async (
      name: string,
      transcript: string,
      workspaceId?: number | null,
    ): Promise<boolean> => {
      setStatus('正在保存笔记…');
      try {
        const created = (await window.electron.askAI.createNote({
          workspaceId: workspaceId ?? selectedNote?.workspaceId ?? null,
          name,
          transcript,
        })) as AskAINote;
        await loadNotes(created.id);
        setScope('note');
        resetChat();
        setStatus('笔记已保存');

        // Trigger Todo Extraction in the background
        window.electron.dashboard
          .extractTodosForNote(created.id)
          .catch(console.error);

        return true;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '笔记保存失败');
        return false;
      }
    },
    [loadNotes, resetChat, selectedNote?.workspaceId],
  );

  const ask = useCallback(
    async (question: string, context?: AskAIContext): Promise<boolean> => {
      if (isSending) return false;

      // 上下文完全由调用方挂上的内容决定：挂了笔记就问这些笔记（可跨工作区），
      // 没挂任何东西时沿用 scope 状态（Ask AI 页仍在用）。
      const linkedIds =
        context?.noteIds?.filter((id) => Number.isInteger(id)) ?? [];

      let effectiveScope: AskAIScope;
      let noteIds: number[] | null = null;
      let anchorNote: AskAINote | null;

      if (linkedIds.length > 0) {
        effectiveScope = 'multi-note';
        noteIds = linkedIds;
        anchorNote =
          notes.find((note) => note.id === linkedIds[0]) ?? selectedNote;
      } else {
        effectiveScope = scope === 'multi-note' ? 'note' : scope;
        anchorNote = selectedNote;
      }

      const workspaceId = anchorNote?.workspaceId ?? null;
      if (!anchorNote) return false;

      setIsSending(true);
      setStatus('本地模型正在思考…');
      try {
        const result = (await window.electron.askAI.ask({
          conversationId: activeConversation?.id ?? null,
          workspaceId,
          noteId: anchorNote?.id ?? null,
          noteIds,
          question,
          scope: effectiveScope,
        })) as AskAIResult;
        setActiveConversation(result.conversation);
        setMessages(result.messages);
        setSources(result.sources ?? []);
        setStatus(result.modelName ? `本地模型：${result.modelName}` : '');
        await loadConversations();
        return true;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '提问失败');
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [
      activeConversation?.id,
      isSending,
      loadConversations,
      notes,
      scope,
      selectedNote,
    ],
  );

  return {
    notes,
    conversations,
    activeConversation,
    messages,
    sources,
    selectedNote,
    scope,
    status,
    isSending,
    setScope,
    selectNote,
    openConversation,
    createNote,
    ask,
    resetChat,
    removeSourceNote,
    restoreSourceNote,
    // 录音保存新笔记后，用它刷新列表并选中该笔记，让对话立即挂到新内容上。
    reloadNotes: loadNotes,
    // 智能体模式自己落库，落完用它刷新「最近会话」。
    reloadConversations: loadConversations,
  };
}
