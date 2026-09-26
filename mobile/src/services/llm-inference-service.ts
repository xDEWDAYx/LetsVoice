import { type LlamaContext, type NativeCompletionResult } from "llama.rn";

import {
  NO_ACTIVE_LLM_ERROR,
  NO_TRANSCRIPT_CONTEXT_ERROR,
} from "@/constants/ask-ai-grounding-policy";
import {
  ASK_AI_COMPLETION_TEMPERATURE,
  ASK_AI_COMPLETION_TOP_P,
  ASK_AI_CONFIGURED_N_CTX,
  ASK_AI_GENERATION_DEADLINE_MS,
  ASK_AI_GENERATION_RESERVE,
  ASK_AI_N_GPU_LAYERS,
} from "@/constants/ask-ai-inference-config";
import { InferenceError } from "@/errors/inference-error";
import type { AppPreferencesService } from "@/services/app-preferences-service";
import { InferenceDeadline, type InferenceAbortReason } from "@/services/inference-deadline";
import { LlmModelService } from "@/services/llm-model-service";
import {
  InferenceCancelledError,
  type InferenceTask,
  type InferenceTaskContext,
  LocalLlmCoordinator,
} from "@/services/local-llm-coordinator";
import { LlmRequestService } from "@/services/llm-request-service";
import { markdownToPlainText } from "@/services/safe-markdown";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";
import type { SpeechPlaybackService } from "@/services/speech-playback-service";

import { notesToTranscriptBlocks } from "./ask-ai-grounded-messages";
import { buildAskAiCacheIdentity } from "./ask-ai-cache-identity";
import { AiConversationService } from "./ai-conversation-service";
import { fitGroundedMessagesToBudget } from "./llm-context-budget";

export type GenerateCallbacks = { onToken: (tokenText: string) => void };

export type GenerateResult = {
  assistantText: string;
  assistantMessageId: string;
  promptTokenCount: number;
  historyTrimmed: boolean;
};

export type LlmGenerationSnapshot =
  | { status: "idle" }
  | {
      status: "running";
      conversationId: string;
      phase: "preparing-context" | "waiting" | "loading-model" | "generating" | "saving" | "stopping";
    };

/** Runs one grounded completion over the linked transcript and chat history. */
export class LlmInferenceService {
  private activeConversationId: string | null = null;
  private isGenerating = false;
  private generationAborted = false;
  private activeDeadline: InferenceDeadline | null = null;
  private activeTask: InferenceTask<GenerateResult> | null = null;
  private generationSnapshot: LlmGenerationSnapshot = { status: "idle" };
  private readonly generationListeners = new Set<(snapshot: LlmGenerationSnapshot) => void>();

  public constructor(
    private readonly llmModelService: LlmModelService,
    private readonly aiConversationService: AiConversationService,
    private readonly coordinator: LocalLlmCoordinator,
    private readonly sharedContext: SharedLlmContextService,
    private readonly requests: LlmRequestService,
    private readonly preferences: AppPreferencesService,
    private readonly speechPlayback: SpeechPlaybackService,
  ) {}

  public getIsGenerating(): boolean {
    return this.isGenerating;
  }

  public getGenerationSnapshot(): LlmGenerationSnapshot {
    return this.generationSnapshot;
  }

  public subscribeToGeneration(listener: (snapshot: LlmGenerationSnapshot) => void): () => void {
    this.generationListeners.add(listener);
    listener(this.generationSnapshot);
    return () => this.generationListeners.delete(listener);
  }

  private publishGenerationSnapshot(snapshot: LlmGenerationSnapshot): void {
    this.generationSnapshot = snapshot;
    for (const listener of this.generationListeners) listener(snapshot);
  }

  public getLoadedModelId(): string | null {
    return this.sharedContext.getLoadedModelId();
  }

  public getActiveConversationId(): string | null {
    return this.activeConversationId;
  }

  public async generate(
    conversationId: string,
    callbacks: GenerateCallbacks,
  ): Promise<GenerateResult> {
    if (this.isGenerating) {
      throw new InferenceError("A generation is already in progress.");
    }

    this.isGenerating = true;
    this.generationAborted = false;
    const deadline = new InferenceDeadline(ASK_AI_GENERATION_DEADLINE_MS);
    this.activeDeadline = deadline;
    this.publishGenerationSnapshot({
      status: "running",
      conversationId,
      phase: this.coordinator.isBusy() ? "waiting" : "preparing-context",
    });
    const task = this.coordinator.schedule("ask-ai", (lifecycle) =>
      this.runGeneration(conversationId, callbacks, lifecycle, deadline),
    );
    this.activeTask = task;
    deadline.signal.addEventListener("abort", () => {
      if (this.activeTask !== task) return;
      this.generationAborted = true;
      this.publishGenerationSnapshot({ status: "running", conversationId, phase: "stopping" });
      void task.cancel();
    }, { once: true });

    try {
      const result = await task.promise;
      if (this.preferences.getSnapshot().autoSpeakAnswers) {
        void this.speechPlayback.speak({
          id: `ask-ai:${result.assistantMessageId}`,
          label: "AI answer",
          text: markdownToPlainText(result.assistantText),
        }).catch(() => undefined);
      }
      return result;
    } catch (error) {
      if (deadline.reason) throw this.abortError(deadline.reason);
      if (error instanceof InferenceCancelledError) throw this.abortError("cancelled");
      throw error;
    } finally {
      deadline.dispose();
      if (this.activeDeadline === deadline) this.activeDeadline = null;
      if (this.activeTask === task) this.activeTask = null;
      this.isGenerating = false;
      this.publishGenerationSnapshot({ status: "idle" });
    }
  }

  private async runGeneration(
    conversationId: string,
    callbacks: GenerateCallbacks,
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
  ): Promise<GenerateResult> {
    this.setPhase(conversationId, "preparing-context");
    this.throwIfStopped(lifecycle, deadline);
    await this.aiConversationService.getConversationOrThrow(conversationId);
    await this.ensureContextForActiveModel(conversationId, deadline);
    const linkedNotes = await this.aiConversationService.getLinkedNotes(conversationId);
    if (linkedNotes.length === 0) {
      throw new InferenceError(NO_TRANSCRIPT_CONTEXT_ERROR);
    }
    this.throwIfStopped(lifecycle, deadline);

    const transcriptBlocks = notesToTranscriptBlocks(linkedNotes);
    const cacheActivationStartedAt = Date.now();
    const cache = await this.activateConversationCache(
      buildAskAiCacheIdentity(conversationId, transcriptBlocks),
    );
    this.activeConversationId = conversationId;

    const canonicalMessages = await this.aiConversationService.getCanonicalMessages(conversationId);
    const lastMessage = canonicalMessages.at(-1);
    if (lastMessage?.getRole() !== "user") {
      throw new InferenceError(
        "Cannot generate a response because the latest conversation message is not from the user.",
      );
    }

    const history = canonicalMessages.map((message) => ({
      role: message.getRole(),
      content: message.getContent(),
    }));
    const context = this.getContextOrThrow();
    const prompt = await fitGroundedMessagesToBudget(context, transcriptBlocks, history);
    this.throwIfStopped(lifecycle, deadline);
    this.setPhase(conversationId, "generating");

    const completionStartedAt = Date.now();
    let firstTokenAt: number | null = null;
    let streamedText = "";
    const completed = await this.requests.complete(
      context,
      {
        messages: prompt.messages,
        n_predict: ASK_AI_GENERATION_RESERVE,
        temperature: ASK_AI_COMPLETION_TEMPERATURE,
        top_p: ASK_AI_COMPLETION_TOP_P,
        enable_thinking: false,
        reasoning_format: "none",
      },
      lifecycle,
      (data) => {
        if (this.generationAborted || data.token.length === 0) return;
        if (firstTokenAt === null) firstTokenAt = Date.now();
        streamedText += data.token;
        callbacks.onToken(data.token);
      },
    );
    const completionResult = completed.result;

    this.throwIfStopped(lifecycle, deadline);
    if (this.generationAborted || completionResult.interrupted) {
      throw new InferenceError("Generation was stopped.");
    }

    const assistantText = this.resolveAssistantText(completionResult, streamedText);
    if (assistantText.length === 0) {
      throw new InferenceError("The language model returned an empty response.");
    }
    if (streamedText.trim().length === 0) callbacks.onToken(assistantText);

    this.setPhase(conversationId, "saving");
    this.throwIfStopped(lifecycle, deadline);
    const assistantMessage = await this.aiConversationService.addAssistantMessage(
      conversationId,
      assistantText,
    );

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[AskAI] grounded completion", {
        transcriptCount: linkedNotes.length,
        historyTrimmed: prompt.historyTrimmed,
        promptTokenCount: prompt.promptTokenCount,
        budgetTokenizationPasses: prompt.tokenizationPasses,
        cacheReused: cache.reused,
        cacheActivationMs: Date.now() - cacheActivationStartedAt,
        cacheClearMs: cache.clearMs,
        nativeCachedTokens: completionResult.tokens_cached,
        nativeCachedPromptTokens: completionResult.timings?.cache_n,
        nativePromptTokens: completionResult.timings?.prompt_n,
        nativePromptPrefillMs: completionResult.timings?.prompt_ms,
        timeToFirstTokenMs: firstTokenAt === null ? null : firstTokenAt - completionStartedAt,
      });
    }

    return {
      assistantText,
      assistantMessageId: assistantMessage.getId(),
      promptTokenCount: prompt.promptTokenCount,
      historyTrimmed: prompt.historyTrimmed,
    };
  }

  public async stopGeneration(): Promise<void> {
    this.generationAborted = true;
    if (this.generationSnapshot.status === "running") {
      this.publishGenerationSnapshot({ ...this.generationSnapshot, phase: "stopping" });
    }
    this.activeDeadline?.abort("cancelled");
    if (!this.activeDeadline) await this.activeTask?.cancel();
  }

  public async ensureReady(): Promise<void> {
    await this.coordinator.runExclusive("ask-ai", () => this.ensureContextForActiveModel());
  }

  public async releaseContext(): Promise<void> {
    if (this.isGenerating) {
      throw new InferenceError(
        "Cannot release Llama context while generation is in progress. Call stopGeneration(), wait for the current generate() promise to settle, then call releaseContext().",
      );
    }
    await this.sharedContext.release();
    this.activeConversationId = null;
  }

  private async ensureContextForActiveModel(
    conversationId?: string,
    deadline?: InferenceDeadline,
  ): Promise<void> {
    const activeModel = await this.llmModelService.getActiveModel();
    if (activeModel === null) throw new InferenceError(NO_ACTIVE_LLM_ERROR);

    const activeModelId = activeModel.getId();
    const modelFile = this.llmModelService.resolveModelFile(activeModel);
    if (!modelFile.exists) {
      throw new InferenceError("The active model file is missing on this device.");
    }

    deadline?.throwIfAborted((reason) => this.abortError(reason));
    if (conversationId && this.sharedContext.getLoadedModelId() !== activeModelId) {
      this.setPhase(conversationId, "loading-model");
    }
    const prepared = await this.sharedContext.prepare(activeModelId, modelFile.uri);
    deadline?.throwIfAborted((reason) => this.abortError(reason));
    console.info("[AskAI] Shared model context prepared", {
      modelId: activeModelId,
      reused: prepared.reused,
      contextPrepareMs: prepared.contextPrepareMs,
      promptBudgetContextSize: ASK_AI_CONFIGURED_N_CTX,
      gpuLayers: ASK_AI_N_GPU_LAYERS,
    });
  }

  private throwIfStopped(lifecycle: InferenceTaskContext, deadline: InferenceDeadline): void {
    deadline.throwIfAborted((reason) => this.abortError(reason));
    lifecycle.throwIfCancelled();
  }

  private setPhase(
    conversationId: string,
    phase: Extract<LlmGenerationSnapshot, { status: "running" }>["phase"],
  ): void {
    if (!this.isGenerating) return;
    this.publishGenerationSnapshot({ status: "running", conversationId, phase });
  }

  private abortError(reason: InferenceAbortReason): InferenceError {
    return reason === "timeout"
      ? new InferenceError("Ask AI reached its 90-second limit. Your question is saved; please retry.")
      : new InferenceError("Generation was stopped. Your question is saved; you can retry.");
  }

  private async activateConversationCache(identity: string) {
    try {
      return await this.sharedContext.activateCache(identity);
    } catch {
      await this.sharedContext.release();
      this.activeConversationId = null;
      throw new InferenceError("Unable to clear conversation cache safely. Please retry.");
    }
  }

  private getContextOrThrow(): LlamaContext {
    const context = this.sharedContext.getContext();
    if (context === null) throw new InferenceError("Llama context is not initialized.");
    return context;
  }

  private resolveAssistantText(result: NativeCompletionResult, streamedText: string): string {
    const fromResult = result.content?.trim() || result.text?.trim() || "";
    return fromResult.length > 0 ? fromResult : streamedText.trim();
  }
}
