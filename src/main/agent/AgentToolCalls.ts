import { Message, ToolCall } from 'ollama';

export type NormalizedToolCall = {
  name: string;
  args: Record<string, unknown>;
};

function normalizeArguments(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseJsonDirective(content: string): NormalizedToolCall | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? content).trim();
  if (!candidate.startsWith('{')) return null;
  try {
    const value = JSON.parse(candidate) as Record<string, unknown>;
    const name = value.tool ?? value.name ?? value.tool_name;
    if (typeof name !== 'string' || !name.trim()) return null;
    return {
      name: name.trim(),
      args: normalizeArguments(
        value.args ?? value.arguments ?? value.parameters ?? value.input,
      ),
    };
  } catch {
    return null;
  }
}

/** 小模型偶尔返回 JSON 指令；这里只兼容格式，不执行未注册工具。 */
export function readToolCall(message: Message): NormalizedToolCall | null {
  const nativeCall = message.tool_calls?.[0] as ToolCall | undefined;
  if (nativeCall?.function?.name) {
    return {
      name: nativeCall.function.name,
      args: normalizeArguments(nativeCall.function.arguments),
    };
  }
  return parseJsonDirective(message.content || '');
}
