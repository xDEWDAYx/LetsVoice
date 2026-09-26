import { ipcMain } from 'electron';
import type {
  KnowledgeScenario,
  ScenarioTemplateSelection,
} from '@shared/types/KnowledgeGenerationTypes';
import { knowledgeGenerationService } from '../knowledge/KnowledgeGenerationService';

const id = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error('Invalid note id.');
  return parsed;
};
ipcMain.handle('Knowledge:get', (_event, noteId) =>
  knowledgeGenerationService.get(id(noteId)),
);
ipcMain.handle('Knowledge:generateStructuredNote', (_event, noteId) =>
  knowledgeGenerationService.generateStructuredNote(id(noteId)),
);
ipcMain.handle('Knowledge:generateStructuredNoteDraft', (_event, transcript) =>
  knowledgeGenerationService.generateStructuredNoteDraft(String(transcript)),
);
ipcMain.handle(
  'Knowledge:generateScenario',
  (
    _event,
    noteId,
    selection: ScenarioTemplateSelection | KnowledgeScenario,
    language,
  ) =>
    knowledgeGenerationService.generateScenario(
      id(noteId),
      selection,
      language,
    ),
);
ipcMain.handle('Knowledge:toggleTask', (_event, noteId, taskId, completed) =>
  knowledgeGenerationService.toggleTask(
    id(noteId),
    String(taskId),
    completed === true,
  ),
);
