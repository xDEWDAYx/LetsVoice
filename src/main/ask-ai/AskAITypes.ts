export type AskAIScope = 'note' | 'workspace' | 'multi-note';

export type AskAIRequest = {
  conversationId?: number | null;
  workspaceId?: number | null;
  noteId?: number | null;
  noteIds?: number[] | null;
  question: string;
  scope: AskAIScope;
};

/**
 * 记录一轮已经产生好的问答。
 * 智能体模式的回答是主进程 Agent 生成的，不需要再跑一次模型，
 * 但同样要落进会话记录里，否则「最近会话」看不到它。
 */
export type RecordAskAITurnRequest = {
  conversationId?: number | null;
  question: string;
  answer: string;
  noteIds?: number[] | null;
};

export type CreateAskAINoteRequest = {
  workspaceId?: number | null;
  name?: string | null;
  transcript: string;
};

export type AskAIConversationDTO = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type AskAIMessageDTO = {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;
};

export type AskAINoteDTO = {
  id: number;
  workspaceId: number | null;
  name: string;
  transcript: string;
  transcriptPreview: string;
  updatedAt: string;
};

/** 笔记下挂的整理结果（AI 语义总结、自动分段等），按创建顺序返回。 */
export type AskAISubnoteDTO = {
  id: number;
  contentType: string;
  content: string;
  createdAt: string;
};

export type AskAINoteDetailDTO = AskAINoteDTO & {
  subnotes: AskAISubnoteDTO[];
};

export type AskAIResultDTO = {
  conversation: AskAIConversationDTO;
  messages: AskAIMessageDTO[];
  answer: string;
  modelName: string | null;
  scope: AskAIScope;
  sources: AskAINoteDTO[];
};
