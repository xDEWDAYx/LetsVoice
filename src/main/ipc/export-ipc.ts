import { ipcMain } from 'electron';
import { ExportService } from '../export/ExportService';

ipcMain.handle('Export:note', (_event, request: unknown) => {
  return ExportService.exportNote(request);
});
