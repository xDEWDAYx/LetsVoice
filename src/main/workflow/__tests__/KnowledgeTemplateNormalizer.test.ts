import KnowledgeTemplateNormalizer, {
  sanitizeTemplateDefinition,
} from '../KnowledgeTemplateNormalizer';

describe('KnowledgeTemplateNormalizer', () => {
  it('turns unsafe and duplicate section keys into stable unique keys', () => {
    expect(
      sanitizeTemplateDefinition({
        description: '  客户访谈的证据结构  ',
        sections: [
          {
            key: '客户 痛点',
            title: ' 痛点 ',
            instruction: ' 保留用户明确提到的问题，不要猜测。 ',
          },
          {
            key: '客户 痛点',
            title: '原话',
            instruction: '保留短句和说话人，不要润色。',
          },
        ],
      }),
    ).toEqual({
      description: '客户访谈的证据结构',
      sections: [
        {
          key: 'section1',
          title: '痛点',
          instruction: '保留用户明确提到的问题，不要猜测。',
        },
        {
          key: 'section2',
          title: '原话',
          instruction: '保留短句和说话人，不要润色。',
        },
      ],
    });
  });

  it('rejects a model response without two usable sections', () => {
    expect(() =>
      sanitizeTemplateDefinition({
        description: 'One section only',
        sections: [
          { key: 'valid', title: 'Valid', instruction: 'Keep evidence.' },
          { key: 'empty', title: '', instruction: '' },
        ],
      }),
    ).toThrow(/at least two useful sections/);
  });

  it('asks the local model for exact JSON and sanitizes the response', async () => {
    const chat = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        description: 'Research interview evidence',
        sections: [
          {
            key: 'pain points',
            title: 'Pain Points',
            instruction: 'Capture only explicit problems.',
          },
          {
            key: 'quotes',
            title: 'Quotes',
            instruction: 'Preserve short verbatim quotes and attribution.',
          },
        ],
      }),
      modelName: 'local-test-model',
      runtimeName: 'Ollama',
    });
    const normalizer = new KnowledgeTemplateNormalizer({ chat });

    const result = await normalizer.normalize(
      'Interview evidence',
      'I need pain points and quotes, please keep the speaker.',
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      'painPoints',
      'quotes',
    ]);
    expect(chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('I need pain points and quotes'),
        }),
      ]),
      expect.objectContaining({ temperature: 0, format: expect.any(Object) }),
    );
  });

  it('requires normalized visible fields to follow the application language', async () => {
    const chat = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        description: '客户访谈证据',
        sections: [
          {
            key: 'painPoints',
            title: '痛点',
            instruction: '只保留明确提到的问题，不要推测。',
          },
          {
            key: 'quotes',
            title: '原话',
            instruction: '保留简短原话与说话人，不要改写。',
          },
        ],
      }),
      modelName: 'local-test-model',
      runtimeName: 'Ollama',
    });
    const normalizer = new KnowledgeTemplateNormalizer({ chat });

    await normalizer.normalize(
      'Interview evidence',
      'Keep pain points and quotes.',
      'zh',
    );

    expect(chat.mock.calls[0][0][0].content).toContain('Simplified Chinese');
  });
});
