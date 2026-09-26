import type { ScenarioTemplateDefinition } from './KnowledgeGenerationTypes';

export type KnowledgeTemplateDTO = {
  id: number;
  name: string;
  prompt: string;
  definition: ScenarioTemplateDefinition | null;
  normalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
