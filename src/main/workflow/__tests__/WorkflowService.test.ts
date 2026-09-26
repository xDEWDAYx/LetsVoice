import { KnowledgeTemplate } from '@shared/entities/KnowledgeTemplate';
import type { ScenarioTemplateDefinition } from '@shared/types/KnowledgeGenerationTypes';
import { KnowledgeTemplateRepository } from '../../database/repositories/KnowledgeTemplateRepository';
import KnowledgeTemplateNormalizer from '../KnowledgeTemplateNormalizer';
import WorkflowService from '../WorkflowService';

const definition: ScenarioTemplateDefinition = {
  description: 'Customer research evidence.',
  sections: [
    {
      key: 'painPoints',
      title: 'Pain Points',
      instruction: 'Capture explicit customer pain points only.',
    },
    {
      key: 'quotes',
      title: 'Quotes',
      instruction: 'Preserve short attributed quotes without rewriting.',
    },
  ],
};

function savedTemplate(id = 7) {
  const now = new Date('2026-08-23T10:00:00.000Z');
  return new KnowledgeTemplate(
    id,
    'Customer Research',
    'Keep pains and quotes.',
    now,
    now,
    definition,
    now,
  );
}

describe('WorkflowService scenario templates', () => {
  it('combines maintained built-ins with clearly identified custom templates', () => {
    const repository = {
      findAll: jest.fn().mockReturnValue([savedTemplate()]),
    } as unknown as KnowledgeTemplateRepository;
    const service = new WorkflowService(
      repository,
      {} as KnowledgeTemplateNormalizer,
    );

    const options = service.listScenarioTemplates();

    expect(
      options.filter((option) => option.source === 'builtin'),
    ).toHaveLength(6);
    expect(options.at(-1)).toEqual(
      expect.objectContaining({
        key: 'custom:7',
        source: 'custom',
        templateId: 7,
        name: 'Customer Research',
        description: definition.description,
        sections: definition.sections,
        isNormalized: true,
      }),
    );
  });

  it('localizes maintained built-ins to the selected application language', () => {
    const repository = {
      findAll: jest.fn().mockReturnValue([]),
    } as unknown as KnowledgeTemplateRepository;
    const service = new WorkflowService(
      repository,
      {} as KnowledgeTemplateNormalizer,
    );

    const meeting = service
      .listScenarioTemplates('zh')
      .find((option) => option.key === 'builtin:meeting');

    expect(meeting).toEqual(
      expect.objectContaining({
        name: '会议',
        description: '提取会议中的决策、共识、风险与未决问题。',
      }),
    );
    expect(meeting?.sections[0].title).toBe('讨论议题');
  });

  it('normalizes a natural-language request before the repository receives it', async () => {
    const create = jest.fn().mockReturnValue(7);
    const repository = {
      create,
      findById: jest.fn().mockReturnValue(savedTemplate()),
    } as unknown as KnowledgeTemplateRepository;
    const normalize = jest.fn().mockResolvedValue(definition);
    const normalizer = { normalize } as unknown as KnowledgeTemplateNormalizer;
    const service = new WorkflowService(repository, normalizer);

    const result = await service.createTemplate(
      '  Customer Research  ',
      '  Keep pains and quotes.  ',
    );

    expect(normalize).toHaveBeenCalledWith(
      'Customer Research',
      'Keep pains and quotes.',
      'en',
    );
    expect(create).toHaveBeenCalledWith(
      'Customer Research',
      'Keep pains and quotes.',
      definition,
      expect.any(Date),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 7,
        definition,
        normalizedAt: expect.any(String),
      }),
    );
  });
});
