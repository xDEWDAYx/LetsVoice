import { CSSProperties, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TourPointer from './TourPointer';

/**
 * 「双击这里，右边会开出一块详情」的动作演示。
 *
 * 双击是个隐藏动作：界面上没有任何东西提示这张卡片还能双击，说一句
 * 「双击可以看全文」用户既不知道该点哪儿，也不知道会开在哪儿。这里画一个
 * 鼠标指针过去连点两下，右边随即滑出详情面板 —— 面板的位置、宽度和版式都
 * 照真的那块（.studio-source / .ask-ai-note-preview）来。
 *
 * 循环播放，纯装饰，不接受交互。
 */

/** 详情面板的宽度。真的那一栏是 minmax(250px, 330px)，这里跟着来。 */
const PANEL_MIN_WIDTH = 250;
const PANEL_MAX_WIDTH = 330;
const PANEL_RATIO = 0.26;

/** 指针从落点的左下方摸过去，别一上来就贴在卡片上。 */
const APPROACH_X = -34;
const APPROACH_Y = 58;

type Box = { top: number; left: number; width: number; height: number };

export type ClickDemoSpec = {
  /** 双击的是这个元素 */
  onSelector: string;
  /** 详情面板贴在这个容器的右边缘 */
  panelHostSelector: string;
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

function firstLine(element: Element): string {
  const raw = (element.textContent ?? '').trim();
  if (!raw) return '';
  const line = raw.split('\n')[0].trim();
  return line.length > 16 ? `${line.slice(0, 16)}…` : line;
}

/**
 * 跟住被双击的元素和承载面板的容器。
 *
 * 和聚光灯一样用 rAF 轮询：这两个东西分别在会滚动的面板里，
 * 逐个挂 scroll/resize 监听既漏又难维护。
 */
function useClickBoxes(spec: ClickDemoSpec, fallbackSelector: string | null) {
  const [boxes, setBoxes] = useState<{
    on: Box;
    host: Box;
    label: string;
  } | null>(null);

  useEffect(() => {
    let frame = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const clicked =
        document.querySelector(spec.onSelector) ??
        (fallbackSelector ? document.querySelector(fallbackSelector) : null);
      const host = document.querySelector(spec.panelHostSelector);

      if (clicked && host) {
        const next = {
          on: readBox(clicked),
          host: readBox(host),
          label: firstLine(clicked),
        };
        setBoxes((current) =>
          current &&
          sameBox(current.on, next.on) &&
          sameBox(current.host, next.host) &&
          current.label === next.label
            ? current
            : next,
        );
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [spec.onSelector, spec.panelHostSelector, fallbackSelector]);

  return boxes;
}

export default function TourClickDemo({
  spec,
  fallbackSelector = null,
}: {
  spec: ClickDemoSpec;
  fallbackSelector?: string | null;
}) {
  const { t } = useTranslation();
  const boxes = useClickBoxes(spec, fallbackSelector);

  if (!boxes) return null;

  const { on, host, label } = boxes;
  const clickX = on.left + on.width / 2;
  const clickY = on.top + on.height / 2;
  const panelWidth = Math.min(
    PANEL_MAX_WIDTH,
    Math.max(PANEL_MIN_WIDTH, host.width * PANEL_RATIO),
  );

  const vars = {
    '--click-x': `${clickX}px`,
    '--click-y': `${clickY}px`,
    '--from-x': `${clickX + APPROACH_X}px`,
    '--from-y': `${clickY + APPROACH_Y}px`,
  } as CSSProperties;

  return (
    <div className="tour-click" aria-hidden="true" style={vars}>
      {/* 详情面板：位置和宽度照真的那一栏来，贴着页面右边缘 */}
      <div
        className="tour-click__panel"
        style={{
          top: host.top,
          left: host.left + host.width - panelWidth,
          width: panelWidth,
          height: host.height,
        }}
      >
        <div className="studio-source">
          <section className="ask-ai-note-preview">
            <header>
              <div>
                <span>{t('askAI.chat.scopeBtnNote')}</span>
                <h1>{label || t('onboarding.tour.notePreview.sample')}</h1>
              </div>
            </header>
            <section className="ask-ai-note-section">
              <h2>{t('askAI.preview.summaryTitle')}</h2>
              {/* 内容用骨架条：这是「会开出一块面板」的示意，
                  不该编一段看起来像真摘要的假文字 */}
              <span className="tour-click__line" style={{ width: '92%' }} />
              <span className="tour-click__line" style={{ width: '78%' }} />
            </section>
            <section className="ask-ai-note-section">
              <h2>{t('askAI.preview.transcriptTitle')}</h2>
              <span className="tour-click__line" style={{ width: '96%' }} />
              <span className="tour-click__line" style={{ width: '88%' }} />
              <span className="tour-click__line" style={{ width: '64%' }} />
            </section>
          </section>
        </div>
      </div>

      {/* 两下点击的水波。第二下靠 animation-delay 错开，两者同周期才不会跑偏 */}
      <span className="tour-click__ripple" />
      <span className="tour-click__ripple tour-click__ripple--second" />

      <span className="tour-click__cursor">
        <TourPointer />
      </span>
    </div>
  );
}
