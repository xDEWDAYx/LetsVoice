import type { CompletionParams, LlamaContext, NativeCompletionResult, RNLlamaOAICompatibleMessage } from "llama.rn";

import { InferenceError } from "@/errors/inference-error";
import { LlmModelService } from "@/services/llm-model-service";
import type { InferenceTaskContext } from "@/services/local-llm-coordinator";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";

export type LlmRawResult = { result: NativeCompletionResult; raw: string };

/** Common OpenAI-message, chat-template, budgeting, completion and JSON mechanics. */
export class LlmRequestService {
  public constructor(private readonly models: LlmModelService, private readonly runtime: SharedLlmContextService) {}

  public async ensureReady(): Promise<LlamaContext> {
    const model = await this.models.getActiveModel();
    if (!model) throw new InferenceError("Choose and activate a local language model in AI Models first.");
    const file = this.models.resolveModelFile(model);
    if (!file.exists) throw new InferenceError("The active model file is missing. Reinstall it from AI Models.");
    return (await this.runtime.prepare(model.getId(), file.uri)).context;
  }

  public async complete(context: LlamaContext, options: CompletionParams, task?: InferenceTaskContext, onToken?: Parameters<LlamaContext["completion"]>[1]): Promise<LlmRawResult> {
    task?.throwIfCancelled();
    task?.setInterrupt(() => context.stopCompletion());
    try {
      const result = await context.completion(options, onToken);
      task?.throwIfCancelled();
      const raw = (result.content || result.text || "").trim();
      return { result, raw };
    } catch (error) {
      task?.throwIfCancelled();
      throw error;
    } finally {
      task?.setInterrupt(null);
    }
  }

  public async countMessageTokens(context: LlamaContext, messages: RNLlamaOAICompatibleMessage[]): Promise<number> {
    const formatted = await context.getFormattedChat(messages, null, { jinja: true, enable_thinking: false, reasoning_format: "none" });
    return (await context.tokenize(formatted.prompt ?? "")).tokens.length;
  }

  public extractJsonObject(raw: string): string | null {
    const start = raw.indexOf("{");
    if (start < 0) return null;
    let depth = 0; let quoted = false; let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];
      if (escaped) { escaped = false; continue; }
      if (char === "\\" && quoted) { escaped = true; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (char === "{") depth += 1;
      if (char === "}" && --depth === 0) return raw.slice(start, index + 1);
    }
    return null;
  }

  public parseJson<T>(raw: string): T {
    const json = this.extractJsonObject(raw);
    if (!json) throw new Error("The local model did not return complete JSON.");
    return JSON.parse(json) as T;
  }
}
