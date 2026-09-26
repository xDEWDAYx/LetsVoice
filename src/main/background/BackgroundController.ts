import { BrowserWindow, dialog } from 'electron';
import {
  BackgroundStatus,
  CloseAction,
  ShortcutAction,
} from '@shared/types/BackgroundTypes';
import { AppSettings, SettingsService } from '../settings/SettingsService';
import { backgroundLabels } from './BackgroundLabels';
import {
  CLOSE_PROMPT_BUTTONS,
  ClosePromptChoice,
  ClosePromptOutcome,
  decideCloseAction,
  interpretCloseChoice,
  interpretClosePrompt,
} from './CloseBehavior';
import { HudKind, HudWindowManager } from './HudWindow';
import { ShortcutManager } from './ShortcutManager';
import { TrayController, TrayActions } from './TrayController';

/** 主进程把这些请求发给主窗口的渲染层去执行。 */
export type BackgroundRequest =
  | { type: 'navigate'; path: string }
  | { type: 'startQuickRecord' }
  | { type: 'stopQuickRecord' }
  | { type: 'cancelQuickRecord' }
  /** 请渲染层用应用自己的弹窗来问「关窗后怎么处理」。 */
  | { type: 'confirmClose' };

/** 渲染层没应答（卡死、异常）多久之后退回系统弹窗。 */
const CLOSE_PROMPT_TIMEOUT_MS = 6000;

export const BACKGROUND_REQUEST_CHANNEL = 'Background:request';
/** 录音状态从主窗口发给主进程，再转给录音浮窗。 */
export const HUD_RECORDING_CHANNEL = 'Hud:recording';

export type RecordingHudState = {
  active: boolean;
  /** 开始时刻（epoch ms），浮窗据此自己算已录时长。 */
  startedAt: number | null;
  error?: string | null;
};

/**
 * 后台常驻的总控：托盘、全局快捷键、关窗策略。
 *
 * 窗口只隐藏不销毁——录音走的是渲染层的 MediaRecorder，
 * 窗口没了就录不了音，「后台常驻」也就无从谈起。
 */
export class BackgroundController {
  private readonly settingsService: SettingsService;

  private readonly tray: TrayController;

  private readonly shortcuts: ShortcutManager;

  private readonly hud: HudWindowManager;

  private window: BrowserWindow | null = null;

  /** 当前是否正在快捷录音，决定 Ctrl+Alt+R 是开始还是停止。 */
  private recording = false;

  /** 用户真的要退出（菜单/托盘/系统关机），此时不再拦 close。 */
  private quitting = false;

  /** 询问框一次只弹一个，连点关闭不该叠出好几个。 */
  private prompting = false;

  private promptTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    settingsService: SettingsService,
    tray: TrayController,
    shortcuts: ShortcutManager = new ShortcutManager(),
    hud: HudWindowManager = new HudWindowManager(),
  ) {
    this.settingsService = settingsService;
    this.tray = tray;
    this.shortcuts = shortcuts;
    this.hud = hud;
  }

  public attachWindow(window: BrowserWindow): void {
    this.window = window;
    window.on('close', (event) => this.handleClose(event));
  }

  public isQuitting(): boolean {
    return this.quitting;
  }

  /** 托盘是否驻留着——window-all-closed 要据此决定退不退出。 */
  public isBackgroundActive(): boolean {
    return this.tray.isActive();
  }

  public beginQuit(): void {
    this.quitting = true;
  }

  public getStatus(): BackgroundStatus {
    return {
      trayActive: this.tray.isActive(),
      shortcuts: this.shortcuts.getStatus(),
    };
  }

  /** 读一次设置，把托盘和快捷键调整到与之一致。设置页保存后会再调一次。 */
  public apply(): BackgroundStatus {
    const settings = this.settingsService.getSettings();
    const { background } = settings;

    if (background.trayEnabled) {
      this.tray.show(
        backgroundLabels(settings.language),
        background.shortcuts,
        this.trayActions(),
      );
    } else {
      this.tray.hide();
    }

    this.shortcuts.apply(
      background.shortcuts,
      {
        dashboardHud: () => this.runAction('dashboardHud'),
        todoHud: () => this.runAction('todoHud'),
        quickRecord: () => this.runAction('quickRecord'),
      },
      background.trayEnabled,
    );

    return this.getStatus();
  }

  /**
   * 提前把浮窗建好（隐藏着），按下快捷键时才是即时弹出。
   * 放在主窗口加载完之后调用，别和启动抢资源。
   */
  public prewarmHud(): void {
    this.hud.prewarm();
  }

  /** 退出前收尾：不注销快捷键的话，组合键会一直被这个进程占着。 */
  public dispose(): void {
    this.shortcuts.releaseAll();
    this.hud.destroyAll();
    this.tray.hide();
  }

  public openHud(kind: HudKind): void {
    this.hud.open(kind);
  }

  public closeHud(kind: HudKind): void {
    this.hud.close(kind);
  }

  private trayActions(): TrayActions {
    return {
      showMainWindow: () => this.showWindow(),
      openDashboard: () => this.runAction('dashboardHud'),
      openTodos: () => this.runAction('todoHud'),
      startQuickRecord: () => this.runAction('quickRecord'),
      openSettings: () => this.send({ type: 'navigate', path: '/Settings' }),
      quit: () => {
        this.quitting = true;
        this.window?.close();
        // 窗口可能已经被销毁，兜底直接退
        if (!this.window || this.window.isDestroyed()) {
          this.dispose();
        }
      },
    };
  }

  /**
   * 快捷键 / 托盘触发的动作。
   *
   * 一律走浮窗，不打开主界面：这些操作的价值就在于「瞥一眼就走」，
   * 为了看四个数字把整个应用顶到前台反而更慢。
   */
  private runAction(action: ShortcutAction): void {
    if (action === 'quickRecord') {
      this.toggleQuickRecord();
      return;
    }
    this.hud.open(action === 'todoHud' ? 'todos' : 'stats');
  }

  /**
   * 同一个快捷键控制开始 / 停止。
   *
   * 录音本身跑在主窗口的渲染层（MediaRecorder 在那儿），主窗口可以是隐藏的；
   * 浮窗只负责显示状态和「停止」按钮。
   */
  public toggleQuickRecord(): void {
    if (this.recording) {
      this.stopQuickRecord();
      return;
    }
    this.recording = true;
    this.hud.open('record');
    this.send({ type: 'startQuickRecord' });
    this.sendRecordingState({ active: true, startedAt: Date.now() });
  }

  /** 完成：停止录音、收起浮窗、把主界面拿到前台走转录流程。 */
  public stopQuickRecord(): void {
    this.recording = false;
    this.hud.close('record');
    // 复核 / 转录弹窗在主窗口里，这一步必须把主界面拿到前台
    this.showWindow();
    this.send({ type: 'stopQuickRecord' });
  }

  /** 取消：丢掉这段录音，不转录也不打开主界面。 */
  public cancelQuickRecord(): void {
    this.recording = false;
    this.hud.close('record');
    this.send({ type: 'cancelQuickRecord' });
  }

  /** 主窗口报上来的录音状态，转给录音浮窗。 */
  public reportRecordingState(state: RecordingHudState): void {
    this.recording = state.active;
    if (!state.active) {
      this.hud.close('record');
      return;
    }
    this.sendRecordingState(state);
  }

  private sendRecordingState(state: RecordingHudState): void {
    this.hud.send('record', HUD_RECORDING_CHANNEL, state);
  }

  private send(request: BackgroundRequest): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(BACKGROUND_REQUEST_CHANNEL, request);
  }

  public showWindow(): void {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.window.isMinimized()) this.window.restore();
    if (!this.window.isVisible()) this.window.show();
    this.window.focus();
  }

  private hideWindow(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.hide();
  }

  private handleClose(event: { preventDefault(): void }): void {
    const settings = this.settingsService.getSettings();
    const decision = decideCloseAction({
      quitting: this.quitting,
      settings: settings.background,
    });

    if (decision === 'quit') {
      this.quitting = true;
      this.dispose();
      return;
    }

    // 到这里都不是真的要关窗，先把默认行为拦下来
    event.preventDefault();

    if (decision === 'hide') {
      this.hideWindow();
      return;
    }

    this.askOnClose(settings);
  }

  /**
   * 「每次询问」：交给渲染层用应用自己的弹窗来问，样式和整个应用一致。
   *
   * 渲染层万一没应答（崩了、卡住），几秒后退回系统弹窗——
   * 不留后路的话窗口就永远关不掉了。
   */
  private askOnClose(settings: AppSettings): void {
    if (this.prompting || !this.window) return;
    this.prompting = true;

    // 弹窗在窗口里，窗口得看得见
    this.showWindow();
    this.send({ type: 'confirmClose' });

    this.promptTimer = setTimeout(() => {
      this.promptTimer = null;
      this.prompting = false;
      this.askOnCloseNative(settings);
    }, CLOSE_PROMPT_TIMEOUT_MS);
  }

  /** 渲染层弹窗给回来的选择。 */
  public resolveClosePrompt(
    choice: ClosePromptChoice,
    remember: boolean,
  ): void {
    if (!this.prompting) return;
    if (this.promptTimer) {
      clearTimeout(this.promptTimer);
      this.promptTimer = null;
    }
    this.prompting = false;
    this.applyCloseOutcome(
      interpretCloseChoice(choice, remember),
      this.settingsService.getSettings(),
    );
  }

  private applyCloseOutcome(
    outcome: ClosePromptOutcome,
    settings: AppSettings,
  ): void {
    if (outcome.remember) {
      this.rememberCloseAction(settings, outcome.remember);
    }
    if (outcome.decision === 'hide') this.hideWindow();
    if (outcome.decision === 'quit') {
      this.quitting = true;
      this.dispose();
      this.window?.close();
    }
  }

  /** 兜底用的系统弹窗，只有渲染层没应答时才会走到。 */
  private askOnCloseNative(settings: AppSettings): void {
    if (this.prompting || !this.window) return;
    this.prompting = true;

    const labels = backgroundLabels(settings.language);
    dialog
      .showMessageBox(this.window, {
        type: 'question',
        title: labels.closeTitle,
        message: labels.closeMessage,
        detail: labels.closeDetail,
        buttons: [labels.closeToTray, labels.closeQuit, labels.closeCancel],
        defaultId: CLOSE_PROMPT_BUTTONS.indexOf('tray'),
        cancelId: CLOSE_PROMPT_BUTTONS.indexOf('cancel'),
        checkboxLabel: labels.closeRemember,
        checkboxChecked: false,
        noLink: true,
      })
      .then((result) => {
        this.applyCloseOutcome(interpretClosePrompt(result), settings);
        return null;
      })
      .catch(() => {
        // 对话框弹不出来时按最保守的处理：什么都不做，窗口留着
      })
      .finally(() => {
        this.prompting = false;
      });
  }

  private rememberCloseAction(
    settings: AppSettings,
    action: CloseAction,
  ): void {
    try {
      this.settingsService.updateSettings({
        ...settings,
        background: { ...settings.background, closeAction: action },
      });
    } catch {
      // 记不住就下次再问，不影响这次关窗
    }
  }
}

export default BackgroundController;
