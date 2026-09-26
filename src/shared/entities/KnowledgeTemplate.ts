import { Entity } from './Entity';
import type { ScenarioTemplateDefinition } from '../types/KnowledgeGenerationTypes';

export class KnowledgeTemplate extends Entity {
  private name: string;

  private prompt: string;

  private definition: ScenarioTemplateDefinition | null;

  private normalizedAt: Date | null;

  private createdAt: Date;

  private updatedAt: Date;

  public constructor(
    id: number,
    name: string,
    prompt: string,
    createdAt: Date,
    updatedAt: Date,
    definition: ScenarioTemplateDefinition | null = null,
    normalizedAt: Date | null = null,
  ) {
    super(id);

    this.name = name;
    this.prompt = prompt;
    this.definition = definition;
    this.normalizedAt = normalizedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getPrompt(): string {
    return this.prompt;
  }

  public setPrompt(prompt: string): void {
    this.prompt = prompt;
  }

  public getDefinition(): ScenarioTemplateDefinition | null {
    return this.definition;
  }

  public getEffectiveDefinition(): ScenarioTemplateDefinition {
    return (
      this.definition ?? {
        description: this.prompt.replace(/\s+/gu, ' ').slice(0, 220),
        sections: [
          {
            key: 'customKnowledge',
            title: this.name,
            instruction: this.prompt,
          },
        ],
      }
    );
  }

  public getNormalizedAt(): Date | null {
    return this.normalizedAt;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getUpdatedAt(): Date {
    return this.updatedAt;
  }

  public setUpdatedAt(updatedAt: Date): void {
    this.updatedAt = updatedAt;
  }
}
