import { ReactNode, useEffect, useState } from 'react';
import type { HudKind } from '@shared/hud/HudLayout';
import './Hud.css';

type FrameProps = {
  kind: HudKind;
  children: ReactNode;
  testId?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

/**
 * 浮窗的外形：一张浮在透明底上的卡片。
 *
 * 单独拆出来是给新手引导用的 —— 引导要在主界面右下角原样摆一个浮窗，
 * 让用户提前看见「按下快捷键会冒出什么」。那边如果照着抄一遍 div，
 * 以后真浮窗改了结构，引导里演示的就成了旧样子。
 */
export function HudFrame({
  kind,
  children,
  testId,
  onMouseEnter,
  onMouseLeave,
}: FrameProps) {
  return (
    <div
      className={`hud hud-${kind}`}
      data-testid={testId}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="hud-card">{children}</div>
    </div>
  );
}

type Props = {
  kind: HudKind;
  children: ReactNode;
  /** 多少毫秒后自动淡出关闭；null 表示常驻，由用户或主进程决定。 */
  autoHideMs?: number | null;
  /**
   * 「第几次被显示」。浮窗是预热常驻的，只挂载一次，
   * 所以淡出计时要跟着每次显示重新开始，而不是跟着 mount。
   */
  shownAt?: number;
};

/**
 * 浮窗外壳：透明底、卡片、Esc 关闭、可选的自动淡出。
 *
 * 浮窗和主界面共用一个渲染包，所以底色必须在这里手动改成透明——
 * body 上那层 var(--bg) 会让「无边框透明窗口」变成一块实心方块。
 */
export default function HudShell({
  kind,
  children,
  autoHideMs = null,
  shownAt = 0,
}: Props) {
  useEffect(() => {
    document.documentElement.classList.add('is-hud');
    return () => document.documentElement.classList.remove('is-hud');
  }, []);

  const close = () => window.electron.hud?.close?.(kind);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // close 只依赖 kind，kind 在一个窗口的生命周期里不会变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // 鼠标停在浮窗上就别数秒了：用户正在看（或正要点某一条），
  // 数到点直接淡出会把他手上的操作也一起收走。移开之后重新从头计时。
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (!autoHideMs || hovering) {
      document.documentElement.classList.remove('is-hud-leaving');
      return undefined;
    }
    // 上一轮淡出留下的类要清掉，否则重新显示时是半透明的
    document.documentElement.classList.remove('is-hud-leaving');
    // 先播淡出动画再收起，直接 hide 会「啪」地消失
    const fadeAt = window.setTimeout(() => {
      document.documentElement.classList.add('is-hud-leaving');
    }, autoHideMs);
    const closeAt = window.setTimeout(() => close(), autoHideMs + 420);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(closeAt);
      document.documentElement.classList.remove('is-hud-leaving');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHideMs, kind, shownAt, hovering]);

  return (
    <HudFrame
      kind={kind}
      testId={`hud-${kind}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {children}
    </HudFrame>
  );
}
