import { ipcMain } from 'electron';
import { DashboardService } from '../dashboard/DashboardService';
import { TodoExtractionService } from '../dashboard/TodoExtractionService';

class DashboardIpcController {
  private service: DashboardService;

  private extractionService: TodoExtractionService;

  public constructor() {
    this.service = new DashboardService();
    this.extractionService = new TodoExtractionService();
  }

  public register(): void {
    ipcMain.handle('Dashboard:getDashboardOverview', () => {
      return this.service.getDashboardOverview();
    });

    ipcMain.handle(
      'Dashboard:extractTodosForNote',
      async (event, noteId: number) => {
        return this.extractionService.extractTodosForNote(noteId);
      },
    );

    // 只补分类、不重跑待办提取：给历史笔记用。
    ipcMain.handle('Dashboard:classifyPendingNotes', async () => {
      return this.service.classifyPendingNotes();
    });

    ipcMain.handle(
      'Dashboard:setTodoCompleted',
      (_event, todoId: number, isCompleted: boolean) =>
        this.service.setTodoCompleted(todoId, Boolean(isCompleted)),
    );

    ipcMain.handle(
      'Dashboard:setTodoPinned',
      (_event, todoId: number, isPinned: boolean) =>
        this.service.setTodoPinned(todoId, Boolean(isPinned)),
    );

    ipcMain.handle(
      'Dashboard:toggleNotePin',
      async (event, noteId: number, isPinned: boolean) => {
        return this.service.toggleNotePin(noteId, isPinned);
      },
    );
  }
}

new DashboardIpcController().register();
