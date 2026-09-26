import { renderHook } from '@testing-library/react';
import useRoutedNoteChat, {
  RoutedNoteChatDeps,
} from '../renderer/pages/Studio/useRoutedNoteChat';
import { AskAINote } from '../renderer/pages/AskAI/AskAITypes';

const makeNote = (id: number): AskAINote => ({
  id,
  workspaceId: 1,
  name: `笔记 ${id}`,
  transcript: '内容',
  transcriptPreview: '内容',
  updatedAt: '2026-08-20T00:00:00.000Z',
});

const setup = (overrides: Partial<RoutedNoteChatDeps> = {}) => {
  const spies = {
    startConversation: jest.fn(),
    linkNote: jest.fn(),
    ask: jest.fn(),
    onHandled: jest.fn(),
  };
  const initial: RoutedNoteChatDeps = {
    askNoteIds: [1, 2],
    notes: [makeNote(1), makeNote(2), makeNote(3)],
    question: '这些笔记都说了些什么？',
    ...spies,
    ...overrides,
  };
  const view = renderHook(
    (props: RoutedNoteChatDeps) => useRoutedNoteChat(props),
    {
      initialProps: initial,
    },
  );
  return { ...view, ...spies, initial };
};

describe('带着笔记跳进对话工作台', () => {
  it('开新对话、挂上笔记、自动问出第一句', () => {
    const { startConversation, linkNote, ask } = setup();

    expect(startConversation).toHaveBeenCalledTimes(1);
    expect(linkNote).toHaveBeenCalledTimes(2);
    expect(linkNote.mock.calls.map(([note]) => note.id)).toEqual([1, 2]);
    expect(ask).toHaveBeenCalledWith('这些笔记都说了些什么？', {
      noteIds: [1, 2],
    });
  });

  it('问完就清掉路由 state，重渲染不会再问一遍', () => {
    const { rerender, initial, ask, onHandled } = setup();

    expect(onHandled).toHaveBeenCalledTimes(1);

    rerender({ ...initial });
    rerender({ ...initial, notes: [...initial.notes] });

    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('笔记库还没加载完就先等着，加载完再问', () => {
    const { rerender, initial, ask } = setup({ notes: [] });

    expect(ask).not.toHaveBeenCalled();

    rerender({ ...initial, notes: [makeNote(1), makeNote(2)] });

    expect(ask).toHaveBeenCalledWith('这些笔记都说了些什么？', {
      noteIds: [1, 2],
    });
  });

  it('没有跳转请求时什么都不做', () => {
    const { startConversation, ask, onHandled } = setup({ askNoteIds: null });

    expect(startConversation).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    expect(onHandled).not.toHaveBeenCalled();
  });

  it('笔记已经不在了：清掉请求，但不问一个空上下文', () => {
    const { ask, startConversation, onHandled } = setup({
      askNoteIds: [99],
    });

    expect(onHandled).toHaveBeenCalledTimes(1);
    expect(startConversation).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
  });
});
