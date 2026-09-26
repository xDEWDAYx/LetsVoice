import { BrowserWindow, ipcMain } from 'electron';
import ollamaServerController from '../llm/OllamaRuntime';
import OllamaEmbeddingService from '../semantic/OllamaEmbeddingService';
import SemanticNoteService from '../semantic/SemanticNoteService';

const embeddingService = new OllamaEmbeddingService();
const semanticNoteService = new SemanticNoteService(
  undefined,
  undefined,
  embeddingService,
);

ipcMain.handle('Semantic:getStatus', () => embeddingService.getStatus());

ipcMain.handle('Semantic:installModel', async () => {
  await ollamaServerController.ensureRunning();
  return embeddingService.install((progress) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('Semantic:installProgress', progress);
    });
  });
});

ipcMain.handle(
  'Semantic:search',
  async (_event, query: unknown, workspaceId: unknown, topK: unknown) => {
    await ollamaServerController.ensureRunning();
    return semanticNoteService.search(query, workspaceId, topK);
  },
);
