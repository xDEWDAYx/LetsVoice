import { ipcMain } from 'electron';

import ollamaServerController from '../llm/OllamaRuntime';
import StructuredNoteService from '../workflow/StructuredNoteService';
import WorkflowService from '../workflow/WorkflowService';
import TrashService from '../trash/TrashService';

const workflowService = new WorkflowService();
const structuredNoteService = new StructuredNoteService();
const trashService = new TrashService();

ipcMain.handle('Workflow:getKnowledgeTemplateList', () => {
  return workflowService.listTemplates();
});

ipcMain.handle('Workflow:getScenarioTemplateList', (_event, language) => {
  return workflowService.listScenarioTemplates(language);
});

ipcMain.handle('Workflow:getKnowledgeTemplateById', (_event, id: number) => {
  return workflowService.getTemplate(id);
});

ipcMain.handle(
  'Workflow:createKnowledgeTemplate',
  async (_event, name: string, prompt: string, language) => {
    await ollamaServerController.ensureRunning();
    return workflowService.createTemplate(name, prompt, language);
  },
);

ipcMain.handle(
  'Workflow:updateKnowledgeTemplate',
  async (_event, id: number, name: string, prompt: string, language) => {
    await ollamaServerController.ensureRunning();
    return workflowService.updateTemplate(id, name, prompt, language);
  },
);

ipcMain.handle('Workflow:deleteKnowledgeTemplate', (_event, id: number) => {
  // Compatibility for older renderer bundles: deletion now always means
  // moving the template into the shared Trash lifecycle.
  return trashService.moveTemplate(id);
});

ipcMain.handle('Workflow:getKnowledgeOutputs', (_event, noteId: number) => {
  return structuredNoteService.listOutputs(noteId);
});

// 生成前按需启动本机 Ollama；生成结果由主进程直接保存，Renderer 不接触数据库。
ipcMain.handle(
  'Workflow:generateKnowledgeOutput',
  async (_event, noteId: number, templateId: number) => {
    await ollamaServerController.ensureRunning();
    return structuredNoteService.generate(noteId, templateId);
  },
);
