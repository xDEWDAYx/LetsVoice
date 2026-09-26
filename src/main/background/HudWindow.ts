import path from 'path';
import { app, BrowserWindow, screen } from 'electron';
import { computeHudBounds, HUD_SIZES, HudKind } from '@shared/hud/HudLayout';
import { resolveHtmlPath } from '../util';

// 尺寸和落点搬到了 @shared/hud/HudLayout：新手引导要在主界面上原样摆一个
// 浮窗出来，两边必须用同一份常量。这里转出去，老的引用路径不用动。
export { computeHudBounds, HUD_SIZES };
export type { HudKind, HudSize, WorkArea } from '@shared/hud/HudLayout';

function preloadPath(): string {
  return app.isPackaged
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, '../../.erb/dll/preload.js');
}

/**
 * 轻量浮窗：无边框、透明、置顶、不进任务栏。
 *
 * 用的是同一个渲染包（hash 路由 #/hud/xxx），设计令牌、i18n、IPC 全都现成，
 * 不必为浮窗另起一套前端。
 */
/** 窗口被重新显示时通知渲染层：重新取数、重置自动淡出计时。 */
export const HUD_SHOWN_CHANNEL = 'Hud:shown';

export class HudWindowManager {
  private readonly windows = new Map<HudKind, BrowserWindow>();

  public isOpen(kind: HudKind): boolean {
    const window = this.windows.get(kind);
    return Boolean(window && !window.isDestroyed());
  }

  /**
   * 预热：提前把三个浮窗建好但不显示。
   *
   * 现建现显要等整个渲染包加载完，实测按下快捷键要一秒左右才出来；
   * 预热之后按键只是「摆位 + showInactive」，是即时的。
   * 代价是三个常驻的隐藏渲染进程，换的是快捷键该有的响应速度。
   */
  public prewarm(kinds: HudKind[] = ['stats', 'todos', 'record']): void {
    kinds.forEach((kind) => {
      if (this.windows.has(kind)) return;
      this.create(kind);
    });
  }

  public open(kind: HudKind): BrowserWindow {
    const existing = this.windows.get(kind);
    if (existing && !existing.isDestroyed()) {
      HudWindowManager.place(kind, existing);
      // 先让页面知道自己又被叫出来了（重新取数、重置淡出计时），
      // 再显示；否则会先闪一眼上次的旧数据。
      existing.webContents.send(HUD_SHOWN_CHANNEL, Date.now());
      // showInactive：浮窗不抢焦点，用户还在别的程序里打字就不该被打断
      existing.showInactive();
      return existing;
    }

    const window = this.create(kind);
    window.once('ready-to-show', () => {
      window.webContents.send(HUD_SHOWN_CHANNEL, Date.now());
      window.showInactive();
    });
    return window;
  }

  private create(kind: HudKind): BrowserWindow {
    const window = new BrowserWindow({
      ...computeHudBounds(kind, screen.getPrimaryDisplay().workArea),
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // 录音状态要能点「停止」，另外两个只是看一眼，不接受焦点
      focusable: kind === 'record',
      webPreferences: {
        preload: preloadPath(),
        // 浮窗常常不在前台，节流会让波纹动画和计时卡住
        backgroundThrottling: false,
      },
    });

    // screen-saver 这一层能盖住全屏播放的视频，普通置顶盖不住
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    window.loadURL(`${resolveHtmlPath('index.html')}#/hud/${kind}`);
    window.on('closed', () => this.windows.delete(kind));

    this.windows.set(kind, window);
    return window;
  }

  /** 每次呼出都重新摆位：用户可能换了主屏或改了分辨率。 */
  private static place(kind: HudKind, window: BrowserWindow): void {
    window.setBounds(
      computeHudBounds(kind, screen.getPrimaryDisplay().workArea),
    );
  }

  public send(kind: HudKind, channel: string, payload: unknown): void {
    const window = this.windows.get(kind);
    if (!window || window.isDestroyed()) return;
    window.webContents.send(channel, payload);
  }

  /**
   * 收起浮窗＝隐藏而不是销毁。
   *
   * 销毁了下次呼出又要重新加载整个渲染包，就回到「按下去等一秒」了。
   */
  public close(kind: HudKind): void {
    const window = this.windows.get(kind);
    if (!window || window.isDestroyed()) return;
    window.hide();
  }

  /** 真正销毁，只在退出时用。 */
  public destroyAll(): void {
    [...this.windows.values()].forEach((window) => {
      if (!window.isDestroyed()) window.destroy();
    });
    this.windows.clear();
  }

  public closeAll(): void {
    [...this.windows.keys()].forEach((kind) => this.close(kind));
  }
}

export default HudWindowManager;
