import { CSSProperties, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 「从这里拖到那里」的动作演示。
 *
 * 拖拽是引导里最难用文字讲清的一步：说「拖到右边的对话框」，用户既不知道
 * 终点具体是哪一块，也不知道拖过去之后会发生什么。这里让一张虚拟卡片自己
 * 从笔记上飞到对话区，落点用的是对话区真的那层拖拽提示（.studio-drop-hint），
 * 所以看到的就是真拖进去时的样子。
 *
 * 循环播放，纯装饰，不接受交互。
 */

/** 飞过去的那张小卡片：高度固定，宽度随起点那张笔记走。 */
const GHOST_HEIGHT = 42;
const GHOST_MIN_WIDTH = 130;
const GHOST_MAX_WIDTH = 220;

/**
 * 落点往下让一让。
 *
 * 正中间是「拖到此处关联笔记」那行字，卡片停在那儿会跟它糊成一团，
 * 两行字都读不出来。错开一点，一眼能看清「这张东西落进了这个框」。
 */
const LANDING_DROP = 44;

/** 卡片别飞出屏幕：笔记栏很窄时，居中放会把卡片挤出左边。 */
const VIEWPORT_EDGE = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

type Box = { top: number; left: number; width: number; height: number };

export type DragDemoSpec = {
  /** 起点：拖的是这个元素 */
  fromSelector: string;
  /** 终点：能放下的地方 */
  toSelector: string;
};

function readBox(element: Element): Box {
  const box = element.getBoundingClientRect();
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** 取元素上的第一行可见文字，给虚拟卡片当标题。 */
function firstLine(element: Element): string {
  const raw = (element.textContent ?? '').trim();
  if (!raw) return '';
  const line = raw.split('\n')[0].trim();
  return line.length > 18 ? `${line.slice(0, 18)}…` : line;
}

/**
 * 跟住起点和终点的位置。
 *
 * 和聚光灯一样用 rAF 轮询，不挂 scroll/resize 监听：这两个元素分别在两个
 * 各自会滚动的面板里，逐个挂监听既漏又难维护，而每帧两次
 * getBoundingClientRect 的开销可以忽略。
 */
function useDragBoxes(spec: DragDemoSpec, fallbackSelector: string | null) {
  const [boxes, setBoxes] = useState<{
    from: Box;
    to: Box;
    label: string;
  } | null>(null);

  useEffect(() => {
    let frame = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const source =
        document.querySelector(spec.fromSelector) ??
        (fallbackSelector ? document.querySelector(fallbackSelector) : null);
      const target = document.querySelector(spec.toSelector);

      if (source && target) {
        const from = readBox(source);
        const to = readBox(target);
        const label = firstLine(source);
        setBoxes((current) =>
          current &&
          sameBox(current.from, from) &&
          sameBox(current.to, to) &&
          current.label === label
            ? current
            : { from, to, label },
        );
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [spec.fromSelector, spec.toSelector, fallbackSelector]);

  return boxes;
}

export default function TourDragDemo({
  spec,
  fallbackSelector = null,
}: {
  spec: DragDemoSpec;
  fallbackSelector?: string | null;
}) {
  const { t } = useTranslation();
  const boxes = useDragBoxes(spec, fallbackSelector);

  if (!boxes) return null;

  const { from, to, label } = boxes;
  const width = clamp(from.width, GHOST_MIN_WIDTH, GHOST_MAX_WIDTH);
  // 落点在框内往下挪一点，但不能挪出框
  const landing = Math.min(
    LANDING_DROP,
    Math.max(0, to.height / 2 - GHOST_HEIGHT),
  );
  const ghostStyle = {
    width,
    height: GHOST_HEIGHT,
    '--from-x': `${clamp(
      from.left + from.width / 2 - width / 2,
      VIEWPORT_EDGE,
      window.innerWidth - width - VIEWPORT_EDGE,
    )}px`,
    '--from-y': `${from.top + from.height / 2 - GHOST_HEIGHT / 2}px`,
    '--to-x': `${clamp(
      to.left + to.width / 2 - width / 2,
      VIEWPORT_EDGE,
      window.innerWidth - width - VIEWPORT_EDGE,
    )}px`,
    '--to-y': `${to.top + to.height / 2 - GHOST_HEIGHT / 2 + landing}px`,
  } as CSSProperties;

  return (
    <div className="tour-drag" aria-hidden="true">
      {/* 落点用对话区真的那层提示，位置按它的实际范围摆 */}
      <div
        className="tour-drag__drop"
        style={{
          top: to.top,
          left: to.left,
          width: to.width,
          height: to.height,
        }}
      >
        <div className="studio-drop-hint">{t('studio.chat.dropHint')}</div>
      </div>

      <div className="tour-drag__ghost" style={ghostStyle}>
        <span className="tour-drag__grip" />
        <span className="tour-drag__label">
          {label || t('onboarding.tour.libraryDrag.sample')}
        </span>
      </div>
    </div>
  );
}
