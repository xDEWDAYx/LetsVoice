import { useEffect, useRef, useState } from 'react';
import TourPointer from './TourPointer';

/**
 * 「悬停这里，那边跟着动」的联动演示。
 *
 * 日历和笔记列表之间那套联动全靠鼠标悬停触发，界面上没有任何提示：停在有
 * 圆点的日子上会弹出当天的待办，再停到某一条上，右边的笔记列表会自己滚到
 * 那条待办出自的笔记并整行闪起来。光用文字讲，用户既不知道要停在哪儿，
 * 也不知道该往哪儿看。
 *
 * 关键在于这里演的不是一段动画，而是**真的把那套联动跑一遍**：
 * 往真实元素上派发 mouseover / mouseout，弹窗、滚动、行高亮全是应用自己
 * 做出来的反应。引导只负责画一个指针和一圈光环，告诉用户「是这儿在动」。
 * 好处是这段演示永远不会和真实行为对不上 —— 它就是真实行为。
 */

/** 指针走到下一站要多久，和 CSS 里的 transition 时长对齐。 */
const TRAVEL_MS = 520;
/** 停在那一天：够看清弹窗展开、右边整片相关笔记闪起来。 */
const DAY_DWELL_MS = 1150;
/** 停在某一条待办上：够看清列表滚过去、只剩那一行在闪。 */
const ITEM_DWELL_MS = 1250;
/** 一轮走完，收干净再来一遍。 */
const RESET_MS = 800;
/** 弹窗展开要一点时间，之后才找得到里面的条目。 */
const POPOVER_WAIT_MS = 260;

export type HoverDemoSpec = {
  /**
   * 先悬停这个，把后面要走的东西展开出来（比如日历上带圆点的某一天，
   * 停上去才会弹出当天的待办）。不需要这一步就别写。
   */
  openSelector?: string;
  /** 依次悬停这些 */
  itemSelector: string;
  /** 最多走几条，够说明问题就行 */
  maxItems?: number;
};

type Spot = { top: number; left: number; width: number; height: number };

/**
 * 往真实元素上模拟一次「鼠标移进来」。
 *
 * React 的 onMouseEnter 不是原生事件，它是根节点上的 mouseover / mouseout
 * 配对推算出来的。所以派发 mouseover 并带上 relatedTarget（上一站），
 * React 才会同时算出「离开上一站」和「进入这一站」—— 日历那边正是靠这一对
 * 来收起旧弹窗、取消关闭定时器的。
 */
function hoverInto(target: Element, previous: Element | null) {
  const box = target.getBoundingClientRect();
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
    relatedTarget: previous,
  };
  if (previous) {
    previous.dispatchEvent(
      new MouseEvent('mouseout', { ...init, relatedTarget: target }),
    );
  }
  target.dispatchEvent(new MouseEvent('mouseover', init));
}

/** 收手：把鼠标「移到别处」，让弹窗和高亮按应用自己的逻辑收掉。 */
function hoverOut(previous: Element | null) {
  if (!previous) return;
  previous.dispatchEvent(
    new MouseEvent('mouseout', {
      bubbles: true,
      cancelable: true,
      relatedTarget: document.body,
    }),
  );
}

function toSpot(element: Element): Spot {
  const box = element.getBoundingClientRect();
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
}

export default function TourHoverDemo({ spec }: { spec: HoverDemoSpec }) {
  const maxItems = spec.maxItems ?? 2;
  const opener = spec.openSelector ?? null;
  // -1 = 收手歇一拍。往后按站排：有 opener 时第 0 站是它，条目从第 1 站开始；
  // 没有 opener 就直接从第 0 站开始走条目。
  const lastPhase = opener ? maxItems : maxItems - 1;
  const [phase, setPhase] = useState(-1);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [showing, setShowing] = useState(false);
  const hovered = useRef<Element | null>(null);

  // 这一步结束（翻页 / 退出引导）时一定要松手，否则弹窗会一直挂在那儿
  useEffect(
    () => () => {
      hoverOut(hovered.current);
      hovered.current = null;
    },
    [],
  );

  useEffect(() => {
    const timers: number[] = [];
    const later = (fn: () => void, delay: number) => {
      timers.push(window.setTimeout(fn, delay));
    };

    if (phase < 0) {
      hoverOut(hovered.current);
      hovered.current = null;
      setShowing(false);
      later(() => setPhase(0), RESET_MS);
    } else {
      const atOpener = Boolean(opener) && phase === 0;
      const itemIndex = opener ? phase - 1 : phase;
      const find = () =>
        atOpener
          ? document.querySelector(opener as string)
          : document.querySelectorAll(spec.itemSelector)[itemIndex];

      const go = (target: Element) => {
        setSpot(toSpot(target));
        setShowing(true);
        // 先让指针飞过去，到了再「进入」——顺序反了就成了凭空触发
        later(() => {
          hoverInto(target, hovered.current);
          hovered.current = target;
          // 位置可能因为弹窗展开而变，落地后再校一次
          setSpot(toSpot(target));
        }, TRAVEL_MS);
        later(
          () => setPhase(phase >= lastPhase ? -1 : phase + 1),
          TRAVEL_MS + (atOpener ? DAY_DWELL_MS : ITEM_DWELL_MS),
        );
      };

      const target = find();
      if (target) {
        go(target);
      } else if (opener && phase === 1) {
        // 弹窗还没渲染出来，等一下再找；还是没有就重来一轮
        later(() => {
          const late = find();
          if (late) go(late);
          else setPhase(-1);
        }, POPOVER_WAIT_MS);
      } else {
        // 那天没待办、列表是空的、或者条目走完了
        setPhase(-1);
      }
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // spec 的两个选择器在一步之内不会变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lastPhase, opener, spec.itemSelector]);

  if (!spot) return null;

  return (
    <div className="tour-hover" aria-hidden="true">
      {/* 光环圈住「鼠标正停在哪儿」，会顺着指针一站站滑过去 */}
      <span
        className={`tour-hover__ring${showing ? ' is-on' : ''}`}
        style={{
          top: spot.top,
          left: spot.left,
          width: spot.width,
          height: spot.height,
        }}
      />
      <span
        className={`tour-hover__cursor${showing ? ' is-on' : ''}`}
        style={{
          transform: `translate(${spot.left + spot.width / 2}px, ${
            spot.top + spot.height / 2
          }px)`,
        }}
      >
        <TourPointer />
      </span>
    </div>
  );
}
