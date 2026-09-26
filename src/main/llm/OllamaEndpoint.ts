export const OLLAMA_SERVER_URL = 'http://127.0.0.1:11434';

type OllamaTagsResponse = {
  models?: Array<{ name?: unknown; model?: unknown }>;
};

/** 读取本机 Ollama 模型；返回 null 表示服务不可达或响应无效。 */
export async function readOllamaModelNames(
  fetchImpl: typeof fetch = fetch,
  serverUrl = OLLAMA_SERVER_URL,
  timeoutMs = 1500,
): Promise<string[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${serverUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as OllamaTagsResponse;
    return (payload.models ?? []).flatMap((model) => {
      if (typeof model.name === 'string') return [model.name];
      if (typeof model.model === 'string') return [model.model];
      return [];
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
