/**
 * 跨机器 LLM 基准的模型集合：**应用目录里全部的 LLM 模型**。
 *
 * ## 为什么要固定，以及为什么是全量
 *
 * llm-runtime-probe 默认测「这台机器上恰好装了什么」。跨机器跑的时候这会直接毁掉
 * 对比表：模型集合变成「谁在那台机器上拉过什么」的副产品。本仓库实测过这个坑 ——
 * fan3090 只有 1 个模型、jack 只有 2 个、desktop-qg1ej01 有 5 个，
 * 于是 cross-llm-gpu.svg 里一半的柱子是空的，跨机器根本没法比。
 *
 * 集合直接取自 config/llm-catalog.json，而不是在这里另抄一份：
 * 那份 JSON 就是应用自己对「有哪些 LLM 模型」的定义，抄一份必然会漂。
 * 目录里新增模型时，跨机器基准自动跟着测，不需要改这个文件。
 *
 * 合计约 10 GiB。fetch 脚本会在开始下载前把总量报出来。
 */

import http from 'http';
import llmCatalogJson from '../../config/llm-catalog.json';

type LlmCatalogEntry = {
  id: string;
  name: string;
  engine: string;
  size: string;
  /** ollama pull / ollama 的 API 用的完整名字（带 tag）。 */
  modelName: string;
};

export type BenchmarkLlmModel = {
  /** ollama pull 用的完整名字（带 tag）。 */
  name: string;
  /** 下载体积，用于在开始前给出总量提示。 */
  size: string;
};

export const LLM_BENCHMARK_MODELS: BenchmarkLlmModel[] = (
  (llmCatalogJson as { llm: LlmCatalogEntry[] }).llm ?? []
)
  // 只要 ollama 的：这个基准通过 ollama 的 HTTP API 测速。
  .filter((item) => item.engine === 'ollama' && Boolean(item.modelName))
  .map((item) => ({ name: item.modelName, size: item.size }));

/** OLLAMA_HOST 可能不带协议（PS1 启动服务时就会这么设），统一补成完整 URL。 */
export function ollamaHost(): string {
  const raw = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
  const trimmed = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** ollama 里省略 tag 等价于 :latest，比较前统一补上，避免 phi4-mini 被当成没装。 */
export function normaliseModelName(name: string): string {
  return name.includes(':') ? name : `${name}:latest`;
}

/** 读取本机已装模型；Ollama 不通时抛错，由调用方决定是跳过还是报错。 */
export function listInstalledModels(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = http.get(`${ollamaHost()}/api/tags`, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        raw += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`GET /api/tags 返回 HTTP ${response.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(raw) as { models?: { name?: string }[] };
          resolve(
            (parsed.models ?? [])
              .map((item) => item.name)
              .filter((name): name is string => Boolean(name))
              .map(normaliseModelName),
          );
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(3000, () => {
      request.destroy(new Error('连接 Ollama 超时'));
    });
  });
}

/** 集合里还没装的那些。 */
export async function missingBenchmarkModels(
  wanted: BenchmarkLlmModel[] = LLM_BENCHMARK_MODELS,
): Promise<BenchmarkLlmModel[]> {
  const installed = new Set(await listInstalledModels());
  return wanted.filter(
    (model) => !installed.has(normaliseModelName(model.name)),
  );
}
