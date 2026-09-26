import { AIConversation } from '@shared/entities/AIConversation';

// AskAIService 顶层会用到 electron 的 app（写日志路径），测试里不需要真实实现。
jest.mock('electron', () => ({ app: { getPath: () => '.' } }), {
  virtual: true,
});

// eslint-disable-next-line import/first, @typescript-eslint/no-var-requires
import AskAIService from '../AskAIService';

type CreatedMessage = { conversationId: number; role: string; content: string };

function buildService() {
  const now = new Date('2026-08-18T00:00:00.000Z');
  const conversations = new Map<number, AIConversation>();
  const messages: CreatedMessage[] = [];
  const contexts: Array<{ conversationId: number; noteId: number }> = [];
  let nextId = 1;

  const conversationRepository = {
    createWithName: jest.fn((name: string) => {
      const conversation = new AIConversation(nextId, name, now, now);
      conversations.set(nextId, conversation);
      nextId += 1;
      return conversation;
    }),
    findById: jest.fn((id: number) => conversations.get(id) ?? null),
    update: jest.fn(),
    findAll: jest.fn(() => [...conversations.values()]),
  };

  const messageRepository = {
    createForConversation: jest.fn(
      (conversationId: number, role: string, content: string) => {
        messages.push({ conversationId, role, content });
      },
    ),
    findAllByConversation: jest.fn(() => []),
  };

  const contextRepository = {
    exists: jest.fn((conversationId: number, noteId: number) =>
      contexts.some(
        (item) =>
          item.conversationId === conversationId && item.noteId === noteId,
      ),
    ),
    addContext: jest.fn((conversationId: number, noteId: number) => {
      contexts.push({ conversationId, noteId });
    }),
    findAllByConversation: jest.fn(() => []),
  };

  const service = new AskAIService({
    conversationRepository: conversationRepository as never,
    messageRepository: messageRepository as never,
    contextRepository: contextRepository as never,
    noteService: {
      list: () => [],
      create: () => null,
      getSources: () => [],
    } as never,
    chatService: { chat: jest.fn() } as never,
    noteRepository: {
      findById: (id: number) => (id === 7 ? { id } : null),
    } as never,
    subnoteRepository: { findAllByNote: () => [] } as never,
    todoExtractionService: { extractTodosForNote: jest.fn() } as never,
  });

  return {
    service,
    conversationRepository,
    messageRepository,
    messages,
    contexts,
  };
}

describe('AskAIService.recordTurn（智能体问答落库）', () => {
  it('没有会话 id 时新建会话，并写入一问一答', () => {
    const { service, conversationRepository, messages } = buildService();

    const result = service.recordTurn({
      question: '有没有什么关于会议的内容',
      answer: '在最近的笔记中，有一个关于会议的内容。',
    });

    expect(conversationRepository.createWithName).toHaveBeenCalledTimes(1);
    expect(result.conversation.id).toBe(1);
    expect(messages).toEqual([
      {
        conversationId: 1,
        role: 'user',
        content: '有没有什么关于会议的内容',
      },
      {
        conversationId: 1,
        role: 'assistant',
        content: '在最近的笔记中，有一个关于会议的内容。',
      },
    ]);
  });

  it('带上会话 id 时追加到同一个会话，不再新建', () => {
    const { service, conversationRepository, messages } = buildService();
    const first = service.recordTurn({ question: '问题一', answer: '回答一' });

    service.recordTurn({
      conversationId: first.conversation.id,
      question: '问题二',
      answer: '回答二',
    });

    expect(conversationRepository.createWithName).toHaveBeenCalledTimes(1);
    expect(messages).toHaveLength(4);
    expect(messages.every((item) => item.conversationId === 1)).toBe(true);
  });

  it('把挂上的笔记记为来源，重复挂载不会写两次', () => {
    const { service, contexts } = buildService();

    const first = service.recordTurn({
      question: '问题',
      answer: '回答',
      noteIds: [7, 7, 8, 0, -1],
    });
    service.recordTurn({
      conversationId: first.conversation.id,
      question: '追问',
      answer: '再回答',
      noteIds: [7],
    });

    expect(contexts).toEqual([{ conversationId: 1, noteId: 7 }]);
  });

  it('空回答直接报错，不写入半条记录', () => {
    const { service, messages } = buildService();

    expect(() =>
      service.recordTurn({ question: '问题', answer: '   ' }),
    ).toThrow();
    expect(messages).toHaveLength(0);
  });
});
