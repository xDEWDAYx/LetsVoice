export const KNOWLEDGE_SCENARIOS = [
  'meeting',
  'lecture',
  'consultation',
  'interview',
  'brainstorm',
  'general',
] as const;
export type KnowledgeScenario = (typeof KNOWLEDGE_SCENARIOS)[number];
export type ScenarioTemplateSource = 'builtin' | 'custom';
export type ScenarioTemplateSectionDefinition = {
  key: string;
  title: string;
  instruction: string;
};
export type ScenarioTemplateDefinition = {
  description: string;
  sections: ScenarioTemplateSectionDefinition[];
};
export const isScenarioTemplateDefinition = (
  value: unknown,
): value is ScenarioTemplateDefinition => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ScenarioTemplateDefinition>;
  return (
    typeof candidate.description === 'string' &&
    candidate.description.trim().length > 0 &&
    Array.isArray(candidate.sections) &&
    candidate.sections.length >= 1 &&
    candidate.sections.length <= 8 &&
    candidate.sections.every(
      (section) =>
        Boolean(section) &&
        typeof section.key === 'string' &&
        section.key.trim().length > 0 &&
        typeof section.title === 'string' &&
        section.title.trim().length > 0 &&
        typeof section.instruction === 'string' &&
        section.instruction.trim().length > 0,
    )
  );
};
export type ScenarioTemplateSelection =
  | { source: 'builtin'; scenario: KnowledgeScenario }
  | { source: 'custom'; templateId: number };
export type ScenarioTemplateOption = {
  key: string;
  source: ScenarioTemplateSource;
  scenario: KnowledgeScenario | null;
  templateId: number | null;
  name: string;
  description: string;
  sections: ScenarioTemplateSectionDefinition[];
  isNormalized: boolean;
  updatedAt: string | null;
};
export type GenerationStatus =
  | 'idle'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed';
export type GenerationState = {
  status: GenerationStatus;
  requestId?: string;
  scenario?: KnowledgeScenario;
  template?: ScenarioTemplateSelection;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
};
export type InsightItem = {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  startsAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  sourceNoteId: number;
  externalSystem: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
};
export type InsightTask = InsightItem & { actionItems: InsightItem[] };
export type CalendarIntent = InsightItem & {
  kind: 'reminder' | 'calendar';
  endsAt: string | null;
  remindAt: string | null;
  allDay: boolean;
  timezone: string | null;
};
export type StructuredNote = {
  noteId: number;
  summary: string;
  keyPoints: string[];
  tasks: InsightTask[];
  unassignedActionItems: InsightItem[];
  calendarIntents: CalendarIntent[];
  modelId: string;
  createdAt: string;
  updatedAt: string;
};
/** 笔记落库前生成的完整结构化结果；保存时只需补上真实 noteId。 */
export type StructuredNoteDraft = Omit<StructuredNote, 'noteId'>;
export type KnowledgeSection = { key: string; title: string; items: string[] };
export type ScenarioKnowledge = {
  noteId: number;
  scenario: KnowledgeScenario | null;
  templateId: number | null;
  templateName: string;
  templateSource: ScenarioTemplateSource;
  sections: KnowledgeSection[];
  modelId: string;
  createdAt: string;
  updatedAt: string;
};
export type NoteKnowledgeBundle = {
  structuredNote: StructuredNote | null;
  scenario: ScenarioKnowledge | null;
  structuredNoteState: GenerationState;
  scenarioState: GenerationState;
};
