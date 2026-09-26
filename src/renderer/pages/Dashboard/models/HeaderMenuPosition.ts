/**
 * 表头下拉菜单的落点。
 *
 * 菜单长在滚动容器（.table-responsive）里，用 absolute 定位会被容器裁掉——
 * 列表区一短，菜单就只露出一点点甚至完全看不见，表现就是「点了没反应」。
 * 改成 fixed 定位，坐标在这里算：纯函数，边界情况直接测。
 */

export type AnchorRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
};

export type MenuPosition = {
  left: number;
  top: number;
  minWidth: number;
};

/** 菜单和屏幕边缘至少留这么多，别贴着窗口边。 */
const VIEWPORT_MARGIN = 8;
/** 菜单与触发按钮之间的缝隙。 */
const ANCHOR_GAP = 6;

export function computeHeaderMenuPosition(
  anchor: AnchorRect,
  viewport: { width: number; height: number },
  menuSize: { width: number; maxHeight: number },
): MenuPosition {
  // 默认挂在按钮正下方；下面放不下就翻到按钮上方
  const below = anchor.bottom + ANCHOR_GAP;
  const fitsBelow =
    below + menuSize.maxHeight <= viewport.height - VIEWPORT_MARGIN;
  const above = anchor.top - ANCHOR_GAP - menuSize.maxHeight;

  let top = fitsBelow ? below : above;
  // 上下都放不下（窗口太矮）时贴着上边缘，至少让前几项看得见
  top = Math.max(VIEWPORT_MARGIN, top);
  top = Math.min(
    top,
    Math.max(
      VIEWPORT_MARGIN,
      viewport.height - VIEWPORT_MARGIN - menuSize.maxHeight,
    ),
  );

  const width = Math.max(menuSize.width, anchor.width);
  // 左对齐按钮，但不许探出右边缘
  const left = Math.min(
    anchor.left,
    Math.max(VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - width),
  );

  return { left: Math.max(VIEWPORT_MARGIN, left), top, minWidth: anchor.width };
}
