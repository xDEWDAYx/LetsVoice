/**
 * 后台常驻（托盘 + 全局快捷键）的共享契约。
 *
 * 主进程和渲染层都要用同一套取值：设置页负责录入，主进程负责注册。
 * 放在 shared 下，避免两边各写一份枚举然后慢慢漂移。
 */

/** 关闭主窗口时的行为。 */
export type CloseAction =
  /** 最小化到系统托盘，程序继续在后台跑 */
  | 'tray'
  /** 直接退出 */
  | 'quit'
  /** 每次询问（询问框里可以勾「记住我的选择」） */
  | 'ask';

export const CLOSE_ACTIONS: CloseAction[] = ['ask', 'tray', 'quit'];

/** 可以绑定全局快捷键的动作。 */
export type ShortcutAction = 'dashboardHud' | 'todoHud' | 'quickRecord';

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  'dashboardHud',
  'todoHud',
  'quickRecord',
];

/** null 表示这个动作没有绑定快捷键。 */
export type ShortcutBindings = Record<ShortcutAction, string | null>;

export type BackgroundSettings = {
  closeAction: CloseAction;
  /** 关掉之后不驻留托盘，全局快捷键也一并失效。 */
  trayEnabled: boolean;
  shortcuts: ShortcutBindings;
};

/**
 * 每个快捷键的实际状态，注册结果只有主进程知道。
 * - registered：已生效
 * - disabled：用户没绑
 * - conflict：系统或别的程序已经占用了这个组合
 * - invalid：字符串不是合法的加速键
 * - inactive：后台常驻关着，没去注册
 */
export type ShortcutState =
  | 'registered'
  | 'disabled'
  | 'conflict'
  | 'invalid'
  | 'inactive';

export type ShortcutStatus = Record<ShortcutAction, ShortcutState>;

export type BackgroundStatus = {
  /** 托盘是否真的驻留着 */
  trayActive: boolean;
  shortcuts: ShortcutStatus;
};

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  // 默认「每次询问」：不问一声就常驻后台，对不知情的用户不友好；
  // 询问框里勾一次「记住选择」就不会再打扰。
  closeAction: 'ask',
  trayEnabled: true,
  shortcuts: {
    dashboardHud: 'CommandOrControl+Alt+D',
    todoHud: 'CommandOrControl+Alt+T',
    quickRecord: 'CommandOrControl+Alt+R',
  },
};
