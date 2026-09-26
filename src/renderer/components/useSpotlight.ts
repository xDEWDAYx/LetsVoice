import { PointerEvent, useCallback, useRef } from 'react';

/**
 * 光标聚光：把鼠标在元素内的位置写进 --mx / --my，
 * 配合 effects.css 的 .fx-spotlight 让一团柔光跟着指针走。
 *
 * 写的是 CSS 自定义属性而不是 React state —— pointermove 触发得很密，
 * 走 state 会每帧重渲染整棵子树。直接改 style 不进 React 的调度，
 * 再用 rAF 合并到每帧一次。
 *
 * 用法：
 *   const spotlight = useSpotlight();
 *   <div className="fx-spotlight" onPointerMove={spotlight.onPointerMove}
 *        onPointerLeave={spotlight.onPointerLeave}>…</div>
 */
export default function useSpotlight() {
  const frame = useRef(0);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const { clientX, clientY } = event;

    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--mx', `${clientX - rect.left}px`);
      element.style.setProperty('--my', `${clientY - rect.top}px`);
    });
  }, []);

  // 离开时把光斑收回中心，下次进入不会从上次的位置突然跳一下
  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    event.currentTarget.style.removeProperty('--mx');
    event.currentTarget.style.removeProperty('--my');
  }, []);

  return { onPointerMove, onPointerLeave };
}
