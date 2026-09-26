import {
  KeyboardEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const STORAGE_KEY = 'speakspace:library:recents-height';
/** 两块区域各自的下限：拖到底也要留得下标题和一两行内容。 */
const MIN_RECENTS_HEIGHT = 96;
const MIN_NOTES_HEIGHT = 140;
/** 键盘每次调整的步长 */
const KEYBOARD_STEP = 24;

function readStoredHeight(): number | null {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

/**
 * 笔记库 / 最近会话之间的可拖动分隔条。
 *
 * 高度记在「最近会话」这一侧：笔记库用 flex 吃掉剩余空间，
 * 所以只要控制下半部分的高度，上半部分会自动跟着变。
 * 没拖过时返回 null，样式表里的默认比例继续生效。
 */
export default function useLibrarySplit() {
  const containerRef = useRef<HTMLElement | null>(null);
  const noteListRef = useRef<HTMLDivElement | null>(null);
  const recentsRef = useRef<HTMLElement | null>(null);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );
  const [height, setHeight] = useState<number | null>(readStoredHeight);
  const [dragging, setDragging] = useState(false);

  /** 上界由容器实际剩余空间算出，保证笔记库不会被挤没。 */
  const clamp = useCallback((value: number): number => {
    const container = containerRef.current?.getBoundingClientRect();
    const noteList = noteListRef.current?.getBoundingClientRect();
    if (!container || !noteList) return Math.max(value, MIN_RECENTS_HEIGHT);
    const available = container.bottom - noteList.top;
    const max = Math.max(available - MIN_NOTES_HEIGHT, MIN_RECENTS_HEIGHT);
    return Math.min(Math.max(value, MIN_RECENTS_HEIGHT), max);
  }, []);

  const commit = useCallback((value: number) => {
    setHeight(value);
    localStorage.setItem(STORAGE_KEY, String(Math.round(value)));
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const startHeight = recentsRef.current?.getBoundingClientRect().height;
    if (startHeight === undefined) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { startY: event.clientY, startHeight };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (!state) return;
      // 往上拖 = 最近会话变高，所以取的是起点减当前。
      commit(clamp(state.startHeight - (event.clientY - state.startY)));
    },
    [clamp, commit],
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    dragState.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const current =
        recentsRef.current?.getBoundingClientRect().height ??
        MIN_RECENTS_HEIGHT;
      event.preventDefault();
      const delta = event.key === 'ArrowUp' ? KEYBOARD_STEP : -KEYBOARD_STEP;
      commit(clamp(current + delta));
    },
    [clamp, commit],
  );

  // 上次记住的高度可能是在更大的窗口下拖的，挂载时先收进当前的合法区间。
  useLayoutEffect(() => {
    setHeight((current) => (current === null ? current : clamp(current)));
  }, [clamp]);

  // 窗口变小后旧的高度可能已经超出可用空间，重新收进合法区间。
  useEffect(() => {
    if (height === null) return undefined;
    const handleResize = () =>
      setHeight((current) => (current === null ? current : clamp(current)));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clamp, height]);

  return {
    containerRef,
    noteListRef,
    recentsRef,
    height,
    dragging,
    splitterHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
    },
  };
}
