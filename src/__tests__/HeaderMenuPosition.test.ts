import { computeHeaderMenuPosition } from '../renderer/pages/Dashboard/models/HeaderMenuPosition';

const viewport = { width: 1440, height: 900 };
const menu = { width: 132, maxHeight: 260 };

const anchor = (left: number, top: number, width = 90, height = 24) => ({
  left,
  right: left + width,
  top,
  bottom: top + height,
  width,
});

describe('表头下拉的落点', () => {
  it('默认挂在按钮正下方，留一点缝', () => {
    const pos = computeHeaderMenuPosition(anchor(400, 120), viewport, menu);

    expect(pos.top).toBe(120 + 24 + 6);
    expect(pos.left).toBe(400);
  });

  it('下方放不下就翻到按钮上方', () => {
    // 按钮在很靠下的位置：下面塞不进 260 高的菜单
    const pos = computeHeaderMenuPosition(anchor(400, 800), viewport, menu);

    expect(pos.top).toBeLessThan(800);
    expect(pos.top + menu.maxHeight).toBeLessThanOrEqual(800);
  });

  it('窗口太矮时贴上边缘，至少让前几项看得见', () => {
    const shortViewport = { width: 1440, height: 200 };
    const pos = computeHeaderMenuPosition(
      anchor(400, 100),
      shortViewport,
      menu,
    );

    expect(pos.top).toBe(8);
  });

  it('靠右的按钮不让菜单探出右边缘', () => {
    const pos = computeHeaderMenuPosition(anchor(1400, 120), viewport, menu);

    expect(pos.left + menu.width).toBeLessThanOrEqual(1440 - 8);
  });

  it('菜单至少和按钮一样宽', () => {
    const pos = computeHeaderMenuPosition(
      anchor(400, 120, 180),
      viewport,
      menu,
    );

    expect(pos.minWidth).toBe(180);
  });

  it('永远不会算出负坐标', () => {
    const pos = computeHeaderMenuPosition(
      anchor(-50, -30),
      { width: 320, height: 120 },
      menu,
    );

    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.top).toBeGreaterThanOrEqual(0);
  });
});
