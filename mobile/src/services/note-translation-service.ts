import type { LlamaContext, NativeCompletionResult, RNLlamaOAICompatibleMessage } from "llama.rn";

import type { CoreNoteInsight } from "@/domain/core-note-insight/core-note-insight";
import type { KnowledgeDocument } from "@/domain/knowledge/knowledge-document";
import { NoteTranslation, type NoteTranslationPayload, type NoteTranslationSection } from "@/domain/note-translation/note-translation";
import { NoteTranslationError } from "@/errors/note-translation-error";
import type { ContentLanguage } from "@/localization/i18n";
import { NoteTranslationRepository } from "@/repositories/note-translation-repository";
import { LlmModelService } from "@/services/llm-model-service";
import { InferenceCancelledError, type InferenceTask, type InferenceTaskContext, LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { LlmRequestService } from "@/services/llm-request-service";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";

type TranslationInput = { key: string; text: string };
type GenerationMetrics = { generationMs: number; promptPrefillMs: number; tokenCount: number; timeToFirstTokenMs: number | null; tokensPerSecond: number };

export type NoteTranslationOperationState =
  | { status: "idle" }
  | { status: "translating"; requestId: string; noteId: string; section: NoteTranslationSection; targetLanguage: string; partialPayload?: NoteTranslationPayload }
  | { status: "completed"; requestId: string; noteId: string; section: NoteTranslationSection }
  | { status: "failed"; requestId: string; noteId: string; section: NoteTranslationSection };

export class NoteTranslationService {
  private state: NoteTranslationOperationState = { status: "idle" };
  private activePromise: Promise<NoteTranslation> | null = null;
  private activeTask: InferenceTask<NoteTranslation> | null = null;
  private lifecycle: InferenceTaskContext | null = null;
  private readonly listeners = new Set<(state: NoteTranslationOperationState) => void>();

  public constructor(
    private readonly repository: NoteTranslationRepository,
    private readonly llmModelService: LlmModelService,
    private readonly coordinator: LocalLlmCoordinator,
    private readonly sharedContext: SharedLlmContextService,
    private readonly requests: LlmRequestService,
  ) {}

  public cancel(): Promise<void> { return this.activeTask?.cancel() ?? Promise.resolve(); }
  public async ensureReady(): Promise<void> { await this.coordinator.runExclusive("translation", async () => { await this.requests.ensureReady(); }); }

  public getForNote(noteId: string): Promise<NoteTranslation | null> { return this.repository.findByNoteId(noteId); }
  public getOperationState(): NoteTranslationOperationState { return this.state; }
  public subscribe(listener: (state: NoteTranslationOperationState) => void): () => void { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }

  public async restoreOriginal(noteId: string, section: NoteTranslationSection): Promise<NoteTranslation | null> {
    const current = await this.repository.findByNoteId(noteId);
    if (!current) return null;
    await this.repository.setActiveSections(noteId, current.getActiveSections().filter((value) => value !== section));
    return this.repository.findByNoteId(noteId);
  }

  public translate(noteId: string, section: NoteTranslationSection, targetLocale: ContentLanguage, targetLanguage: string, transcript: string, coreInsights: CoreNoteInsight | null, knowledge: KnowledgeDocument | null): Promise<NoteTranslation> {
    if (this.activePromise) {
      if (this.state.status === "translating" && this.state.noteId === noteId && this.state.section === section) return this.activePromise;
      throw new NoteTranslationError("Another local translation is already running.");
    }
    const requestId = `translation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestedAt = Date.now();
    console.info("[Translation] Translation requested", { requestId, noteId, section, targetLocale });
    this.publish({ status: "translating", requestId, noteId, section, targetLanguage });
    const task = this.coordinator.schedule("translation", async (lifecycle) => {
      console.info("[Translation] Inference slot acquired", { requestId, waitMs: Date.now() - requestedAt });
      this.lifecycle = lifecycle;
      try { return await this.runTranslation(requestId, noteId, section, targetLocale, targetLanguage, transcript, coreInsights, knowledge); }
      finally { this.lifecycle = null; }
    });
    this.activeTask = task;
    const promise = task.promise.then((translation) => {
      this.publish({ status: "completed", requestId, noteId, section });
      return translation;
    }).catch((error) => {
      if (error instanceof InferenceCancelledError) { this.publish({ status: "idle" }); throw error; }
      this.publish({ status: "failed", requestId, noteId, section });
      throw error;
    }).finally(() => { this.activePromise = null; this.activeTask = null; });
    this.activePromise = promise;
    return promise;
  }

  private async runTranslation(requestId: string, noteId: string, section: NoteTranslationSection, targetLocale: ContentLanguage, targetLanguage: string, transcript: string, coreInsights: CoreNoteInsight | null, knowledge: KnowledgeDocument | null): Promise<NoteTranslation> {
    const model = await this.llmModelService.getActiveModel();
    if (!model) throw new NoteTranslationError("Choose and activate a local language model in AI Models first.");
    const modelFile = this.llmModelService.resolveModelFile(model);
    if (!modelFile.exists) throw new NoteTranslationError("The active model file is missing. Reinstall it from AI Models.");
    const inputs = this.collectStrings(section, transcript, coreInsights, knowledge);
    if (!inputs.length) throw new NoteTranslationError("There is no content in this section to translate.");

    try {
      const prepared = await this.sharedContext.prepare(model.getId(), modelFile.uri);
      console.info("[Translation] Context prepared", { requestId, modelId: model.getId(), contextPrepareMs: prepared.contextPrepareMs, contextReused: prepared.reused });
      await this.sharedContext.activateCache(`translation:${requestId}:0`);
      const previous = await this.repository.findByNoteId(noteId);
      const sameLanguage = previous?.getTargetLanguage() === targetLanguage;
      const currentSources = new Map([
        ...this.collectStrings("transcript", transcript, coreInsights, knowledge),
        ...this.collectStrings("insights", transcript, coreInsights, knowledge),
        ...this.collectStrings("knowledge", transcript, coreInsights, knowledge),
      ].map((input) => [input.key, input.text]));
      const previousPayload = sameLanguage ? previous?.getPayload() : undefined;
      const previousSources = previousPayload?.sources ?? {};
      const reusableStrings = Object.fromEntries(Object.entries(previousPayload?.strings ?? {}).filter(([key]) => previousSources[key] === currentSources.get(key)));
      const payload: NoteTranslationPayload = {
        transcript: previousSources.transcript === transcript ? previousPayload?.transcript ?? "" : "",
        strings: reusableStrings,
        sources: Object.fromEntries(Array.from(currentSources).filter(([key]) => key === "transcript" ? previousSources.transcript === transcript : key in reusableStrings)),
        languageCode: targetLocale,
      };
      const metrics: GenerationMetrics[] = [];
      for (const [index, input] of inputs.entries()) {
        if (index > 0) {
          await this.sharedContext.activateCache(`translation:${requestId}:${index}`);
        }
        metrics.push(await this.streamField(prepared.context, requestId, noteId, section, targetLocale, targetLanguage, input, payload));
      }

      const now = new Date().toISOString();
      const activeSections = sameLanguage ? Array.from(new Set([...(previous?.getActiveSections() ?? []), section])) : [section];
      const translation = new NoteTranslation(noteId, targetLanguage, payload, activeSections, model.getId(), previous?.getCreatedAt() ?? now, now);
      this.lifecycle?.throwIfCancelled();
      await this.repository.save(translation);
      const generationMs = metrics.reduce((sum, item) => sum + item.generationMs, 0);
      const tokenCount = metrics.reduce((sum, item) => sum + item.tokenCount, 0);
      console.info("[Translation] Translation completed", { requestId, contextPrepareMs: prepared.contextPrepareMs, contextReused: prepared.reused, generationMs, promptPrefillMs: metrics.reduce((sum, item) => sum + item.promptPrefillMs, 0), tokenCount, tokensPerSecond: generationMs > 0 ? tokenCount / (generationMs / 1000) : 0, timeToFirstTokenMs: metrics[0]?.timeToFirstTokenMs ?? null, fieldCount: inputs.length });
      return translation;
    } catch (error) {
      if (error instanceof InferenceCancelledError) throw error;
      if (error instanceof NoteTranslationError) throw error;
      throw new NoteTranslationError("The local translation did not finish. Please try again or select a stronger model.", { cause: error instanceof Error ? error : undefined });
    }
  }

  private async streamField(context: LlamaContext, requestId: string, noteId: string, section: NoteTranslationSection, targetLocale: ContentLanguage, targetLanguage: string, input: TranslationInput, payload: NoteTranslationPayload): Promise<GenerationMetrics> {
    const generationStartedAt = Date.now();
    let firstTokenAt: number | null = null;
    let streamedText = "";
    console.info("[Translation] Generation started", { requestId, field: input.key, sourceCharacters: input.text.length });
    let result: NativeCompletionResult;
    try {
      const completed = await this.requests.complete(context, { messages: this.translationMessages(targetLocale, targetLanguage, input.text), n_predict: this.translationTokenBudget(input.text), temperature: 0, enable_thinking: false, reasoning_format: "none" }, this.lifecycle ?? undefined, (data) => {
        if (firstTokenAt === null) { firstTokenAt = Date.now(); console.info("[Translation] First token received", { requestId, field: input.key, timeToFirstTokenMs: firstTokenAt - generationStartedAt }); }
        streamedText = data.accumulated_text ?? `${streamedText}${data.token}`;
        this.setPayloadValue(payload, input.key, streamedText);
        this.publish({ status: "translating", requestId, noteId, section, targetLanguage, partialPayload: this.copyPayload(payload) });
      });
      result = completed.result;
    } catch (error) {
      this.restorePayloadValue(payload, input);
      this.publish({ status: "translating", requestId, noteId, section, targetLanguage, partialPayload: this.copyPayload(payload) });
      throw error;
    }
    const completedText = this.stripExactTextWrapper(result.content || result.text || streamedText);
    if (!completedText) { this.restorePayloadValue(payload, input); throw new Error(`The model returned an empty translation for ${input.key}.`); }
    this.setPayloadValue(payload, input.key, completedText);
    payload.sources = { ...payload.sources, [input.key]: input.text };
    this.publish({ status: "translating", requestId, noteId, section, targetLanguage, partialPayload: this.copyPayload(payload) });
    const generationMs = Date.now() - generationStartedAt;
    const tokenCount = result.tokens_predicted ?? 0;
    const metrics = { generationMs, promptPrefillMs: result.timings?.prompt_ms ?? 0, tokenCount, timeToFirstTokenMs: firstTokenAt === null ? null : firstTokenAt - generationStartedAt, tokensPerSecond: result.timings?.predicted_per_second ?? (generationMs > 0 ? tokenCount / (generationMs / 1000) : 0) };
    console.info("[Translation] Generation completed", { requestId, field: input.key, ...metrics });
    return metrics;
  }

  private translationMessages(targetLocale: ContentLanguage, targetLanguage: string, text: string): RNLlamaOAICompatibleMessage[] {
    return [{ role: "system", content: `Translate the following text into ${targetLanguage} (${targetLocale}). Return only the translation. Do not include explanations, labels, delimiters, or the original text.` }, { role: "user", content: `SOURCE:\n${text}` }];
  }

  private translationTokenBudget(text: string): number { return Math.min(1536, Math.max(128, Math.ceil(text.length * 1.25))); }
  private stripExactTextWrapper(text: string): string { return text.trim().replace(/^<text>\s*/, "").replace(/\s*<\/text>$/, "").trim(); }
  private publish(state: NoteTranslationOperationState): void { this.state = state; this.listeners.forEach((listener) => listener(state)); }
  private setPayloadValue(payload: NoteTranslationPayload, key: string, value: string): void { if (key === "transcript") payload.transcript = value; else payload.strings[key] = value; }
  private restorePayloadValue(payload: NoteTranslationPayload, input: TranslationInput): void { if (input.key === "transcript") payload.transcript = input.text; else delete payload.strings[input.key]; }
  private copyPayload(payload: NoteTranslationPayload): NoteTranslationPayload { return { transcript: payload.transcript, strings: { ...payload.strings }, sources: { ...payload.sources }, languageCode: payload.languageCode }; }

  private collectStrings(section: NoteTranslationSection, transcript: string, insight: CoreNoteInsight | null, knowledge: KnowledgeDocument | null): TranslationInput[] {
    const values: TranslationInput[] = section === "transcript" ? [{ key: "transcript", text: transcript }] : [];
    if (section === "insights" && insight) {
      values.push({ key: "insight.summary", text: insight.getSummary() });
      insight.getKeyPoints().forEach((text, index) => values.push({ key: `insight.keyPoint.${index}`, text }));
      insight.getTasks().forEach((task, taskIndex) => {
        values.push({ key: `insight.task.${taskIndex}.title`, text: task.title });
        if (task.description) values.push({ key: `insight.task.${taskIndex}.description`, text: task.description });
        task.actionItems.forEach((item, itemIndex) => { values.push({ key: `insight.task.${taskIndex}.action.${itemIndex}.title`, text: item.title }); if (item.description) values.push({ key: `insight.task.${taskIndex}.action.${itemIndex}.description`, text: item.description }); });
      });
      insight.getUnassignedActionItems().forEach((item, index) => { values.push({ key: `insight.action.${index}.title`, text: item.title }); if (item.description) values.push({ key: `insight.action.${index}.description`, text: item.description }); });
    }
    if (section === "knowledge") knowledge?.getSections().forEach((knowledgeSection, sectionIndex) => { values.push({ key: `knowledge.section.${sectionIndex}.title`, text: knowledgeSection.title }); knowledgeSection.items.forEach((text, itemIndex) => values.push({ key: `knowledge.section.${sectionIndex}.item.${itemIndex}`, text })); });
    return values.filter((item) => item.text.trim().length > 0);
  }
}
