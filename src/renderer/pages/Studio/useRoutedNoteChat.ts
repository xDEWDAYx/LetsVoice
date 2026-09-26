import { useEffect, useRef } from 'react';
import { AskAINote } from '../AskAI/AskAITypes';

export type RoutedNoteChatDeps = {
  /** 路由 state 里带过来的笔记 id（工作空间「笔记问答」跳转时写入）。 */
  askNoteIds?: number[] | null;
  /** 已加载的笔记库，用来把 id 换成笔记对象。 */
  notes: AskAINote[];
  /** 自动发出的第一个问题。 */
  question: string;
  startConversation: () => void;
  linkNote: (note: AskAINote) => void;
  ask: (question: string, context: { noteIds: number[] }) => unknown;
  /** 已处理，请求方据此清掉路由 state。 */
  onHandled: () => void;
};

/**
 * 从别的页面带着笔记跳进对话工作台时，自动开一轮问答。
 *
 * 顺序是：开新对话 → 把笔记挂到输入框 → 发出第一个问题。
 * 必须等笔记库加载完才动手：挂笔记和提问都需要笔记对象本身。
 * 整个请求只消费一次，之后清掉路由 state，刷新页面不会重复提问。
 */
export default function useRoutedNoteChat({
  askNoteIds,
  notes,
  question,
  startConversation,
  linkNote,
  ask,
  onHandled,
}: RoutedNoteChatDeps): void {
  // 回调每次渲染都是新的，放 ref 里，免得 effect 被反复触发。
  const deps = useRef({
    question,
    startConversation,
    linkNote,
    ask,
    onHandled,
  });
  deps.current = { question, startConversation, linkNote, ask, onHandled };

  const handled = useRef(false);

  useEffect(() => {
    if (!askNoteIds || askNoteIds.length === 0 || handled.current) return;
    if (notes.length === 0) return;

    const targets = notes.filter((note) => askNoteIds.includes(note.id));
    handled.current = true;
    deps.current.onHandled();
    // 笔记可能已经被删掉了：清掉请求就行，别问一个空上下文。
    if (targets.length === 0) return;

    deps.current.startConversation();
    targets.forEach((note) => deps.current.linkNote(note));
    deps.current.ask(deps.current.question, {
      noteIds: targets.map((note) => note.id),
    });
  }, [askNoteIds, notes]);
}
