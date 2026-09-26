export const KNOWLEDGE_SCENARIOS = [
  "meeting",
  "lecture",
  "consultation",
  "interview",
  "brainstorm",
  "general",
] as const;

export type KnowledgeScenario = (typeof KNOWLEDGE_SCENARIOS)[number];

export type KnowledgeSection = {
  key: string;
  title: string;
  items: string[];
};

export class KnowledgeDocument {
  public constructor(
    private readonly id: string,
    private readonly noteId: string,
    private readonly scenario: KnowledgeScenario,
    private readonly summary: string,
    private readonly sections: KnowledgeSection[],
    private readonly modelId: string,
    private readonly createdAt: string,
    private readonly updatedAt: string,
    private readonly templateId: string | null = null,
    private readonly templateName: string | null = null,
    private readonly templateDeleted: boolean = false,
  ) {}

  public getId(): string { return this.id; }
  public getNoteId(): string { return this.noteId; }
  public getScenario(): KnowledgeScenario { return this.scenario; }
  public getSummary(): string { return this.summary; }
  public getSections(): readonly KnowledgeSection[] { return this.sections; }
  public getModelId(): string { return this.modelId; }
  public getCreatedAt(): string { return this.createdAt; }
  public getUpdatedAt(): string { return this.updatedAt; }
  public getTemplateId(): string | null { return this.templateId; }
  public getTemplateName(): string { return this.templateName ?? this.scenario; }
  public getTemplateDeleted(): boolean { return this.templateDeleted; }
}
