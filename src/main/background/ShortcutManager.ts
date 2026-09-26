import { globalShortcut } from 'electron';
import { isValidAccelerator } from '@shared/shortcuts/Accelerator';
import {
  ShortcutAction,
  ShortcutBindings,
  ShortcutStatus,
  SHORTCUT_ACTIONS,
} from '@shared/types/BackgroundTypes';

/**
 * 只用到 globalShortcut 的这几个方法，抽成接口是为了单测时注入假实现——
 * 真的 globalShortcut 只有 app ready 之后才能用。
 */
export type ShortcutHost = {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
  unregisterAll(): void;
};

export type ShortcutHandlers = Record<ShortcutAction, () => void>;

const electronHost: ShortcutHost = {
  register: (accelerator, callback) =>
    globalShortcut.register(accelerator, callback),
  unregister: (accelerator) => globalShortcut.unregister(accelerator),
  unregisterAll: () => globalShortcut.unregisterAll(),
};

/**
 * 全局快捷键的注册与状态。
 *
 * register() 在组合被别的程序占用时是「静默返回 false」，不抛错，
 * 所以这里把结果逐个记下来交给设置页显示，否则用户只会觉得快捷键坏了。
 */
export class ShortcutManager {
  private readonly host: ShortcutHost;

  private registered: string[] = [];

  private status: ShortcutStatus = ShortcutManager.emptyStatus('disabled');

  public constructor(host: ShortcutHost = electronHost) {
    this.host = host;
  }

  private static emptyStatus(
    fill: ShortcutStatus[ShortcutAction],
  ): ShortcutStatus {
    return SHORTCUT_ACTIONS.reduce((acc, action) => {
      acc[action] = fill;
      return acc;
    }, {} as ShortcutStatus);
  }

  public getStatus(): ShortcutStatus {
    return { ...this.status };
  }

  /**
   * 按当前配置重新注册全部快捷键。
   *
   * 每次都先全部注销再注册：改一个键要处理「旧的要撤、新的要上、
   * 别的不动」三种情况，全量重来简单得多，而且这操作很便宜。
   */
  public apply(
    bindings: ShortcutBindings,
    handlers: ShortcutHandlers,
    enabled: boolean = true,
  ): ShortcutStatus {
    this.releaseAll();

    if (!enabled) {
      this.status = ShortcutManager.emptyStatus('inactive');
      return this.getStatus();
    }

    const nextStatus = ShortcutManager.emptyStatus('disabled');
    const taken = new Set<string>();

    SHORTCUT_ACTIONS.forEach((action) => {
      const accelerator = bindings[action];
      if (!accelerator) return;

      if (!isValidAccelerator(accelerator)) {
        nextStatus[action] = 'invalid';
        return;
      }
      // 同一个组合绑了两个动作：第二个当作冲突，避免行为取决于注册顺序
      if (taken.has(accelerator)) {
        nextStatus[action] = 'conflict';
        return;
      }

      let ok = false;
      try {
        ok = this.host.register(accelerator, handlers[action]);
      } catch {
        // Electron 对个别非法组合会抛错而不是返回 false
        ok = false;
      }

      if (ok) {
        taken.add(accelerator);
        this.registered.push(accelerator);
        nextStatus[action] = 'registered';
      } else {
        nextStatus[action] = 'conflict';
      }
    });

    this.status = nextStatus;
    return this.getStatus();
  }

  /** 退出前必须调用，否则组合键会一直被这个进程占着。 */
  public releaseAll(): void {
    this.registered.forEach((accelerator) => {
      try {
        this.host.unregister(accelerator);
      } catch {
        // 已经不存在就算了
      }
    });
    this.registered = [];
  }
}

export default ShortcutManager;
