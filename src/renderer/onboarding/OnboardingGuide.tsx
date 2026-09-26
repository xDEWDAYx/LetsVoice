import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ONBOARDING_OPEN_EVENT,
  OnboardingController,
} from './OnboardingController';
import useOnboardingTour, { TargetRect } from './useOnboardingTour';
import { ONBOARDING_STEPS, StepPlacement } from './OnboardingSteps';
import './OnboardingGuide.css';
import TourClickDemo from './TourClickDemo';
import TourHoverDemo from './TourHoverDemo';
import TourDragDemo from './TourDragDemo';
import TourHudStage from './TourHudStage';

const CARD_WIDTH = 340;
// 卡片和聚光灯之间留的空隙，箭头就画在这段里
const CARD_GAP = 18;
const EDGE = 16;
// 还没量到真实高度时的估值，仅用于首帧；量到之后立刻按实际值重排
const CARD_HEIGHT_FALLBACK = 300;

type CardPosition = {
  style: CSSProperties;
  /** 箭头指向哪一侧的目标：卡片在目标下方时箭头朝上 */
  arrow: 'up' | 'down' | 'left' | 'right' | 'none';
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * 把卡片摆在目标旁边放得下的一侧，并夹在视口内。
 *
 * cardHeight 必须是量出来的真实高度，不能拍脑袋写常数：
 * 每一步的文案长短不一样（有没有 hint 差好几十像素），
 * 用固定值判断「上面放不放得下」就会算错，卡片直接盖在
 * 被讲解的控件上 —— 录音按钮和 Agent 开关都在输入框那一行、
 * 贴着窗口底部，是最容易踩到的两个。
 *
 * 只用 top/left 定位，不用 transform：卡片里若有 position:fixed 的
 * 子元素，transform 会变成它们的包含块；而且 top/left 配合 CSS
 * transition 已经能做出「卡片滑到下一个目标旁边」的效果。
 */
function placeCard(
  rect: TargetRect | null,
  cardHeight: number,
  placement: StepPlacement = 'auto',
): CardPosition {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const height = cardHeight || CARD_HEIGHT_FALLBACK;

  // 聚光灯罩住大半个页面时，auto 会退化成「贴着某条边居中」，
  // 那正好压在被演示的东西上。这种步骤直接钉右下角。
  if (placement === 'corner') {
    return {
      style: {
        top: Math.max(EDGE, viewportH - height - EDGE),
        left: Math.max(EDGE, viewportW - CARD_WIDTH - EDGE),
        width: CARD_WIDTH,
      },
      arrow: 'none',
    };
  }

  if (!rect) {
    return {
      style: {
        top: clamp(viewportH / 2 - height / 2, EDGE, viewportH - height - EDGE),
        left: viewportW / 2 - CARD_WIDTH / 2,
        width: CARD_WIDTH,
      },
      arrow: 'none',
    };
  }

  // 卡片横向尽量对齐目标中心，但不能出视口
  const centeredLeft = clamp(
    rect.left + rect.width / 2 - CARD_WIDTH / 2,
    EDGE,
    viewportW - CARD_WIDTH - EDGE,
  );

  const spaceBelow = viewportH - (rect.top + rect.height) - CARD_GAP - EDGE;
  const spaceAbove = rect.top - CARD_GAP - EDGE;
  const spaceRight = viewportW - (rect.left + rect.width) - CARD_GAP - EDGE;
  const spaceLeft = rect.left - CARD_GAP - EDGE;

  // 优先放下方（阅读动线最自然），放不下就放上方
  if (spaceBelow >= height) {
    return {
      style: {
        top: rect.top + rect.height + CARD_GAP,
        left: centeredLeft,
        width: CARD_WIDTH,
      },
      arrow: 'up',
    };
  }

  if (spaceAbove >= height) {
    return {
      style: {
        top: rect.top - CARD_GAP - height,
        left: centeredLeft,
        width: CARD_WIDTH,
      },
      arrow: 'down',
    };
  }

  // 上下都塞不下就走两侧；纵向夹住，保证整张卡片都在视口内
  const verticalTop = clamp(
    rect.top + rect.height / 2 - height / 2,
    EDGE,
    viewportH - height - EDGE,
  );

  if (spaceRight >= CARD_WIDTH) {
    return {
      style: {
        top: verticalTop,
        left: rect.left + rect.width + CARD_GAP,
        width: CARD_WIDTH,
      },
      arrow: 'left',
    };
  }

  if (spaceLeft >= CARD_WIDTH) {
    return {
      style: {
        top: verticalTop,
        left: rect.left - CARD_GAP - CARD_WIDTH,
        width: CARD_WIDTH,
      },
      arrow: 'right',
    };
  }

  // 四面都不够（小窗口）：贴在离目标最远的那条边上，至少不压住目标
  const putBelow = spaceBelow >= spaceAbove;
  return {
    style: {
      top: putBelow ? clamp(viewportH - height - EDGE, EDGE, viewportH) : EDGE,
      left: centeredLeft,
      width: CARD_WIDTH,
    },
    arrow: putBelow ? 'up' : 'down',
  };
}

/**
 * 手把手引导：自动跳到对应页面 → 聚光灯打到具体控件上 → 卡片贴着它说人话。
 * 不是一个居中弹窗念稿子。
 */
export default function OnboardingGuide() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => OnboardingController.shouldOpen());

  const tour = useOnboardingTour(open);
  const { reset } = tour;

  useEffect(() => {
    const reopen = () => {
      reset();
      setOpen(true);
    };
    window.addEventListener(ONBOARDING_OPEN_EVENT, reopen);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, reopen);
  }, [reset]);

  // 广播「引导进行中」：对话工作台据此放行，
  // 否则新用户还没装模型，工作台被开工前检查挡着，
  // 中间那几步要指的输入框、录音按钮根本不在页面上。
  useEffect(() => {
    OnboardingController.setTourActive(open);
    return () => OnboardingController.setTourActive(false);
  }, [open]);

  // Esc 随时退出。引导是帮忙的，不能变成关不掉的牢笼。
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      OnboardingController.complete();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 卡片的真实高度。文案长短每步都不同，必须量出来再决定摆哪边，
  // 否则「上面放不放得下」会算错，卡片就盖住了要讲的控件。
  const [cardEl, setCardEl] = useState<HTMLElement | null>(null);
  const [cardHeight, setCardHeight] = useState(0);

  useEffect(() => {
    if (!cardEl) return undefined;
    const measure = () => setCardHeight(cardEl.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cardEl);
    return () => observer.disconnect();
  }, [cardEl]);

  const placement = useMemo(
    // rect 移动或卡片高度变化都要重算位置
    () => placeCard(tour.rect, cardHeight, tour.step.placement),
    [tour.rect, cardHeight, tour.step.placement],
  );

  if (!open) return null;

  const finish = () => {
    OnboardingController.complete();
    setOpen(false);
  };

  const handleNext = () => {
    if (tour.isLast) finish();
    else tour.next();
  };

  const spotlightStyle: CSSProperties | undefined = tour.rect
    ? {
        top: tour.rect.top,
        left: tour.rect.left,
        width: tour.rect.width,
        height: tour.rect.height,
        borderRadius: tour.rect.radius,
      }
    : undefined;

  // 从上一个目标飞向当前目标的一颗光点，让「注意力被带过去」这件事看得见
  const cometStyle: CSSProperties | undefined =
    tour.previousRect && tour.rect
      ? ({
          '--from-x': `${tour.previousRect.left + tour.previousRect.width / 2}px`,
          '--from-y': `${tour.previousRect.top + tour.previousRect.height / 2}px`,
          '--to-x': `${tour.rect.left + tour.rect.width / 2}px`,
          '--to-y': `${tour.rect.top + tour.rect.height / 2}px`,
        } as CSSProperties)
      : undefined;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-live="polite">
      {/* 拦截层：引导期间不让点到底下的界面，避免用户走丢 */}
      <div className="tour__blocker" />

      {/* 聚光灯。遮罩是这个盒子向外扩散的超大 box-shadow，
          所以盒子内部天然是「洞」，位置和圆角都能直接做过渡动画。 */}
      {tour.rect ? (
        <div className="tour__spotlight" style={spotlightStyle}>
          <span className="tour__ring" />
          <span className="tour__ring tour__ring--delayed" />
        </div>
      ) : (
        <div className="tour__dim" />
      )}

      {cometStyle && (
        <span
          className="tour__comet"
          key={tour.step.id}
          style={cometStyle}
          aria-hidden="true"
        />
      )}

      {/* 讲快捷键的那三步：把真的浮窗摆到它真正会出现的位置上。
          放在聚光灯之后，才不会被那圈遮罩压暗；它自己带 data-tour="hud-demo"，
          于是上面的聚光灯和下面的说明卡会像对待普通控件一样围住它。 */}
      {tour.step.hudDemo && (
        <TourHudStage key={tour.step.hudDemo} kind={tour.step.hudDemo} />
      )}

      {/* 拖拽那一步：让一张虚拟卡片从笔记飞到对话区，把「拖到哪儿、
          拖过去会怎样」演一遍。同样放在聚光灯之后才不会被遮罩压暗。 */}
      {tour.step.dragDemo && (
        <TourDragDemo
          fallbackSelector={tour.step.target}
          key={tour.step.id}
          spec={tour.step.dragDemo}
        />
      )}

      {/* 双击那一步：指针连点两下，右边滑出详情面板 */}
      {tour.step.clickDemo && (
        <TourClickDemo
          fallbackSelector={tour.step.target}
          key={tour.step.id}
          spec={tour.step.clickDemo}
        />
      )}

      {/* 联动那一步：把日历悬停那套真的跑一遍，指针和光环只是解说 */}
      {tour.step.hoverDemo && (
        <TourHoverDemo key={tour.step.id} spec={tour.step.hoverDemo} />
      )}

      <section
        className={`tour__card tour__card--${placement.arrow}`}
        ref={setCardEl}
        style={placement.style}
      >
        <span className="tour__arrow" aria-hidden="true" />

        <header className="tour__head">
          <span className="tour__counter">
            {tour.index + 1}
            <i>/</i>
            {tour.total}
          </span>
          <button className="tour__skip" onClick={finish} type="button">
            {t('onboarding.tour.skip')}
          </button>
        </header>

        {/* key 换掉就重放进场动画，让「换了一步」这件事被看见 */}
        <div className="tour__body" key={tour.step.id}>
          <h2 className="tour__title">{t(tour.step.titleKey)}</h2>
          <p className="tour__desc">{t(tour.step.descKey)}</p>
          {tour.step.hintKey && (
            <p className="tour__hint">
              <span className="tour__hint-arrow" aria-hidden="true">
                ➜
              </span>
              {t(tour.step.hintKey)}
            </p>
          )}
          {tour.settling && (
            <p className="tour__settling fx-text-shimmer">
              {t('onboarding.tour.locating')}
            </p>
          )}
        </div>

        {/* 不加 aria-hidden：里面是真的能点的按钮，藏起来对读屏器是撒谎。
            用 tabIndex={-1} 把它们移出 Tab 顺序即可 —— 十个圆点排在
            「上一步/下一步」前面会很烦，进度本身由上方的 3/10 播报。 */}
        <div className="tour__rail" aria-label={t('onboarding.tour.progress')}>
          {ONBOARDING_STEPS.map((item, itemIndex) => (
            <button
              aria-label={t(item.titleKey)}
              className={`tour__rail-dot${
                itemIndex === tour.index ? ' is-current' : ''
              }${itemIndex < tour.index ? ' is-done' : ''}`}
              key={item.id}
              onClick={() => tour.goTo(itemIndex)}
              tabIndex={-1}
              type="button"
            />
          ))}
        </div>

        <footer className="tour__actions">
          <button
            className="tour__btn"
            disabled={tour.isFirst}
            onClick={tour.prev}
            type="button"
          >
            {t('onboarding.tour.prev')}
          </button>
          <button
            className="tour__btn tour__btn--primary"
            onClick={handleNext}
            type="button"
          >
            {tour.isLast
              ? t('onboarding.tour.finish')
              : t('onboarding.tour.next')}
          </button>
        </footer>
      </section>
    </div>
  );
}
