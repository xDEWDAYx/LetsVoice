import { getScenarioDefinition, SCENARIOS } from '../KnowledgeScenarios';
import {
  ensureStructuredSummary,
  isStructuredNoteActions,
  isStructuredNoteContent,
  parseStrictJson,
} from '../CoreOutputParser';

describe('knowledge generation strict parsing', () => {
  it('always derives a summary from a non-empty transcript', () => {
    expect(ensureStructuredSummary('模型摘要', '你好 你好')).toBe('模型摘要');
    expect(ensureStructuredSummary('   ', '你好  你好  你好')).toBe(
      '你好 你好 你好',
    );
  });

  it('accepts exact structured note content and preserves empty arrays', () => {
    expect(
      parseStrictJson(
        '{"summary":"Supported","keyPoints":[]}',
        isStructuredNoteContent,
      ),
    ).toEqual({ summary: 'Supported', keyPoints: [] });
  });
  it('rejects prose, missing fields, and unknown fields', () => {
    expect(() =>
      parseStrictJson('Here is JSON: {}', isStructuredNoteContent),
    ).toThrow(/unreadable JSON/);
    expect(() =>
      parseStrictJson('{"summary":"x"}', isStructuredNoteContent),
    ).toThrow(/incomplete structured data/);
    expect(() =>
      parseStrictJson(
        '{"summary":"x","keyPoints":[],"tasks":[]}',
        isStructuredNoteContent,
      ),
    ).toThrow(/incomplete structured data/);
  });
  it('requires the task/action hierarchy and null time fields', () => {
    const value = {
      tasks: [
        {
          title: 'Send draft',
          description: null,
          startsAtExpression: null,
          dueAtExpression: 'tomorrow',
          actionItems: [
            {
              title: 'Attach PDF',
              description: null,
              startsAtExpression: null,
              dueAtExpression: null,
            },
          ],
        },
      ],
      unassignedActionItems: [],
      reminders: [],
      calendarIntents: [],
    };
    expect(isStructuredNoteActions(value)).toBe(true);
    expect(
      isStructuredNoteActions({
        ...value,
        tasks: [{ title: 'Send draft', actionItems: [] }],
      }),
    ).toBe(false);
  });
  it('keeps scenario section order and excludes structured note categories', () => {
    expect(SCENARIOS.meeting.sections.map((s) => s.key)).toEqual([
      'discussionTopics',
      'decisions',
      'agreements',
      'disagreements',
      'risks',
      'openQuestions',
    ]);
    const forbidden = new Set([
      'summary',
      'keyPoints',
      'tasks',
      'actionItems',
      'reminders',
      'calendarIntents',
    ]);
    expect(
      Object.values(SCENARIOS)
        .flatMap((s) => s.sections)
        .some((s) => forbidden.has(s.key)),
    ).toBe(false);
  });

  it('keeps every built-in scenario precise and reusable', () => {
    Object.values(SCENARIOS).forEach((scenario) => {
      expect(scenario.description.trim()).not.toBe('');
      expect(scenario.sections.length).toBeGreaterThanOrEqual(2);
      expect(scenario.sections.length).toBeLessThanOrEqual(8);
      expect(
        new Set(scenario.sections.map((section) => section.key)).size,
      ).toBe(scenario.sections.length);
      scenario.sections.forEach((section) => {
        expect(section.key).toMatch(/^[a-z][A-Za-z0-9]*$/);
        expect(section.title.trim()).not.toBe('');
        expect(section.instruction.length).toBeGreaterThan(30);
      });
    });
  });

  it('keeps stable section keys while localizing visible scenario copy', () => {
    const localized = getScenarioDefinition('meeting', 'zh');

    expect(localized.name).toBe('会议');
    expect(localized.sections[0]).toEqual(
      expect.objectContaining({
        key: 'discussionTopics',
        title: '讨论议题',
      }),
    );
  });
});
