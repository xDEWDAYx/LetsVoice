import {
  BackgroundSettings,
  DEFAULT_BACKGROUND_SETTINGS,
  ShortcutBindings,
} from '@shared/types/BackgroundTypes';
import {
  ShortcutManager,
  ShortcutHost,
} from '../main/background/ShortcutManager';
import {
  decideCloseAction,
  interpretCloseChoice,
  interpretClosePrompt,
} from '../main/background/CloseBehavior';
import { buildTrayMenuTemplate } from '../main/background/TrayController';
import { backgroundLabels } from '../main/background/BackgroundLabels';

const handlers = {
  dashboardHud: jest.fn(),
  todoHud: jest.fn(),
  quickRecord: jest.fn(),
};

/** 假的 globalShortcut：可以指定哪些组合「已被别人占用」。 */
function makeHost(taken: string[] = []): ShortcutHost & {
  registered: Map<string, () => void>;
} {
  const registered = new Map<string, () => void>();
  return {
    registered,
    register(accelerator: string, callback: () => void) {
      if (taken.includes(accelerator)) return false;
      registered.set(accelerator, callback);
      return true;
    },
    unregister(accelerator: string) {
      registered.delete(accelerator);
    },
    unregisterAll() {
      registered.clear();
    },
  };
}

const bindings = (partial: Partial<ShortcutBindings>): ShortcutBindings => ({
  dashboardHud: null,
  todoHud: null,
  quickRecord: null,
  ...partial,
});

describe('ShortcutManager', () => {
  it('把配置好的组合注册上，并报告每个的结果', () => {
    const host = makeHost();
    const manager = new ShortcutManager(host);

    const status = manager.apply(
      DEFAULT_BACKGROUND_SETTINGS.shortcuts,
      handlers,
    );

    expect(status).toEqual({
      dashboardHud: 'registered',
      todoHud: 'registered',
      quickRecord: 'registered',
    });
    expect(host.registered.size).toBe(3);
  });

  it('组合被别的程序占用时标成 conflict，而不是静默失败', () => {
    // register() 返回 false 不抛错，不报出来用户只会觉得快捷键坏了
    const host = makeHost(['CommandOrControl+Alt+D']);
    const manager = new ShortcutManager(host);

    const status = manager.apply(
      DEFAULT_BACKGROUND_SETTINGS.shortcuts,
      handlers,
    );

    expect(status.dashboardHud).toBe('conflict');
    expect(status.todoHud).toBe('registered');
  });

  it('没绑的算 disabled，非法字符串算 invalid 且不去注册', () => {
    const host = makeHost();
    const manager = new ShortcutManager(host);

    const status = manager.apply(
      bindings({ dashboardHud: null, todoHud: 'Ctrl+' }),
      handlers,
    );

    expect(status.dashboardHud).toBe('disabled');
    expect(status.todoHud).toBe('invalid');
    expect(host.registered.size).toBe(0);
  });

  it('同一个组合绑两个动作时，后一个算冲突', () => {
    const host = makeHost();
    const manager = new ShortcutManager(host);

    const status = manager.apply(
      bindings({ dashboardHud: 'Alt+D', todoHud: 'Alt+D' }),
      handlers,
    );

    expect(status.dashboardHud).toBe('registered');
    expect(status.todoHud).toBe('conflict');
  });

  it('后台常驻关掉时一个都不注册', () => {
    const host = makeHost();
    const manager = new ShortcutManager(host);

    const status = manager.apply(
      DEFAULT_BACKGROUND_SETTINGS.shortcuts,
      handlers,
      false,
    );

    expect(status.dashboardHud).toBe('inactive');
    expect(host.registered.size).toBe(0);
  });

  it('重新应用时先撤掉旧的，不会把旧组合留在系统里', () => {
    const host = makeHost();
    const manager = new ShortcutManager(host);

    manager.apply(bindings({ dashboardHud: 'Alt+D' }), handlers);
    manager.apply(bindings({ dashboardHud: 'Alt+G' }), handlers);

    expect([...host.registered.keys()]).toEqual(['Alt+G']);
  });

  it('releaseAll 之后系统里不留任何注册', () => {
    const host = makeHost();
    const manager = new ShortcutManager(host);

    manager.apply(DEFAULT_BACKGROUND_SETTINGS.shortcuts, handlers);
    manager.releaseAll();

    expect(host.registered.size).toBe(0);
  });
});

describe('decideCloseAction', () => {
  const settings = (
    partial: Partial<BackgroundSettings>,
  ): BackgroundSettings => ({ ...DEFAULT_BACKGROUND_SETTINGS, ...partial });

  it('已经在退出流程里就放行，否则关不掉', () => {
    expect(
      decideCloseAction({
        quitting: true,
        settings: settings({ closeAction: 'tray' }),
      }),
    ).toBe('quit');
  });

  it('没开托盘就只能退出——没有地方可最小化', () => {
    expect(
      decideCloseAction({
        quitting: false,
        settings: settings({ closeAction: 'tray', trayEnabled: false }),
      }),
    ).toBe('quit');
  });

  it('按用户选的行为走', () => {
    expect(
      decideCloseAction({
        quitting: false,
        settings: settings({ closeAction: 'tray' }),
      }),
    ).toBe('hide');
    expect(
      decideCloseAction({
        quitting: false,
        settings: settings({ closeAction: 'quit' }),
      }),
    ).toBe('quit');
    expect(
      decideCloseAction({
        quitting: false,
        settings: settings({ closeAction: 'ask' }),
      }),
    ).toBe('ask');
  });
});

describe('interpretClosePrompt', () => {
  it('第一个按钮是最小化，勾了记住就写回 tray', () => {
    expect(
      interpretClosePrompt({ response: 0, checkboxChecked: true }),
    ).toEqual({ decision: 'hide', remember: 'tray' });
  });

  it('第二个按钮是退出；没勾记住就不改设置', () => {
    expect(
      interpretClosePrompt({ response: 1, checkboxChecked: false }),
    ).toEqual({ decision: 'quit', remember: null });
  });

  it('取消（含直接关掉对话框）什么都不做', () => {
    expect(
      interpretClosePrompt({ response: 2, checkboxChecked: true }),
    ).toEqual({ decision: 'cancel', remember: null });
    expect(
      interpretClosePrompt({ response: 99, checkboxChecked: false }),
    ).toEqual({ decision: 'cancel', remember: null });
  });
});

describe('buildTrayMenuTemplate', () => {
  const actions = {
    showMainWindow: jest.fn(),
    openDashboard: jest.fn(),
    openTodos: jest.fn(),
    startQuickRecord: jest.fn(),
    openSettings: jest.fn(),
    quit: jest.fn(),
  };

  it('菜单项齐全，快捷键作为提示写在标签里', () => {
    const template = buildTrayMenuTemplate(
      backgroundLabels('zh'),
      DEFAULT_BACKGROUND_SETTINGS.shortcuts,
      actions,
      'win32',
    );
    const labels = template.map((item) => item.label ?? '(sep)');

    expect(labels[0]).toBe('显示主界面');
    expect(labels.some((label) => label.includes('Ctrl+Alt+D'))).toBe(true);
    expect(labels[labels.length - 1]).toBe('退出 SpeakSpace Local');
    // accelerator 字段不能用：Electron 会据此再注册一次本地快捷键
    expect(template.every((item) => item.accelerator === undefined)).toBe(true);
  });

  it('没绑快捷键的项不显示提示', () => {
    const template = buildTrayMenuTemplate(
      backgroundLabels('en'),
      bindings({}),
      actions,
      'win32',
    );

    expect(template.some((item) => (item.label ?? '').includes('Ctrl'))).toBe(
      false,
    );
  });
});

describe('应用内弹窗给回来的选择', () => {
  it('最小化到托盘＝隐藏窗口', () => {
    expect(interpretCloseChoice('tray', false)).toEqual({
      decision: 'hide',
      remember: null,
    });
  });

  it('勾了记住就把这次的选择写回设置', () => {
    expect(interpretCloseChoice('quit', true)).toEqual({
      decision: 'quit',
      remember: 'quit',
    });
  });

  it('取消什么都不做——即使勾了记住也不该改设置', () => {
    expect(interpretCloseChoice('cancel', true)).toEqual({
      decision: 'cancel',
      remember: null,
    });
  });
});
