import { initLlama, type LlamaContext } from "llama.rn";

import { LocalLlmCoordinator } from "@/services/local-llm-coordinator";

const SHARED_CONTEXT_SIZE = 6144;
const GPU_LAYERS = 99;

export type PreparedLlmContext = {
  context: LlamaContext;
  contextPrepareMs: number;
  reused: boolean;
};

export type ActivatedLlmCache = {
  reused: boolean;
  clearMs: number;
};

/** Owns the native context shared by short Ask AI, translation, and title work. */
export class SharedLlmContextService {
  private context: LlamaContext | null = null;
  private modelId: string | null = null;
  private cacheIdentity: string | null = null;

  public constructor(coordinator: LocalLlmCoordinator) {
    // A loaded LLM is compatible with every LLM feature. Serialization is handled
    // by the application scheduler; completion/cancellation does not unload it.
    coordinator.registerIdleCleanup("shared-llm", () => this.release(), [
      "ask-ai", "translation", "note-title", "knowledge", "knowledge-template",
      "note-classification", "core-insights", "tts",
    ]);
  }

  public getLoadedModelId(): string | null { return this.modelId; }
  public getContext(): LlamaContext | null { return this.context; }

  public async prepare(modelId: string, modelUri: string): Promise<PreparedLlmContext> {
    const startedAt = Date.now();
    if (this.context && this.modelId === modelId) {
      const contextPrepareMs = Date.now() - startedAt;
      console.info("[SharedLlama] Context reuse", { modelId, contextSize: SHARED_CONTEXT_SIZE, contextPrepareMs });
      return { context: this.context, contextPrepareMs, reused: true };
    }
    await this.release();
    console.info("[SharedLlama] Context create started", { modelId, contextSize: SHARED_CONTEXT_SIZE });
    this.context = await initLlama({ model: modelUri, n_ctx: SHARED_CONTEXT_SIZE, n_batch: 512, n_gpu_layers: GPU_LAYERS, use_mmap: true });
    this.modelId = modelId;
    this.cacheIdentity = null;
    const contextPrepareMs = Date.now() - startedAt;
    console.info("[SharedLlama] Context create completed", { modelId, contextSize: SHARED_CONTEXT_SIZE, contextPrepareMs });
    return { context: this.context, contextPrepareMs, reused: false };
  }

  /**
   * Keeps the live KV cache only when the caller proves it owns the same
   * logical prompt stream. A different conversation or operation starts from
   * a clean cache, while llama.rn can prefix-match consecutive turns owned by
   * the same identity.
   */
  public async activateCache(identity: string): Promise<ActivatedLlmCache> {
    if (!this.context) throw new Error("Llama context is not initialized.");
    if (this.cacheIdentity === identity) return { reused: true, clearMs: 0 };

    const startedAt = Date.now();
    try {
      await this.context.clearCache(false);
    } catch (error) {
      this.cacheIdentity = null;
      throw error;
    }
    this.cacheIdentity = identity;
    return { reused: false, clearMs: Date.now() - startedAt };
  }

  public invalidateCacheIdentity(): void {
    this.cacheIdentity = null;
  }

  public async release(): Promise<void> {
    const context = this.context;
    const modelId = this.modelId;
    this.context = null;
    this.modelId = null;
    this.cacheIdentity = null;
    if (!context) return;
    const startedAt = Date.now();
    await context.release().catch((error) => console.warn("[SharedLlama] Context release failed", { modelId, error }));
    console.info("[SharedLlama] Context released", { modelId, durationMs: Date.now() - startedAt });
  }
}
