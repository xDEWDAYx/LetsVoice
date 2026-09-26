import { ipcMain, IpcMain } from 'electron';
import {
  BackgroundController,
  RecordingHudState,
} from '../background/BackgroundController';
import { ClosePromptChoice } from '../background/CloseBehavior';
import { HudKind } from '../background/HudWindow';

/**
 * 后台常驻相关的 IPC。
 *
 * 控制器由 main.ts 在窗口创建后注入——它需要主窗口的引用，
 * 不能像别的 IPC 那样在模块加载时就自己 new 出来。
 */
let controller: BackgroundController | null = null;

export function setBackgroundController(next: BackgroundController): void {
  controller = next;
}

export function registerBackgroundIpc(ipc: IpcMain = ipcMain): void {
  // 设置页保存后调一次：主进程重新读设置，把托盘和快捷键调到一致，
  // 顺带把每个快捷键的注册结果报回去（被占用了要让用户看见）。
  ipc.handle('Background:apply', () => controller?.apply() ?? null);
  ipc.handle('Background:getStatus', () => controller?.getStatus() ?? null);
  ipc.handle('Background:showWindow', () => {
    controller?.showWindow();
    return true;
  });

  // 应用内的「关窗后怎么处理」弹窗给回来的选择
  ipc.handle(
    'Background:resolveClose',
    (_event, choice: ClosePromptChoice, remember: boolean) => {
      controller?.resolveClosePrompt(choice, Boolean(remember));
      return true;
    },
  );

  // 浮窗自己决定什么时候消失（淡出动画放完、用户点了关闭、Esc）
  ipc.handle('Hud:close', (_event, kind: HudKind) => {
    controller?.closeHud(kind);
    return true;
  });

  // 录音浮窗上的「完成」（✓）
  ipc.handle('Hud:stopRecording', () => {
    controller?.stopQuickRecord();
    return true;
  });

  // 录音浮窗上的「取消」（✕）：丢掉这段，不打开主界面
  ipc.handle('Hud:cancelRecording', () => {
    controller?.cancelQuickRecord();
    return true;
  });

  // 主窗口把录音状态报上来，主进程转给录音浮窗
  ipc.handle('Hud:reportRecording', (_event, state: RecordingHudState) => {
    controller?.reportRecordingState(state);
    return true;
  });
}

registerBackgroundIpc();
