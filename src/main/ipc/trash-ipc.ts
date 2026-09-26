import { ipcMain, IpcMain } from 'electron';
import TrashService from '../trash/TrashService';

/** Renderer access to recoverable and irreversible content lifecycle actions. */
class TrashIpcController {
  private readonly service: TrashService;

  private readonly ipc: IpcMain;

  public constructor(service = new TrashService(), ipc: IpcMain = ipcMain) {
    this.service = service;
    this.ipc = ipc;
  }

  public register(): void {
    this.ipc.handle('Trash:list', (_event, query: unknown) =>
      this.service.list(query),
    );
    this.ipc.handle('Trash:count', () => this.service.count());
    this.ipc.handle('Trash:moveNote', (_event, id: unknown) =>
      this.service.moveNote(id),
    );
    this.ipc.handle('Trash:moveConversation', (_event, id: unknown) =>
      this.service.moveConversation(id),
    );
    this.ipc.handle('Trash:moveTemplate', (_event, id: unknown) =>
      this.service.moveTemplate(id),
    );
    this.ipc.handle('Trash:moveWorkspace', (_event, id: unknown) =>
      this.service.moveWorkspace(id),
    );
    this.ipc.handle('Trash:restore', (_event, target: unknown) =>
      this.service.restore(target),
    );
    this.ipc.handle('Trash:permanentlyDelete', (_event, target: unknown) =>
      this.service.permanentlyDelete(target),
    );
  }
}

new TrashIpcController().register();
