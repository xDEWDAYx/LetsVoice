import type { ScenarioTemplateDefinition } from '@shared/types/KnowledgeGenerationTypes';
import LocalChatService, { LocalChatResult } from '../llm/LocalChatService';
import { parseStrictJson } from '../knowledge/CoreOutputParser';
import type { KnowledgeOutputLanguage } from '../knowledge/KnowledgeScenarios';

type ChatService = {
  chat(messages: unknown, options?: unknown): Promise<LocalChatResult>;
};

type RawTemplateDefinition = {
  description: string;
  sections: Array<{ key: string; title: string; instruction: string }>;
};

const definitionSchema = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          instruction: { type: 'string' },
        },
        required: ['key', 'title', 'instruction'],
        additionalProperties: false,
      },
    },
  },
  required: ['description', 'sections'],
  additionalProperties: false,
};

const isRawDefinition = (value: unknown): value is RawTemplateDefinition => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RawTemplateDefinition>;
  return (
    typeof candidate.description === 'string' &&
    Array.isArray(candidate.sections) &&
    candidate.sections.length >= 2 &&
    candidate.sections.length <= 8 &&
    candidate.sections.every(
      (section) =>
        section &&
        typeof section.key === 'string' &&
        typeof section.title === 'string' &&
        typeof section.instruction === 'string',
    )
  );
};

function safeKey(raw: string, index: number, used: Set<string>): string {
  const words = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean);
  let base = words.length
    ? words
        .map((word, wordIndex) => {
          const lower = word.toLowerCase();
          return wordIndex === 0
            ? lower
            : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
        })
        .join('')
    : `section${index + 1}`;
  if (/^\d/u.test(base)) base = `section${base}`;
  let key = base;
  let suffix = 2;
  while (used.has(key)) {
    key = `${base}${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

/** 把模型结果压回受控、可复用的场景定义，避免脏 key 或空栏目进入数据库。 */
export function sanitizeTemplateDefinition(
  value: RawTemplateDefinition,
): ScenarioTemplateDefinition {
  const used = new Set<string>();
  const sections = value.sections
    .map((section, index) => ({
      key: safeKey(section.key, index, used),
      title: section.title.trim().slice(0, 80),
      instruction: section.instruction.trim().slice(0, 800),
    }))
    .filter((section) => section.title && section.instruction);
  if (sections.length < 2) {
    throw new Error(
      '本地模型没有生成足够的有效栏目，请补充需求后重试。 / The template needs at least two useful sections.',
    );
  }
  const description = value.description.trim().slice(0, 240);
  if (!description) {
    throw new Error(
      '本地模型没有生成模板说明，请重试。 / Template description was empty.',
    );
  }
  return { description, sections };
}

/** 使用当前激活的本地模型，把用户的自然语言需求整理成 Scenario Knowledge 定义。 */
export default class KnowledgeTemplateNormalizer {
  private readonly chat: ChatService;

  public constructor(chat: ChatService = new LocalChatService()) {
    this.chat = chat;
  }

  public async normalize(
    name: string,
    prompt: string,
    language: KnowledgeOutputLanguage = 'en',
  ): Promise<ScenarioTemplateDefinition> {
    const outputLanguage = language === 'zh' ? 'Simplified Chinese' : 'English';
    const result = await this.chat.chat(
      [
        {
          role: 'system',
          content: `You design reusable note-extraction templates. Convert the user request into a precise scenario definition without expanding or changing its intent. Write the description, section titles, and instructions in ${outputLanguage}, following the application's current language even when the request uses another language. Create 2-8 non-overlapping sections. Each instruction must say what evidence belongs in the section, what detail to preserve, and what must not be invented. Unsupported information must be omitted. Return only exact JSON.`,
        },
        {
          role: 'user',
          content: `Template name: ${name}\n\nUser request:\n---\n${prompt}\n---\n\nReturn a concise description and reusable extraction sections. Section keys should be short lowerCamelCase English identifiers.`,
        },
      ],
      { temperature: 0, format: definitionSchema },
    );
    return sanitizeTemplateDefinition(
      parseStrictJson<RawTemplateDefinition>(result.content, isRawDefinition),
    );
  }
}
