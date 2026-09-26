import { type LlamaContext, type RNLlamaOAICompatibleMessage } from "llama.rn";

import { getKnowledgeScenarioDefinition } from "@/constants/knowledge-scenarios";
import { KnowledgeDocument, type KnowledgeScenario, type KnowledgeSection } from "@/domain/knowledge/knowledge-document";
import type { KnowledgeTemplate } from "@/domain/knowledge/knowledge-template";
import { KnowledgeGenerationError } from "@/errors/knowledge-generation-error";
import { KnowledgeDocumentRepository } from "@/repositories/knowledge-document-repository";
import { KNOWLEDGE_GENERATION_DEADLINE_MS } from "@/constants/local-ai-deadlines";
import { LlmModelService } from "@/services/llm-model-service";
import { InferenceDeadline, type InferenceAbortReason } from "@/services/inference-deadline";
import { InferenceCancelledError, type InferenceTask, type InferenceTaskContext, LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { LlmRequestService } from "@/services/llm-request-service";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";
import { extractStreamingStringArray } from "@/services/structured-stream-preview";
import { completionHitOutputLimit } from "@/services/core-note-insight-generation-policy";

type ModelOutput = { sections?: Record<string, unknown> };
type GenerationDefinition = {
  scenario: KnowledgeScenario;
  name: string;
  sections: readonly { key: string; title: string; instruction: string }[];
  templateId: string | null;
  templateName: string;
};
type ActiveKnowledgeRequest = {
  requestId: string;
  deadline: InferenceDeadline;
  task: InferenceTask<KnowledgeDocument>;
  scenario: KnowledgeScenario;
  startedAt: number;
};

const MODEL_CONTEXT_SIZE = 6144;
const MAX_PREDICTED_TOKENS = 1280;
const RECOVERY_PREDICTED_TOKENS = 1792;
const MAX_SECTION_ITEMS = 6;
const CONTEXT_SAFETY_TOKENS = 192;
const KNOWLEDGE_JSON_MODE = "plain" as const;
const SYSTEM_PROMPT = `Extract scenario-specific knowledge from NOTE. Core Note Insights separately handles summary, general key points, and tasks/action items; do not recreate those categories.
Use only information supported by NOTE. You may organize, combine repetition, and clearly restate supported relationships, but never add outside knowledge, new facts, opinions, conclusions, questions, or advice. Preserve uncertainty, attribution, and the note's primary language. A field with no evidence must be []. Return only JSON matching the schema.`;

export class KnowledgeService {
  private readonly generationStates = new Map<string, KnowledgeGenerationState>();
  private readonly activeGenerations = new Map<string, Promise<KnowledgeDocument>>();
  private readonly activeRequests = new Map<string, ActiveKnowledgeRequest>();
  private readonly listeners = new Map<string, Set<(state: KnowledgeGenerationState) => void>>();
  private readonly changeListeners = new Set<() => void>();
  private readonly lastPartialPublishedAt = new Map<string, number>();

  public constructor(
    private readonly repository: KnowledgeDocumentRepository,
    private readonly llmModelService: LlmModelService,
    private readonly coordinator: LocalLlmCoordinator,
    private readonly requests: LlmRequestService,
    private readonly sharedContext: SharedLlmContextService,
  ) {}

  public cancelGeneration(noteId: string): Promise<void> { return this.stopGeneration(noteId); }
  public async ensureReady(): Promise<void> { await this.coordinator.runExclusive("knowledge", async () => { await this.requests.ensureReady(); }); }

  public getForNote(noteId: string): Promise<KnowledgeDocument | null> {
    return this.repository.findByNoteId(noteId);
  }

  public getHistoryForNote(noteId: string): Promise<KnowledgeDocument[]> {
    return this.repository.findAllByNoteId(noteId);
  }

  public async deleteResult(noteId: string, resultId: string): Promise<void> {
    await this.repository.deleteResult(resultId, noteId);
    this.publishChange();
  }

  public subscribeToChanges(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  public getGenerationState(noteId: string): KnowledgeGenerationState {
    return this.generationStates.get(noteId) ?? { status: "idle" };
  }

  public subscribeToGeneration(noteId: string, listener: (state: KnowledgeGenerationState) => void): () => void {
    const listeners = this.listeners.get(noteId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(noteId, listeners);
    console.info("[Knowledge] Generation observer subscribed", { noteId, observerCount: listeners.size, currentStatus: this.getGenerationState(noteId).status });
    listener(this.getGenerationState(noteId));
    return () => {
      listeners.delete(listener);
      console.info("[Knowledge] Generation observer unsubscribed", { noteId, observerCount: listeners.size, currentStatus: this.getGenerationState(noteId).status });
      if (listeners.size === 0) this.listeners.delete(noteId);
    };
  }

  public generate(noteId: string, transcript: string, scenario: KnowledgeScenario): Promise<KnowledgeDocument> {
    const builtIn = getKnowledgeScenarioDefinition(scenario);
    return this.startGeneration(noteId, transcript, {
      scenario,
      name: builtIn.name,
      sections: builtIn.sections,
      templateId: null,
      templateName: builtIn.name,
    });
  }

  public generateCustom(noteId: string, transcript: string, template: KnowledgeTemplate): Promise<KnowledgeDocument> {
    return this.startGeneration(noteId, transcript, {
      scenario: "general",
      name: template.getName(),
      sections: template.getSections(),
      templateId: template.getId(),
      templateName: template.getName(),
    });
  }

  private startGeneration(noteId: string, transcript: string, definition: GenerationDefinition): Promise<KnowledgeDocument> {
    const scenario = definition.scenario;
    const state = this.getGenerationState(noteId);
    const existing = this.activeGenerations.get(noteId);
    if (existing && (state.status === "queued" || state.status === "generating" || state.status === "stopping")) {
      console.info("[Knowledge] Reusing in-flight generation", { noteId, requestId: state.requestId, requestedScenario: scenario, activeScenario: state.scenario });
      return existing;
    }

    const requestId = `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const queuedAt = Date.now();
    const deadline = new InferenceDeadline(KNOWLEDGE_GENERATION_DEADLINE_MS);
    this.lastPartialPublishedAt.delete(noteId);
    this.publish(noteId, { status: "queued", requestId, scenario, startedAt: queuedAt });
    const task = this.coordinator.schedule("knowledge", async (lifecycle) => {
      deadline.throwIfAborted((reason) => this.abortError(reason));
      const queueWaitMs = Date.now() - queuedAt;
      console.info("[Knowledge] Scheduler slot acquired", { requestId, queueWaitMs });
      this.publish(noteId, {
        status: "generating",
        requestId,
        scenario,
        startedAt: Date.now(),
        partialSections: [],
      });
      return this.runGeneration(
        noteId,
        transcript,
        definition,
        requestId,
        lifecycle,
        deadline,
        queuedAt,
        queueWaitMs,
      );
    });
    const request: ActiveKnowledgeRequest = { requestId, deadline, task, scenario, startedAt: queuedAt };
    this.activeRequests.set(noteId, request);
    deadline.signal.addEventListener("abort", () => {
      const active = this.activeRequests.get(noteId);
      if (active !== request) return;
      this.publish(noteId, { status: "stopping", requestId, scenario, startedAt: queuedAt });
      void task.cancel();
    }, { once: true });
    const promise = task.promise.catch((error: unknown) => {
      if (deadline.reason) throw this.abortError(deadline.reason);
      throw error;
    });
    this.activeGenerations.set(noteId, promise);
    void promise.then(
      () => {
        deadline.dispose();
        this.activeGenerations.delete(noteId);
        if (this.activeRequests.get(noteId) === request) this.activeRequests.delete(noteId);
        this.lastPartialPublishedAt.delete(noteId);
        this.publish(noteId, { status: "completed", requestId, scenario, finishedAt: Date.now() });
      },
      (error: unknown) => {
        deadline.dispose();
        this.activeGenerations.delete(noteId);
        if (this.activeRequests.get(noteId) === request) this.activeRequests.delete(noteId);
        this.lastPartialPublishedAt.delete(noteId);
        if (error instanceof InferenceCancelledError && !deadline.reason) {
          this.publish(noteId, { status: "idle" });
          return;
        }
        this.publish(noteId, { status: "failed", requestId, scenario, finishedAt: Date.now(), message: error instanceof Error ? error.message : "Knowledge generation did not finish. Please try again." });
      },
    );
    return promise;
  }

  public async stopGeneration(noteId: string): Promise<void> {
    const request = this.activeRequests.get(noteId);
    if (!request) return;
    request.deadline.abort("cancelled");
  }

  public async stopAllGenerations(): Promise<void> {
    await Promise.all([...this.activeRequests.keys()].map((noteId) => this.stopGeneration(noteId)));
  }

  private async runGeneration(
    noteId: string,
    transcript: string,
    definition: GenerationDefinition,
    requestId: string,
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
    queuedAt: number,
    queueWaitMs: number,
  ): Promise<KnowledgeDocument> {
    const scenario = definition.scenario;
    const generationStartedAt = Date.now();
    const input = transcript.trim();
    this.throwIfStopped(lifecycle, deadline);
    if (!input) throw new KnowledgeGenerationError("empty-transcript", "This note has no transcript to organize yet.");
    console.info("[Knowledge] Generation requested", { requestId, noteId, scenario, transcriptLength: input.length });
    console.info("[Knowledge] JSON mode selected", { requestId, jsonMode: KNOWLEDGE_JSON_MODE });

    const model = await this.llmModelService.getActiveModel();
    if (!model) throw new KnowledgeGenerationError("model-unavailable", "Choose and activate a local language model in AI Models first.");
    const modelFile = this.llmModelService.resolveModelFile(model);
    if (!modelFile.exists) throw new KnowledgeGenerationError("model-file-missing", "The active model file is missing. Reinstall it from AI Models.");

    try {
      const modelLoadStartedAt = Date.now();
      const context = await this.requests.ensureReady();
      const contextPrepareMs = Date.now() - modelLoadStartedAt;
      this.throwIfStopped(lifecycle, deadline);
      console.info("[Knowledge] Local model loaded", { requestId, modelId: model.getId(), durationMs: contextPrepareMs, contextSize: MODEL_CONTEXT_SIZE });

      const sectionShape = Object.fromEntries(definition.sections.map((section) => [section.key, []]));
      const sectionGuide = definition.sections.map((section) => `- ${section.key} (${section.title}): ${section.instruction}`).join("\n");
      const makeMessages = (note: string, recovery = false): RNLlamaOAICompatibleMessage[] => [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Extract a ${definition.name} knowledge document. Return exactly this JSON shape: {"sections":${JSON.stringify(sectionShape)}}.

FIELD RULES
${sectionGuide}

QUALITY RULES
- Each item must state concrete content from NOTE, not a topic label or vague mention.
- Include relevant facts, explanation, relationship, rationale, attribution, examples, conditions, and context when they belong together.
- Keep only the most important, non-redundant information for each section.
- Prefer 2 to 5 items for an ordinary supported section. Use 0 to 2 when the note contains little relevant information, and use more only when the section is genuinely complex.
- Never return more than ${MAX_SECTION_ITEMS} items in a section.
- Merge semantically overlapping content. Do not split examples, secondary details, repeated explanations, or synonymous content into separate items.
- Do not recreate a universal summary or key-points list, and do not output tasks or action items.
- Use [] when NOTE does not support a field. Never fill a field by guessing.
${recovery ? "- RECOVERY: Return the smallest complete valid JSON document. Prefer no more than 3 concise items per supported section and close every array and object." : ""}

NOTE:
---
${note}
---` },
      ];

      const attempts = [
        { stage: "normal", outputTokens: MAX_PREDICTED_TOKENS, recovery: false },
        { stage: "recovery", outputTokens: RECOVERY_PREDICTED_TOKENS, recovery: true },
      ] as const;
      let firstTokenAt: number | null = null;
      let timeToFirstTokenMs: number | null = null;
      let firstVisibleAt: number | null = null;
      let primaryPromptTokens: number | null = null;
      let generationMs = 0;
      let tokensPredicted = 0;
      let document: KnowledgeDocument | null = null;
      let lastOutputError: KnowledgeGenerationError | null = null;
      for (const attempt of attempts) {
        // Reserve the recovery budget from the first attempt so retrying never
        // has to discard transcript content that the normal attempt received.
        const maxPromptTokens = MODEL_CONTEXT_SIZE - RECOVERY_PREDICTED_TOKENS - CONTEXT_SAFETY_TOKENS;
        let usedInput = input;
        let messages = makeMessages(usedInput, attempt.recovery);
        let promptTokens = await this.countTokens(context, messages, lifecycle, deadline);
        if (promptTokens > maxPromptTokens) {
          let low = 0;
          let high = input.length;
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (await this.countTokens(context, makeMessages(input.slice(0, middle), attempt.recovery), lifecycle, deadline) <= maxPromptTokens) low = middle;
            else high = middle - 1;
          }
          usedInput = input.slice(0, low).trimEnd();
          messages = makeMessages(usedInput, attempt.recovery);
          promptTokens = await this.countTokens(context, messages, lifecycle, deadline);
          console.warn("[Knowledge] Transcript truncated by token budget", { requestId, stage: attempt.stage, originalLength: input.length, usedLength: usedInput.length, promptTokens, outputTokens: attempt.outputTokens });
        }
        if (attempt.stage === "normal") primaryPromptTokens = promptTokens;
        console.info("[Knowledge] Prompt prepared", { requestId, stage: attempt.stage, scenario, transcriptLength: usedInput.length, promptTokens, outputTokens: attempt.outputTokens, requestedSectionCount: definition.sections.length });

        const completionStartedAt = Date.now();
        let streamedRaw = "";
        const completionOptions = {
          messages,
          n_predict: attempt.outputTokens,
          temperature: 0,
        };
        await this.sharedContext.activateCache(`knowledge:${requestId}:${attempt.stage}`);
        this.throwIfStopped(lifecycle, deadline);
        const { result, raw } = await this.requests.complete(context, completionOptions, lifecycle, (data) => {
          const now = Date.now();
          if (firstTokenAt === null) {
            firstTokenAt = now;
            timeToFirstTokenMs = now - completionStartedAt;
            console.info("[Knowledge] First token received", { requestId, stage: attempt.stage, jsonMode: KNOWLEDGE_JSON_MODE, timeToFirstTokenMs });
          }
          streamedRaw = data.accumulated_text ?? `${streamedRaw}${data.token ?? ""}`;
          const hasVisibleContent = this.publishStreamingPreview(noteId, requestId, scenario, generationStartedAt, definition.sections, streamedRaw);
          if (hasVisibleContent && firstVisibleAt === null) {
            firstVisibleAt = now;
            console.info("[Knowledge] First visible content", { requestId, stage: attempt.stage, jsonMode: KNOWLEDGE_JSON_MODE, timeToFirstVisibleContentMs: now - queuedAt });
          }
        });
        this.throwIfStopped(lifecycle, deadline);
        const attemptGenerationMs = Date.now() - completionStartedAt;
        const attemptTokens = result.tokens_predicted ?? 0;
        generationMs += attemptGenerationMs;
        tokensPredicted += attemptTokens;
        const hitOutputLimit = completionHitOutputLimit(result, attempt.outputTokens);
        console.info("[Knowledge] Local completion finished", { requestId, stage: attempt.stage, jsonMode: KNOWLEDGE_JSON_MODE, modelId: model.getId(), durationMs: attemptGenerationMs, outputLength: raw.length, nPredict: attempt.outputTokens, tokensPredicted: attemptTokens, hitOutputLimit, temperature: 0 });
        if (hitOutputLimit) continue;
        try {
          document = this.toDocument(noteId, definition, model.getId(), raw, requestId);
          break;
        } catch (error) {
          if (!(error instanceof KnowledgeGenerationError)) throw error;
          lastOutputError = error;
          if (attempt.stage === "normal") console.warn("[Knowledge] Compact recovery required", { requestId, reason: error.code });
        }
      }
      if (!document) throw lastOutputError ?? new KnowledgeGenerationError("invalid-output", "The local model did not return a complete Knowledge result.");
      const itemCount = document.getSections().reduce((count, section) => count + section.items.length, 0);
      console.info("[Knowledge] Model output parsed", { requestId, sectionCount: document.getSections().length, itemCount });
      lifecycle.throwIfCancelled();
      await this.repository.save(document);
      this.publishChange();
      console.info("[Knowledge] Generation timing", { requestId, jsonMode: KNOWLEDGE_JSON_MODE, queueWaitMs, contextPrepareMs, promptTokens: primaryPromptTokens, timeToFirstTokenMs, timeToFirstVisibleContentMs: firstVisibleAt === null ? null : firstVisibleAt - queuedAt, generationMs, tokensPredicted, tokensPerSecond: generationMs > 0 ? tokensPredicted / (generationMs / 1000) : 0 });
      console.info("[Knowledge] Generation completed", { requestId, noteId, scenario, modelId: model.getId(), totalDurationMs: Date.now() - generationStartedAt, itemCount });
      return document;
    } catch (error) {
      if (error instanceof InferenceCancelledError) {
        console.info("[Knowledge] Generation cancelled", { requestId, noteId, scenario });
        throw error;
      }
      console.error("[Knowledge] Generation failed", { requestId, noteId, scenario, durationMs: Date.now() - generationStartedAt, errorCode: error instanceof KnowledgeGenerationError ? error.code : "unexpected", error });
      if (deadline.reason) throw this.abortError(deadline.reason);
      if (error instanceof KnowledgeGenerationError) throw error;
      throw new KnowledgeGenerationError("generation-failed", "Knowledge generation did not finish. Please try again.", { cause: error instanceof Error ? error : undefined });
    } finally { /* Shared runtime remains READY. */ }
  }

  private publish(noteId: string, state: KnowledgeGenerationState): void {
    const previousStatus = this.getGenerationState(noteId).status;
    this.generationStates.set(noteId, state);
    if (previousStatus !== state.status) console.info("[Knowledge] Generation state changed", { noteId, requestId: "requestId" in state ? state.requestId : null, scenario: "scenario" in state ? state.scenario : null, previousStatus, status: state.status, observerCount: this.listeners.get(noteId)?.size ?? 0 });
    this.listeners.get(noteId)?.forEach((listener) => listener(state));
  }

  private publishChange(): void {
    this.changeListeners.forEach((listener) => listener());
  }

  private publishStreamingPreview(
    noteId: string,
    requestId: string,
    scenario: KnowledgeScenario,
    startedAt: number,
    sections: GenerationDefinition["sections"],
    raw: string,
  ): boolean {
    const now = Date.now();
    if (now - (this.lastPartialPublishedAt.get(noteId) ?? 0) < 100) return false;
    this.lastPartialPublishedAt.set(noteId, now);
    const partialSections = sections.map((section) => ({
      key: section.key,
      title: section.title,
      items: extractStreamingStringArray(raw, section.key),
    })).filter((section) => section.items.length > 0);
    const current = this.getGenerationState(noteId);
    if (current.status === "generating" && sameKnowledgeSections(current.partialSections, partialSections)) return partialSections.length > 0;
    this.publish(noteId, { status: "generating", requestId, scenario, startedAt, partialSections });
    return partialSections.length > 0;
  }

  private async countTokens(
    context: LlamaContext,
    messages: RNLlamaOAICompatibleMessage[],
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
  ): Promise<number> {
    this.throwIfStopped(lifecycle, deadline);
    const count = await this.requests.countMessageTokens(context, messages);
    this.throwIfStopped(lifecycle, deadline);
    return count;
  }

  private throwIfStopped(lifecycle: InferenceTaskContext, deadline: InferenceDeadline): void {
    deadline.throwIfAborted((reason) => this.abortError(reason));
    lifecycle.throwIfCancelled();
  }

  private abortError(reason: InferenceAbortReason): KnowledgeGenerationError {
    return reason === "timeout"
      ? new KnowledgeGenerationError("timeout", "Knowledge reached its 2-minute limit. Existing results are safe; please retry.")
      : new KnowledgeGenerationError("cancelled", "Knowledge generation was stopped. Existing results are safe; you can retry.");
  }

  private toDocument(noteId: string, definition: GenerationDefinition, modelId: string, raw: string, requestId: string): KnowledgeDocument {
    let parsed: ModelOutput;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match?.[0] ?? raw) as ModelOutput;
    } catch (error) {
      console.warn("[Knowledge] Model returned invalid JSON", { requestId, outputLength: raw.length });
      throw new KnowledgeGenerationError("invalid-output", "The local model returned an unreadable result. Try again or select a stronger model.", { cause: error instanceof Error ? error : undefined });
    }
    if (!parsed.sections || typeof parsed.sections !== "object" || Array.isArray(parsed.sections)) {
      console.warn("[Knowledge] Model returned incomplete JSON", { requestId, hasSections: Boolean(parsed.sections && typeof parsed.sections === "object") });
      throw new KnowledgeGenerationError("invalid-output", "The local model returned an incomplete result. Please try again.");
    }
    if (definition.sections.some((section) => !Array.isArray(parsed.sections?.[section.key]))) {
      console.warn("[Knowledge] Model omitted required section arrays", { requestId });
      throw new KnowledgeGenerationError("invalid-output", "The local model returned an incomplete result. Please try again.");
    }
    const sections: KnowledgeSection[] = definition.sections.map((section) => ({
      key: section.key,
      title: section.title,
      items: Array.isArray(parsed.sections?.[section.key])
        ? (parsed.sections[section.key] as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, MAX_SECTION_ITEMS)
        : [],
    }));
    const now = new Date().toISOString();
    // Keep the legacy database column empty for compatibility; scenario knowledge no longer owns a summary.
    return new KnowledgeDocument(
      `knowledge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      noteId,
      definition.scenario,
      "",
      sections,
      modelId,
      now,
      now,
      definition.templateId,
      definition.templateName,
      false,
    );
  }
}

export type KnowledgeGenerationState =
  | { status: "idle" }
  | { status: "queued"; requestId: string; scenario: KnowledgeScenario; startedAt: number }
  | { status: "generating"; requestId: string; scenario: KnowledgeScenario; startedAt: number; partialSections: KnowledgeSection[] }
  | { status: "stopping"; requestId: string; scenario: KnowledgeScenario; startedAt: number }
  | { status: "completed"; requestId: string; scenario: KnowledgeScenario; finishedAt: number }
  | { status: "failed"; requestId: string; scenario: KnowledgeScenario; finishedAt: number; message: string };

function sameKnowledgeSections(left: KnowledgeSection[], right: KnowledgeSection[]): boolean {
  return left.length === right.length && left.every((section, index) => {
    const other = right[index];
    return section.key === other?.key && section.title === other.title
      && section.items.length === other.items.length
      && section.items.every((item, itemIndex) => item === other.items[itemIndex]);
  });
}
