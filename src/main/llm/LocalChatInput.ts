import { Message } from 'ollama';

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARACTERS = 20_000;
const MAX_TOTAL_CHARACTERS = 100_000;

function isMessageRecord(
  value: unknown,
): value is { role: string; content: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    typeof value.role === 'string' &&
    'content' in value &&
    typeof value.content === 'string'
  );
}

/** IPC 数据不可信，进入 Ollama 前统一收窄为受支持的文字消息。 */
export function normalizeChatMessages(value: unknown): Message[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('至少需要一条聊天消息 / At least one message is required');
  }
  if (value.length > MAX_MESSAGES) {
    throw new Error(`聊天消息不能超过 ${MAX_MESSAGES} 条`);
  }

  let totalCharacters = 0;
  return value.map((candidate) => {
    if (!isMessageRecord(candidate)) {
      throw new Error('聊天消息格式无效 / Invalid chat message');
    }

    const { role } = candidate;
    const content = candidate.content.trim();
    if (!['system', 'user', 'assistant'].includes(role) || !content) {
      throw new Error('聊天消息角色或内容无效 / Invalid role or content');
    }
    if (content.length > MAX_MESSAGE_CHARACTERS) {
      throw new Error(`单条消息不能超过 ${MAX_MESSAGE_CHARACTERS} 个字符`);
    }

    totalCharacters += content.length;
    if (totalCharacters > MAX_TOTAL_CHARACTERS) {
      throw new Error(`聊天内容总计不能超过 ${MAX_TOTAL_CHARACTERS} 个字符`);
    }

    return { role, content };
  });
}

export function normalizeTemperature(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0.3;
  if (!('temperature' in value) || typeof value.temperature !== 'number') {
    return 0.3;
  }
  return Math.min(2, Math.max(0, value.temperature));
}

/** Structured output is only accepted as a JSON-schema-like plain object. */
export function normalizeChatFormat(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || !('format' in value)) {
    return undefined;
  }
  const { format } = value;
  if (typeof format !== 'object' || format === null || Array.isArray(format)) {
    return undefined;
  }
  return format as Record<string, unknown>;
}
