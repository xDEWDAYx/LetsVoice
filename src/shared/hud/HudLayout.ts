/**
 * 浮窗的尺寸与落点。
 *
 * 放在 shared 而不是主进程里，是因为新手引导要在主界面上「原样」摆一个浮窗
 * 出来（同样的大小、同样贴在右下角）。两处各写一份常量，改了一边忘了另一边，
 * 引导里演示的就不是用户真正会看到的东西了。
 *
 * 纯计算，不碰 electron，主进程和渲染层都能直接引。
 */

/** 三种浮窗：统计环、今日待办、录音状态。 */
export type HudKind = 'stats' | 'todos' | 'record';

export type HudSize = { width: number; height: number };

/** 尺寸写死：浮窗内容是固定版式，让它自适应只会在不同 DPI 下抖动。 */
export const HUD_SIZES: Record<HudKind, HudSize> = {
  stats: { width: 360, height: 190 },
  todos: { width: 360, height: 300 },
  // 录音条只有「取消 · 波纹 · 完成」三件，不放计时和文字
  record: { width: 150, height: 52 },
};

/** 离屏幕边缘的距离，别贴着任务栏。 */
export const HUD_EDGE_MARGIN = 18;

/**
 * 录音条距工作区底边的距离。
 * 0 表示紧贴工作区下沿（也就是任务栏上方）；胶囊自己在窗口里还留了几像素
 * 内边距给投影，所以视觉上不会真的糊在边上。
 */
export const HUD_RECORD_BOTTOM_OFFSET = 0;

export type WorkArea = { x: number; y: number; width: number; height: number };

/**
 * 浮窗落点。
 *
 * 统计和待办去右下角（贴着工作区，不会压住任务栏），录音状态水平居中靠底——
 * 录音是「正在发生的事」，要一直看得见；另两个是瞥一眼就走的信息。
 * 纯函数，多屏 / 缩放这些边界情况可以直接测。
 */
export function computeHudBounds(
  kind: HudKind,
  workArea: WorkArea,
  size: HudSize = HUD_SIZES[kind],
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);

  if (kind === 'record') {
    // 水平正中、靠近底部：录音要一直看得见，但摆在屏幕正中会挡住手上的活。
    // 屏幕太矮放不下时往上顶到工作区内，不让它掉出可视区。
    const top = Math.max(
      workArea.y,
      workArea.y + workArea.height - height - HUD_RECORD_BOTTOM_OFFSET,
    );
    return {
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(top),
      width,
      height,
    };
  }

  return {
    x: Math.round(workArea.x + workArea.width - width - HUD_EDGE_MARGIN),
    y: Math.round(workArea.y + workArea.height - height - HUD_EDGE_MARGIN),
    width,
    height,
  };
}
