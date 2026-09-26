export type AskAIScope = 'note' | 'workspace' | 'multi-note';

export type AskAINote = {
  id: number;
  workspaceId: number | null;
  name: string;
  transcript: string;
  transcriptPreview: string;
  updatedAt: string;
};

/** 笔记下挂的整理结果，contentType 形如「AI 语义总结 1 / Semantic summary 1」。 */
export type AskAISubnote = {
  id: number;
  contentType: string;
  content: string;
  createdAt: string;
};

export type AskAINoteDetail = AskAINote & {
  subnotes: AskAISubnote[];
};

export type AskAIConversation = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type AskAIMessage = {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;
};

export type AskAIResult = {
  conversation: AskAIConversation;
  messages: AskAIMessage[];
  answer: string;
  modelName: string | null;
  scope: AskAIScope;
  sources: AskAINote[];
};

export type AskAIConversationDetail = {
  conversation: AskAIConversation;
  messages: AskAIMessage[];
  sources: AskAINote[];
};

export function formatAskAIDate(value: string): string {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
