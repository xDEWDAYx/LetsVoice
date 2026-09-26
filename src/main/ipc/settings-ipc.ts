import { ipcMain, IpcMain } from 'electron';
import { SettingsService } from '../settings/SettingsService';

/**
 * 设置 IPC 只负责 renderer 与 SettingsService 之间的转发。
 * renderer 不直接访问文件系统，避免突破 Electron 进程边界。
 */
class SettingsIpcController {
  private readonly service: SettingsService;

  private readonly ipc: IpcMain;

  public constructor(service = new SettingsService(), ipc: IpcMain = ipcMain) {
    this.service = service;
    this.ipc = ipc;
  }

  public register(): void {
    this.ipc.handle('Settings:get', () => this.service.getSettings());
    this.ipc.handle('Settings:update', (_event, settings: unknown) =>
      this.service.updateSettings(settings),
    );
  }
}

new SettingsIpcController().register();
