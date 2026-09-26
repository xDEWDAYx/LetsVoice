export type KnowledgeTemplateSection = {
  key: string;
  title: string;
  instruction: string;
};

export class KnowledgeTemplate {
  public constructor(
    private readonly id: string,
    private readonly name: string,
    private readonly requirement: string,
    private readonly sections: KnowledgeTemplateSection[],
    private readonly createdAt: string,
    private readonly updatedAt: string,
    private readonly trashedAt: string | null = null,
  ) {}

  public getId(): string { return this.id; }
  public getName(): string { return this.name; }
  public getRequirement(): string { return this.requirement; }
  public getSections(): readonly KnowledgeTemplateSection[] { return this.sections; }
  public getCreatedAt(): string { return this.createdAt; }
  public getUpdatedAt(): string { return this.updatedAt; }
  public getTrashedAt(): string | null { return this.trashedAt; }
}
