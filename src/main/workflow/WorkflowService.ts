import { KnowledgeTemplate } from '@shared/entities/KnowledgeTemplate';
import {
  KNOWLEDGE_SCENARIOS,
  type ScenarioTemplateOption,
} from '@shared/types/KnowledgeGenerationTypes';
import type { KnowledgeTemplateDTO } from '@shared/types/WorkflowTypes';
import { KnowledgeTemplateRepository } from '../database/repositories/KnowledgeTemplateRepository';
import {
  getScenarioDefinition,
  type KnowledgeOutputLanguage,
} from '../knowledge/KnowledgeScenarios';
import KnowledgeTemplateNormalizer from './KnowledgeTemplateNormalizer';

/** 模板 CRUD 的验证和 DTO 转换集中在主进程，Renderer 不接收类实例。 */
export default class WorkflowService {
  private readonly repository: KnowledgeTemplateRepository;

  private readonly normalizer: KnowledgeTemplateNormalizer;

  public constructor(
    repository = new KnowledgeTemplateRepository(),
    normalizer = new KnowledgeTemplateNormalizer(),
  ) {
    this.repository = repository;
    this.normalizer = normalizer;
  }

  public listTemplates(): KnowledgeTemplateDTO[] {
    return this.repository.findAll().map(WorkflowService.serializeTemplate);
  }

  public getTemplate(rawId: unknown): KnowledgeTemplateDTO | null {
    const template = this.repository.findById(
      WorkflowService.normalizeId(rawId),
    );
    return template ? WorkflowService.serializeTemplate(template) : null;
  }

  public listScenarioTemplates(
    rawLanguage: unknown = 'en',
  ): ScenarioTemplateOption[] {
    const language = WorkflowService.normalizeLanguage(rawLanguage);
    const builtIn = KNOWLEDGE_SCENARIOS.map((scenario) => {
      const definition = getScenarioDefinition(scenario, language);
      return {
        key: `builtin:${scenario}`,
        source: 'builtin' as const,
        scenario,
        templateId: null,
        name: definition.name,
        description: definition.description,
        sections: definition.sections,
        isNormalized: true,
        updatedAt: null,
      };
    });
    const custom = this.repository.findAll().map((template) => {
      const definition = template.getEffectiveDefinition();
      return {
        key: `custom:${template.getId()}`,
        source: 'custom' as const,
        scenario: null,
        templateId: template.getId(),
        name: template.getName(),
        description: definition.description,
        sections: definition.sections,
        isNormalized: template.getDefinition() !== null,
        updatedAt: template.getUpdatedAt().toISOString(),
      };
    });
    return [...builtIn, ...custom];
  }

  public async createTemplate(
    rawName: unknown,
    rawPrompt: unknown,
    rawLanguage: unknown = 'en',
  ): Promise<KnowledgeTemplateDTO> {
    const name = WorkflowService.normalizeName(rawName);
    const prompt = WorkflowService.normalizePrompt(rawPrompt);
    const definition = await this.normalizer.normalize(
      name,
      prompt,
      WorkflowService.normalizeLanguage(rawLanguage),
    );
    const id = this.repository.create(name, prompt, definition, new Date());
    return this.requireTemplate(id);
  }

  public async updateTemplate(
    rawId: unknown,
    rawName: unknown,
    rawPrompt: unknown,
    rawLanguage: unknown = 'en',
  ): Promise<KnowledgeTemplateDTO> {
    const id = WorkflowService.normalizeId(rawId);
    const name = WorkflowService.normalizeName(rawName);
    const prompt = WorkflowService.normalizePrompt(rawPrompt);
    const definition = await this.normalizer.normalize(
      name,
      prompt,
      WorkflowService.normalizeLanguage(rawLanguage),
    );
    const updated = this.repository.update(
      id,
      name,
      prompt,
      definition,
      new Date(),
    );
    if (!updated) throw new Error('知识模板不存在 / Template not found');
    return this.requireTemplate(id);
  }

  private requireTemplate(id: number): KnowledgeTemplateDTO {
    const template = this.repository.findById(id);
    if (!template) throw new Error('知识模板不存在 / Template not found');
    return WorkflowService.serializeTemplate(template);
  }

  private static normalizeId(value: unknown): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('无效的知识模板 ID / Invalid template ID');
    }
    return id;
  }

  private static normalizeName(value: unknown): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) throw new Error('模板名称不能为空 / Template name is required');
    return name.slice(0, 80);
  }

  private static normalizePrompt(value: unknown): string {
    const prompt = typeof value === 'string' ? value.trim() : '';
    if (!prompt) throw new Error('模板提示词不能为空 / Prompt is required');
    if (prompt.length > 4000) throw new Error('模板提示词不能超过 4000 个字符');
    return prompt;
  }

  private static normalizeLanguage(value: unknown): KnowledgeOutputLanguage {
    return value === 'zh' ? 'zh' : 'en';
  }

  private static serializeTemplate(
    template: KnowledgeTemplate,
  ): KnowledgeTemplateDTO {
    return {
      id: template.getId(),
      name: template.getName(),
      prompt: template.getPrompt(),
      definition: template.getDefinition(),
      normalizedAt: template.getNormalizedAt()?.toISOString() ?? null,
      createdAt: template.getCreatedAt().toISOString(),
      updatedAt: template.getUpdatedAt().toISOString(),
    };
  }
}
