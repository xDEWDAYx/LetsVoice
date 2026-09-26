import { Menu, MenuItemConstructorOptions, Tray, nativeImage } from 'electron';
import { formatAccelerator } from '@shared/shortcuts/Accelerator';
import { ShortcutBindings } from '@shared/types/BackgroundTypes';
import { BackgroundLabels } from './BackgroundLabels';

export type TrayActions = {
  showMainWindow(): void;
  openDashboard(): void;
  openTodos(): void;
  startQuickRecord(): void;
  openSettings(): void;
  quit(): void;
};

/**
 * 托盘菜单模板。
 *
 * 抽成纯函数：菜单项的顺序、启用状态、快捷键提示都是会出错的地方，
 * 这样能直接断言，不必把 Electron 拉起来。
 */
export function buildTrayMenuTemplate(
  labels: BackgroundLabels,
  shortcuts: ShortcutBindings,
  actions: TrayActions,
  platform: string = process.platform,
): MenuItemConstructorOptions[] {
  // 菜单里的快捷键只是提示：真正生效的是 globalShortcut 注册的那一份，
  // 这里若用 accelerator 字段，Electron 会再注册一次本地快捷键。
  const hint = (accelerator: string | null) =>
    accelerator ? `    ${formatAccelerator(accelerator, platform)}` : '';

  return [
    { label: labels.trayShow, click: actions.showMainWindow },
    { type: 'separator' },
    {
      label: `${labels.trayDashboard}${hint(shortcuts.dashboardHud)}`,
      click: actions.openDashboard,
    },
    {
      label: `${labels.trayTodos}${hint(shortcuts.todoHud)}`,
      click: actions.openTodos,
    },
    {
      label: `${labels.trayQuickRecord}${hint(shortcuts.quickRecord)}`,
      click: actions.startQuickRecord,
    },
    { type: 'separator' },
    { label: labels.traySettings, click: actions.openSettings },
    { label: labels.trayQuit, click: actions.quit },
  ];
}

/**
 * 系统托盘图标。
 *
 * 只在「后台常驻」打开时存在；关掉设置或退出程序时必须 destroy，
 * 否则 Windows 通知区域会留下一个点不动的残影图标。
 */
export class TrayController {
  private tray: Tray | null = null;

  private readonly iconPath: string;

  public constructor(iconPath: string) {
    this.iconPath = iconPath;
  }

  public isActive(): boolean {
    return this.tray !== null;
  }

  public show(
    labels: BackgroundLabels,
    shortcuts: ShortcutBindings,
    actions: TrayActions,
  ): void {
    if (!this.tray) {
      const image = nativeImage.createFromPath(this.iconPath);
      // 托盘图标要小，直接塞 1024px 的原图在部分系统上会糊
      this.tray = new Tray(
        image.isEmpty() ? image : image.resize({ width: 16, height: 16 }),
      );
      this.tray.on('click', actions.showMainWindow);
      this.tray.on('double-click', actions.showMainWindow);
    }

    this.tray.setToolTip(labels.trayTooltip);
    this.tray.setContextMenu(
      Menu.buildFromTemplate(buildTrayMenuTemplate(labels, shortcuts, actions)),
    );
  }

  public hide(): void {
    if (!this.tray) return;
    this.tray.destroy();
    this.tray = null;
  }
}

export default TrayController;
