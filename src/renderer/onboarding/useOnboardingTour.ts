import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ONBOARDING_STEPS, OnboardingStep } from './OnboardingSteps';
import resolveOnboardingRoute from './resolveOnboardingRoute';

export type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
};

export type TourState = {
  step: OnboardingStep;
  index: number;
  total: number;
  /** 目标已经找到并量好位置；null 表示这一步不打光或还在等元素出现 */
  rect: TargetRect | null;
  /** 正在跳转 / 等目标元素挂载，卡片这时显示「正在打开…」 */
  settling: boolean;
};

// 跳转之后目标元素最多等这么久。等不到就降级成居中卡片继续讲，
// 绝不能因为某个控件没渲染出来就把整个引导卡死在这一步。
const TARGET_TIMEOUT_MS = 2600;

// 聚光灯洞比元素本身四周各撑开这么多，紧贴着边会显得很挤。
const SPOT_PADDING = 8;

function readRect(element: Element): TargetRect {
  const box = element.getBoundingClientRect();
  const radius = Number.parseFloat(getComputedStyle(element).borderRadius) || 0;
  return {
    top: box.top - SPOT_PADDING,
    left: box.left - SPOT_PADDING,
    width: box.width + SPOT_PADDING * 2,
    height: box.height + SPOT_PADDING * 2,
    radius: radius + SPOT_PADDING,
  };
}

function sameRect(a: TargetRect | null, b: TargetRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * 引导的驱动逻辑：跳页 → 等目标出现 → 滚到可视区 → 持续跟住它的位置。
 *
 * 位置跟踪用一个 rAF 轮询而不是挂 scroll/resize 监听：内容区、抽屉、
 * 弹层各有各的滚动容器，逐个挂监听既漏又难维护；每帧对单个元素调一次
 * getBoundingClientRect 的开销可以忽略，而且页面里任何布局变化都能跟上。
 */
export default function useOnboardingTour(active: boolean) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [settling, setSettling] = useState(false);
  const [routedIndex, setRoutedIndex] = useState<number | null>(null);

  const step = ONBOARDING_STEPS[index];
  const total = ONBOARDING_STEPS.length;

  // 上一步的位置，用来画那条从旧目标飞向新目标的轨迹
  const previousRect = useRef<TargetRect | null>(null);
  // Optional steps must be skipped in the same direction the user was moving.
  // Otherwise pressing Back at the dashboard would bounce straight back there.
  const direction = useRef<1 | -1>(1);

  const reset = useCallback(() => {
    setIndex(0);
    setRect(null);
    setRoutedIndex(null);
    direction.current = 1;
    previousRect.current = null;
  }, []);

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, total - 1));
      if (clamped !== index) direction.current = clamped > index ? 1 : -1;
      previousRect.current = rect;
      setIndex(clamped);
    },
    [index, rect, total],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // 跳转到这一步对应的页面。
  // 依赖里带上 index 而不是只看 route：往回退时也必须重新断言一次路由，
  // 否则「上一步」只把弹窗挪回去、页面还停在后一步那一页，聚光灯就找不到
  // 目标了。replace:true 是为了不让引导把浏览历史塞满。
  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;
    setRoutedIndex(null);
    setSettling(true);

    const skipUnavailableStep = () => {
      if (cancelled) return;
      setRect(null);
      setSettling(false);
      setIndex((current) => {
        if (current !== index) return current;
        return Math.max(0, Math.min(current + direction.current, total - 1));
      });
    };

    resolveOnboardingRoute(step)
      .then((route) => {
        if (cancelled) return null;

        if (route) {
          navigate(route, { replace: true });
          setRoutedIndex(index);
          return route;
        }

        // No workspace yet: detail-only guidance has nothing truthful to point
        // at. Skip it immediately rather than waiting for a missing DOM target.
        skipUnavailableStep();
        return null;
      })
      .catch(() => {
        // resolveOnboardingRoute already converts expected IPC failures to
        // null. This final guard keeps an unexpected resolver failure from
        // becoming an unhandled rejection that closes the tour.
        skipUnavailableStep();
      });

    return () => {
      cancelled = true;
    };
  }, [active, index, navigate, step, total]);

  // 找目标 → 滚进可视区 → 持续跟住位置
  useEffect(() => {
    if (!active || routedIndex !== index) return undefined;

    if (!step.target) {
      setRect(null);
      setSettling(false);
      return undefined;
    }

    let frame = 0;
    let cancelled = false;
    let scrolled = false;
    const startedAt = performance.now();
    setSettling(true);

    const tick = () => {
      if (cancelled) return;

      const element = document.querySelector(step.target as string);

      if (!element) {
        // 还没挂上来（页面刚跳过去、或者还在骨架屏）。超时就放弃打光，
        // 卡片降级到屏幕中央，文案照讲。
        if (performance.now() - startedAt > TARGET_TIMEOUT_MS) {
          setRect(null);
          setSettling(false);
          return;
        }
        frame = requestAnimationFrame(tick);
        return;
      }

      if (!scrolled) {
        scrolled = true;
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      const nextRect = readRect(element);
      // 元素存在但还没布局（宽高为 0）时先别收 settling，
      // 否则聚光灯会先在左上角闪一下再跳到正确位置。
      if (nextRect.width > SPOT_PADDING * 2) {
        setSettling(false);
        setRect((current) =>
          sameRect(current, nextRect) ? current : nextRect,
        );
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [active, index, routedIndex, step.target]);

  // 键盘：← → 翻页，Esc 退出交给调用方处理
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, prev]);

  const state: TourState = { step, index, total, rect, settling };

  return {
    ...state,
    previousRect: previousRect.current,
    isFirst: index === 0,
    isLast: index === total - 1,
    goTo,
    next,
    prev,
    reset,
  };
}
