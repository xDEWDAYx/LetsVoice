import { type LlamaContext, type RNLlamaOAICompatibleMessage } from "llama.rn";

import { CoreNoteInsight, type CoreActionItem, type CoreTask } from "@/domain/core-note-insight/core-note-insight";
import { CoreNoteInsightGenerationError } from "@/errors/core-note-insight-generation-error";
import { CoreNoteInsightRepository } from "@/repositories/core-note-insight-repository";
import {
  completionHitOutputLimit,
  extractFirstJsonObject,
  fallbackContentFromTranscript,
  runAdaptiveStructuredBatches,
  sanitizeAdaptiveIntentBatches,
  splitIntentTranscript,
  type AdaptiveCompletionMode,
  type StructuredStageResult,
} from "@/services/core-note-insight-generation-policy";
import {
  annotateCoreNoteDates,
  getLocalReferenceTime,
  resolveCoreNoteTime,
  stripCoreNoteDateAnnotations,
  type ResolvedCoreNoteTime,
} from "@/services/core-note-time";
import { LlmModelService } from "@/services/llm-model-service";
import { InferenceDeadline, type InferenceAbortReason } from "@/services/inference-deadline";
import { STRUCTURED_NOTE_GENERATION_DEADLINE_MS } from "@/constants/local-ai-deadlines";
import { InferenceCancelledError, type InferenceTask, type InferenceTaskContext, LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { LlmRequestService } from "@/services/llm-request-service";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";
import { extractStreamingObjectStringFields, extractStreamingString, extractStreamingStringArray } from "@/services/structured-stream-preview";
import {
  annotateTaskRecurrences,
  normalizeTaskRecurrence,
  recurrenceValue,
  recurringSeriesKey,
  stripTaskRecurrenceAnnotations,
} from "@/services/task-recurrence";

type OutputItem = { title?: unknown; description?: unknown; startsAtExpression?: unknown; dueAtExpression?: unknown };
type OutputTask = OutputItem & { actionItems?: unknown; recurrence?: unknown };
type ContentOutput = { summary?: unknown; keyPoints?: unknown };
type TaskOutput = { tasks?: unknown };
type StructuredOutput = ContentOutput & TaskOutput;
type ActiveCoreRequest = {
  requestId: string;
  deadline: InferenceDeadline;
  task: InferenceTask<CoreNoteInsight>;
  startedAt: number;
};

const CONTEXT_SIZE = 6144;
const CONTENT_TOKENS = 1536;
const CONTENT_RETRY_TOKENS = 2304;
const TASK_TOKENS = 1536;
const TASK_RETRY_TOKENS = 2304;
const STRUCTURED_TOKENS = 3072;
const SAFETY_TOKENS = 192;
const EMPTY_VALUE_STRINGS = new Set(["null", "unknown", "undefined", "none", "n/a", "na", "not specified", "unspecified"]);
const SYSTEM = `Perform grounded summarization and extraction from the user's NOTE.
Use only information supported by NOTE. You may compress, reorder, merge repetition, and state relationships explicit in context. Never add outside knowledge or invent facts, people, commands, decisions, dates, times, places, or tasks. Preserve uncertainty and the note's primary language. Empty categories must stay empty. Return only JSON matching the schema.`;
const CONTENT_PROMPT = `Produce an information summary and concrete key points.

SUMMARY
- Answer: what must the user know to understand this note without rereading it?
- Use coherent, complete sentences with necessary context. It is not a title, topic label, or vague one-line description.
- Compress instead of retelling every sentence. Keep the summary within 180 words or 500 Chinese characters.

KEY POINTS
- Each item states one specific supported fact, explanation, cause/effect, condition, limitation, conclusion, decision, method, caution, or consequential detail.
- Say what the note says about a subject, not merely that it discusses the subject.
- Keep each item concise: use one short, self-contained sentence and include only one main point.
- Prefer 3 to 5 key points for an ordinary note. Use 1 or 2 when the note contains little meaningful information, and use more only when the content is genuinely complex.
- Never return more than 6 key points.
- Merge semantically related information instead of extracting sentence by sentence.
- Prefer direct wording. Remove setup, repetition, filler, examples, secondary details, repeated explanations, and details already clear from another key point.
- Include a key point only when omitting it would materially reduce the user's understanding of the note.
- Avoid semantic duplicates and do not turn examples into general facts.

Silently identify important propositions and check coverage before answering. Do not output that analysis.`;
const TASK_PROMPT = `Extract only genuine tasks. Accuracy and an empty array are more important than filling fields.

TASKS
- Include only an action the note explicitly assigns, requests, commits to, or clearly leaves to be done.
- Exclude facts, explanations, unaccepted advice, examples, tutorials/demonstrations, completed actions, and descriptions of how something generally works.
- A dated statement about work that already happened is still a fact, not a task.
- An action verb alone does not imply a task.
- If NOTE says remind/remember and names a concrete unfinished action, represent the underlying action as a task and copy the stated reminder date or time into dueAtExpression. Do not create a separate reminder entity. Reminder wording without a concrete action is not a task.
- A scheduled event named as a noun is still concrete when NOTE explicitly asks for a reminder. For example, "I have a work meeting" or "我有一场工作会议" is a task even without a verb such as attend.
- Keep one task per underlying commitment even when NOTE repeats it. An event plus a reminder to act for that event is one task dated at the actionable reminder time, not two tasks.
- Clearly unfinished obligations still count when phrased indirectly, but complaints, wishes, or vague aspirations without a concrete action do not.
- actionItems may contain only distinct steps explicitly present in NOTE. Never invent a plan. Use [] when no separate steps were stated.
- Do not duplicate a task title as an action item or create redundant parent/child wording.
- For an explicitly recurring task, set recurrence to daily, weekdays, weekly,
  biweekly, or monthly. Otherwise use null. Do not infer recurrence from one date.
- Recurring phrases are pre-annotated as phrase(YYYY-MM-DD, REPEAT=kind).
  Copy that date into dueAtExpression and kind into recurrence. Never invent a
  recurrence without this annotation, and omit the annotation from the title.

TIME FIELDS
- NOTE contains authoritative date annotations such as phrase(YYYY-MM-DD). Copy
  the complete annotated phrase into the matching *Expression field. Never
  calculate weekdays or dates yourself and never choose a different date.
- If one sentence contains several commitments with different date annotations,
  keep each date with its own task. An event plus a reminder to act for that
  event remains one task and uses the actionable reminder annotation.
- Do not include internal date or recurrence annotations in titles or descriptions.
- Use JSON null when NOTE provides no expression for a field. Never invent a year, month, day, clock time, end time, or timezone.
- Keep words such as "around", "afternoon", and "evening" in the copied expression.
- For an unknown optional field, output the JSON literal null. Never output the strings "null", "unknown", "undefined", "N/A", or "none".

Silently test every candidate against these rules before answering. Do not output that analysis.`;
const STRUCTURED_PROMPT = `${CONTENT_PROMPT}\n\n${TASK_PROMPT}`;

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const itemProperties = { title: { type: "string" }, description: nullableString, startsAtExpression: nullableString, dueAtExpression: nullableString } as const;
const itemRequired = ["title", "description", "startsAtExpression", "dueAtExpression"];
const contentSchema = { type: "object", properties: { summary: { type: "string" }, keyPoints: { type: "array", items: { type: "string" }, maxItems: 6 } }, required: ["summary", "keyPoints"], additionalProperties: false } as const;
const taskSchema = {
  type: "object",
  properties: {
    tasks: { type: "array", items: { type: "object", properties: { ...itemProperties, recurrence: nullableString, actionItems: { type: "array", items: { type: "object", properties: itemProperties, required: itemRequired, additionalProperties: false } } }, required: [...itemRequired, "recurrence", "actionItems"], additionalProperties: false } },
  },
  required: ["tasks"], additionalProperties: false,
} as const;
const structuredSchema = {
  type: "object",
  properties: { ...contentSchema.properties, ...taskSchema.properties },
  required: [...contentSchema.required, ...taskSchema.required],
  additionalProperties: false,
} as const;

export class CoreNoteInsightService {
  public getDashboardItems() {
    return this.repository.findDashboardItems();
  }

  private readonly generationStates = new Map<string, CoreInsightGenerationState>();
  private readonly activeGenerations = new Map<string, Promise<CoreNoteInsight>>();
  private readonly activeRequests = new Map<string, ActiveCoreRequest>();
  private readonly listeners = new Map<string, Set<(state: CoreInsightGenerationState) => void>>();
  private readonly changeListeners = new Set<() => void>();
  private readonly lastPartialPublishedAt = new Map<string, number>();
  private cacheSequence = 0;

  public constructor(
    private readonly repository: CoreNoteInsightRepository,
    private readonly llmModelService: LlmModelService,
    private readonly coordinator: LocalLlmCoordinator,
    private readonly requests: LlmRequestService,
    private readonly sharedContext: SharedLlmContextService,
  ) {}
  public cancelGeneration(noteId: string): Promise<void> { return this.stopGeneration(noteId); }
  public async ensureReady(): Promise<void> { await this.coordinator.runExclusive("core-insights", async () => { await this.requests.ensureReady(); }); }
  public getForNote(noteId: string): Promise<CoreNoteInsight | null> { return this.repository.findByNoteId(noteId); }

  public subscribeToChanges(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  public async setTaskCompleted(noteId: string, taskId: string, completed: boolean): Promise<CoreNoteInsight> {
    await this.repository.setTaskCompleted(noteId, taskId, completed);
    this.changeListeners.forEach((listener) => listener());
    return this.getUpdatedInsight(noteId);
  }

  public async setTaskPinned(noteId: string, taskId: string, pinned: boolean): Promise<CoreNoteInsight> {
    await this.repository.setTaskPinned(noteId, taskId, pinned);
    return this.getUpdatedInsight(noteId);
  }

  private async getUpdatedInsight(noteId: string): Promise<CoreNoteInsight> {
    const insight = await this.repository.findByNoteId(noteId);
    if (!insight) throw new CoreNoteInsightGenerationError("invalid-output", "Structured Note is no longer available.");
    return insight;
  }

  public getGenerationState(noteId: string): CoreInsightGenerationState {
    return this.generationStates.get(noteId) ?? { status: "idle" };
  }

  public subscribeToGeneration(noteId: string, listener: (state: CoreInsightGenerationState) => void): () => void {
    const listeners = this.listeners.get(noteId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(noteId, listeners);
    console.info("[CoreInsights] Generation observer subscribed", { noteId, observerCount: listeners.size, currentStatus: this.getGenerationState(noteId).status });
    listener(this.getGenerationState(noteId));
    return () => {
      listeners.delete(listener);
      console.info("[CoreInsights] Generation observer unsubscribed", { noteId, observerCount: listeners.size, currentStatus: this.getGenerationState(noteId).status });
      if (listeners.size === 0) this.listeners.delete(noteId);
    };
  }

  public generate(noteId: string, transcript: string, referenceTime?: string): Promise<CoreNoteInsight> {
    const state = this.getGenerationState(noteId);
    const existing = this.activeGenerations.get(noteId);
    if (existing && (state.status === "queued" || state.status === "generating" || state.status === "stopping")) {
      console.info("[CoreInsights] Reusing in-flight generation", { noteId, requestId: state.requestId });
      return existing;
    }

    const requestId = `core-insights-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const deadline = new InferenceDeadline(STRUCTURED_NOTE_GENERATION_DEADLINE_MS);
    this.lastPartialPublishedAt.delete(noteId);
    this.publish(noteId, { status: "queued", requestId, startedAt });
    const task = this.coordinator.schedule("core-insights", async (lifecycle) => {
      deadline.throwIfAborted((reason) => this.abortError(reason));
      this.publish(noteId, {
        status: "generating",
        requestId,
        startedAt: Date.now(),
        partial: emptyCoreInsightPreview("content"),
      });
      return this.runGeneration(noteId, transcript, requestId, lifecycle, deadline, referenceTime);
    });
    const request: ActiveCoreRequest = { requestId, deadline, task, startedAt };
    this.activeRequests.set(noteId, request);
    deadline.signal.addEventListener("abort", () => {
      const active = this.activeRequests.get(noteId);
      if (active !== request) return;
      this.publish(noteId, { status: "stopping", requestId, startedAt });
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
        this.publish(noteId, { status: "completed", requestId, finishedAt: Date.now() });
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
        this.publish(noteId, { status: "failed", requestId, finishedAt: Date.now(), message: error instanceof Error ? error.message : "Structured Note did not finish. Please try again." });
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
    requestId: string,
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
    referenceTime?: string,
  ): Promise<CoreNoteInsight> {
    const startedAt = Date.now();
    const input = transcript.trim();
    this.throwIfStopped(lifecycle, deadline);
    console.info("[CoreInsights] Input received", { requestId, noteId, inputLength: input.length });
    if (!input) throw new CoreNoteInsightGenerationError("empty-transcript", "This note has no text to analyze yet.");
    const model = await this.llmModelService.getActiveModel();
    if (!model) throw new CoreNoteInsightGenerationError("model-unavailable", "Choose and activate a local language model in AI Models first.");
    const modelFile = this.llmModelService.resolveModelFile(model);
    if (!modelFile.exists) throw new CoreNoteInsightGenerationError("model-file-missing", "The active model file is missing. Reinstall it from AI Models.");

    try {
      console.info("[CoreInsights] Local LLM starting", { requestId, noteId, modelId: model.getId(), contextSize: CONTEXT_SIZE, pipeline: "content+batched-tasks" });
      const context = await this.requests.ensureReady();
      this.throwIfStopped(lifecycle, deadline);
      const parsedReference = referenceTime ? new Date(referenceTime) : null;
      const reference = getLocalReferenceTime(
        parsedReference && !Number.isNaN(parsedReference.getTime()) ? parsedReference : new Date(),
      );
      console.info("[CoreInsights] Local time reference captured", { requestId, referenceTime: reference.localIso, timezone: reference.timezone });
      const timeContext = `${TASK_PROMPT}\n\nREFERENCE TIME (device local clock; context only, do not copy it unless NOTE contains that time):\n${reference.localIso}\nDEVICE TIMEZONE:\n${reference.timezone}`;
      const annotatedTaskInput = annotateCoreNoteDates(annotateTaskRecurrences(input, reference.instant), reference.instant);
      const structuredInstruction = `${STRUCTURED_PROMPT}\n\nREFERENCE TIME (device local clock; context only, do not copy it unless NOTE contains that time):\n${reference.localIso}\nDEVICE TIMEZONE:\n${reference.timezone}\nRecurrence annotations inside NOTE are extraction hints only. Do not repeat them in summary, key points, titles, or descriptions.`;
      const primary = await this.generateStructured(context, structuredInstruction, annotatedTaskInput, requestId, noteId, lifecycle, deadline);
      let content: ContentOutput;
      let tasks: TaskOutput;
      if (primary) {
        content = cleanStructuredContent(primary);
        tasks = sanitizeAdaptiveIntentBatches({ values: [{ input: annotatedTaskInput, value: primary }], failures: [] });
        console.info("[CoreInsights] Single-stage pipeline completed", { requestId });
      } else {
        console.info("[CoreInsights] Falling back to content and batched tasks", { requestId });
        this.publish(noteId, { status: "generating", requestId, startedAt, partial: emptyCoreInsightPreview("content") });
        content = await this.generateContent(context, input, requestId, noteId, lifecycle, deadline);
        this.publish(noteId, { status: "generating", requestId, startedAt, partial: {
          phase: "intents",
          summary: typeof content.summary === "string" ? content.summary.trim() : "",
          keyPoints: Array.isArray(content.keyPoints) ? this.uniqueStrings(content.keyPoints) : [],
          tasks: [],
        } });
        tasks = await this.generateTasks(context, timeContext, annotatedTaskInput, requestId, noteId, content, lifecycle, deadline);
      }
      const insight = this.parse(noteId, model.getId(), content, tasks, requestId, reference.instant, reference.localIso, reference.timezone);
      this.throwIfStopped(lifecycle, deadline);
      console.info("[CoreInsights] Structured output parsed", { requestId, summaryLength: insight.getSummary().length, keyPointCount: insight.getKeyPoints().length, taskCount: insight.getTasks().length, actionItemCount: insight.getActionItems().length });
      await this.repository.save(insight);
      this.changeListeners.forEach((listener) => listener());
      console.info("[CoreInsights] Saved and ready for display", { requestId, noteId, durationMs: Date.now() - startedAt });
      return insight;
    } catch (error) {
      if (error instanceof InferenceCancelledError) {
        console.info("[CoreInsights] Generation cancelled", { requestId, noteId });
        throw error;
      }
      console.error("[CoreInsights] Generation failed", { requestId, noteId, durationMs: Date.now() - startedAt, errorCode: error instanceof CoreNoteInsightGenerationError ? error.code : "unexpected", error });
      if (deadline.reason) throw this.abortError(deadline.reason);
      if (error instanceof CoreNoteInsightGenerationError) throw error;
      throw new CoreNoteInsightGenerationError("generation-failed", "Structured Note did not finish. Please try again.", { cause: error instanceof Error ? error : undefined });
    } finally { /* Shared runtime remains READY. */ }
  }

  private async generateContent(
    context: LlamaContext,
    input: string,
    requestId: string,
    noteId: string,
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
  ): Promise<ContentOutput> {
    const attempts = [
      { instruction: CONTENT_PROMPT, tokens: CONTENT_TOKENS, stage: "content" },
      {
        instruction: `${CONTENT_PROMPT}\n\nRECOVERY MODE: Return the smallest complete valid JSON object. Use one concise summary and no more than 8 key points. Close every string, array, and object.`,
        tokens: CONTENT_RETRY_TOKENS,
        stage: "content-recovery",
      },
    ];
    for (const attempt of attempts) {
      const result = await this.runStage(context, attempt.instruction, input, contentSchema, attempt.tokens, requestId, attempt.stage, (raw) => {
        this.publishStreamingPreview(noteId, () => ({ status: "generating", requestId, startedAt: Date.now(), partial: {
          phase: "content",
          summary: extractStreamingString(raw, "summary"),
          keyPoints: extractStreamingStringArray(raw, "keyPoints"),
          tasks: [],
        } }));
      }, lifecycle, deadline);
      if (result.hitOutputLimit) continue;
      try {
        const parsed = this.parseJson<ContentOutput>(result.raw);
        if (typeof parsed.summary === "string" && Array.isArray(parsed.keyPoints)) return parsed;
      } catch (error) {
        console.warn("[CoreInsights] Content JSON retry required", {
          requestId,
          stage: attempt.stage,
          errorCode: error instanceof CoreNoteInsightGenerationError ? error.code : "unexpected",
        });
      }
    }
    const fallback = fallbackContentFromTranscript(input);
    console.warn("[CoreInsights] Content generation used deterministic fallback", {
      requestId,
      summaryLength: fallback.summary.length,
      keyPointCount: fallback.keyPoints.length,
    });
    return fallback;
  }

  private async generateTasks(
    context: LlamaContext,
    instruction: string,
    input: string,
    requestId: string,
    noteId: string,
    content: ContentOutput,
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
  ): Promise<TaskOutput> {
    const chunks = splitIntentTranscript(input);
    const completed: string[] = [];
    const publishTaskPreview = (raw = "", force = false) => {
      const createState = () => ({ status: "generating" as const, requestId, startedAt: Date.now(), partial: {
        phase: "intents" as const,
        summary: typeof content.summary === "string" ? content.summary.trim() : "",
        keyPoints: Array.isArray(content.keyPoints) ? this.uniqueStrings(content.keyPoints) : [],
        tasks: this.uniqueStrings([...completed, ...extractStreamingObjectStringFields(raw, "tasks", "title")]),
      } });
      if (force) this.publishPreview(noteId, createState());
      else this.publishStreamingPreview(noteId, createState);
    };
    publishTaskPreview("", true);
    console.info("[CoreInsights] Task evidence batches ready", {
      requestId,
      batchCount: chunks.length,
      inputLength: input.length,
    });
    const batches = await runAdaptiveStructuredBatches<TaskOutput>({
      inputs: chunks,
      complete: (chunk, mode) => this.runTaskStage(
        context,
        instruction,
        chunk,
        mode,
        requestId,
        publishTaskPreview,
        lifecycle,
        deadline,
      ),
      parse: (raw) => {
        const parsed = this.parseJson<TaskOutput>(raw);
        if (!Array.isArray(parsed.tasks)) {
          throw new CoreNoteInsightGenerationError("invalid-output", "Task output did not contain the required array.");
        }
        completed.push(...parsed.tasks.map((item) => typeof item?.title === "string" ? item.title : ""));
        publishTaskPreview("", true);
        return parsed;
      },
    });
    if (batches.failures.length) {
      console.warn("[CoreInsights] Task batches exhausted structured retries", {
        requestId,
        failedBatchCount: batches.failures.length,
        reasons: batches.failures.map((failure) => failure.reason),
        failedInputLengths: batches.failures.map((failure) => failure.input.length),
      });
    }
    const merged = sanitizeAdaptiveIntentBatches(batches);
    console.info("[CoreInsights] Task batches merged", {
      requestId,
      successfulBatchCount: batches.values.length,
      failedBatchCount: batches.failures.length,
      taskCount: merged.tasks.length,
    });
    return merged;
  }

  private runTaskStage(
    context: LlamaContext,
    instruction: string,
    input: string,
    mode: AdaptiveCompletionMode,
    requestId: string,
    onPartial: (raw: string) => void,
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
  ): Promise<StructuredStageResult> {
    const recovery = mode === "expanded"
      ? "\n\nRECOVERY MODE: Return one minimal complete JSON object. Keep only directly supported pending tasks. An empty tasks array is correct. Close every string, array, and object."
      : "";
    return this.runStage(
      context,
      `${instruction}${recovery}`,
      input,
      taskSchema,
      mode === "expanded" ? TASK_RETRY_TOKENS : TASK_TOKENS,
      requestId,
      `task-${mode}`,
      onPartial,
      lifecycle,
      deadline,
    );
  }

  private publish(noteId: string, state: CoreInsightGenerationState): void {
    const previousStatus = this.getGenerationState(noteId).status;
    this.generationStates.set(noteId, state);
    if (previousStatus !== state.status) console.info("[CoreInsights] Generation state changed", { noteId, requestId: "requestId" in state ? state.requestId : null, previousStatus, status: state.status, observerCount: this.listeners.get(noteId)?.size ?? 0 });
    this.listeners.get(noteId)?.forEach((listener) => listener(state));
  }

  private async generateStructured(
    context: LlamaContext,
    instruction: string,
    input: string,
    requestId: string,
    noteId: string,
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
  ): Promise<StructuredOutput | null> {
    const messages: RNLlamaOAICompatibleMessage[] = [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${instruction}\n\nNOTE:\n---\n${input}\n---` },
    ];
    const promptTokens = await this.countTokens(context, messages, lifecycle, deadline);
    const maxPrompt = CONTEXT_SIZE - STRUCTURED_TOKENS - SAFETY_TOKENS;
    if (promptTokens > maxPrompt) {
      console.info("[CoreInsights] Single-stage pipeline skipped for long input", { requestId, promptTokens, maxPrompt, inputLength: input.length });
      return null;
    }
    this.publish(noteId, { status: "generating", requestId, startedAt: Date.now(), partial: emptyCoreInsightPreview("structured") });
    const result = await this.runStage(context, instruction, input, structuredSchema, STRUCTURED_TOKENS, requestId, "structured", (raw) => {
      this.publishStreamingPreview(noteId, () => ({ status: "generating", requestId, startedAt: Date.now(), partial: previewStructuredOutput(raw) }));
    }, lifecycle, deadline);
    if (result.hitOutputLimit) return null;
    try {
      const parsed = this.parseJson<StructuredOutput>(result.raw);
      if (typeof parsed.summary !== "string" || !Array.isArray(parsed.keyPoints) || !Array.isArray(parsed.tasks)) return null;
      return parsed;
    } catch (error) {
      console.warn("[CoreInsights] Single-stage JSON fallback required", { requestId, errorCode: error instanceof CoreNoteInsightGenerationError ? error.code : "unexpected" });
      return null;
    }
  }

  private publishStreamingPreview(noteId: string, createState: () => Extract<CoreInsightGenerationState, { status: "generating" }>): void {
    const now = Date.now();
    if (now - (this.lastPartialPublishedAt.get(noteId) ?? 0) < 100) return;
    this.lastPartialPublishedAt.set(noteId, now);
    this.publishPreview(noteId, createState());
  }

  private publishPreview(noteId: string, state: Extract<CoreInsightGenerationState, { status: "generating" }>): void {
    const current = this.getGenerationState(noteId);
    if (current.status === "generating" && sameCoreInsightPreview(current.partial, state.partial)) return;
    this.publish(noteId, state);
  }

  private async runStage(
    context: LlamaContext,
    instruction: string,
    input: string,
    schema: object,
    outputTokens: number,
    requestId: string,
    stage: string,
    onPartial: ((raw: string) => void) | undefined,
    lifecycle: InferenceTaskContext,
    deadline: InferenceDeadline,
  ): Promise<StructuredStageResult> {
    const makeMessages = (note: string): RNLlamaOAICompatibleMessage[] => [
      { role: "system", content: SYSTEM },
      { role: "user", content: `${instruction}\n\nNOTE:\n---\n${note}\n---` },
    ];
    const maxPrompt = CONTEXT_SIZE - outputTokens - SAFETY_TOKENS;
    let used = input;
    let messages = makeMessages(used);
    let promptTokens = await this.countTokens(context, messages, lifecycle, deadline);
    if (promptTokens > maxPrompt) {
      let low = 0;
      let high = input.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (await this.countTokens(context, makeMessages(input.slice(0, mid)), lifecycle, deadline) <= maxPrompt) low = mid;
        else high = mid - 1;
      }
      used = input.slice(0, low).trimEnd();
      messages = makeMessages(used);
      promptTokens = await this.countTokens(context, messages, lifecycle, deadline);
      console.warn("[CoreInsights] Input truncated by token budget", { requestId, stage, originalCharacters: input.length, usedCharacters: used.length, promptTokens, outputTokens });
    } else {
      console.info("[CoreInsights] Prompt budget ready", { requestId, stage, promptTokens, outputTokens, inputTruncated: false });
    }
    const stageStartedAt = Date.now();
    let streamedRaw = "";
    await this.sharedContext.activateCache(`core-insights:${requestId}:${stage}:${this.cacheSequence++}`);
    this.throwIfStopped(lifecycle, deadline);
    const { result, raw } = await this.requests.complete(context, { messages, response_format: { type: "json_schema", json_schema: { strict: true, schema } }, n_predict: outputTokens, temperature: 0 }, lifecycle, (data) => {
      streamedRaw = data.accumulated_text ?? `${streamedRaw}${data.token ?? ""}`;
      onPartial?.(streamedRaw);
    });
    this.throwIfStopped(lifecycle, deadline);
    const hitOutputLimit = completionHitOutputLimit(result, outputTokens);
    console.info("[CoreInsights] Stage completed", {
      requestId,
      stage,
      durationMs: Date.now() - stageStartedAt,
      outputLength: raw.length,
      nPredict: outputTokens,
      predictedTokens: result.tokens_predicted,
      stoppedLimit: result.stopped_limit,
      stoppedEos: result.stopped_eos,
      contextFull: result.context_full,
      truncated: result.truncated,
      hitOutputLimit,
      temperature: 0,
    });
    return { raw, hitOutputLimit };
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

  private abortError(reason: InferenceAbortReason): CoreNoteInsightGenerationError {
    return reason === "timeout"
      ? new CoreNoteInsightGenerationError("timeout", "Structured Note reached its 3-minute limit. The Note is safe; please retry.")
      : new CoreNoteInsightGenerationError("cancelled", "Structured Note generation was stopped. The Note is safe; you can retry.");
  }

  private parseJson<T>(raw: string): T {
    try {
      const json = extractFirstJsonObject(raw);
      if (!json) throw new Error("No complete JSON object was returned.");
      return JSON.parse(json) as T;
    }
    catch (error) { throw new CoreNoteInsightGenerationError("invalid-output", "The local model returned an unreadable result. Try again or select a stronger model.", { cause: error instanceof Error ? error : undefined }); }
  }

  private parse(noteId: string, modelId: string, content: ContentOutput, parsed: TaskOutput, requestId: string, reference: Date, referenceIso: string, deviceTimezone: string): CoreNoteInsight {
    if (typeof content.summary !== "string" || !Array.isArray(content.keyPoints) || !Array.isArray(parsed.tasks)) {
      console.warn("[CoreInsights] Incomplete structured output", { requestId });
      throw new CoreNoteInsightGenerationError("invalid-output", "The local model returned an incomplete result. Please try again.");
    }
    const now = new Date().toISOString();
    const insightId = `core-insight-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tasks = parsed.tasks.flatMap((value, index) => this.toTask(value, noteId, insightId, index, reference, referenceIso, deviceTimezone));
    return new CoreNoteInsight(insightId, noteId, content.summary.trim(), this.uniqueStrings(content.keyPoints), tasks, [], modelId, now, now);
  }

  private toTask(value: unknown, noteId: string, insightId: string, index: number, reference: Date, referenceIso: string, deviceTimezone: string): CoreTask[] {
    if (!value || typeof value !== "object") return [];
    const item = value as OutputTask;
    if (typeof item.title !== "string" || !item.title.trim() || !Array.isArray(item.actionItems)) return [];
    const taskTitle = stripCoreNoteDateAnnotations(item.title).trim();
    if (!taskTitle) return [];
    const startsAt = resolveCoreNoteTime(item.startsAtExpression, reference);
    const dueAt = resolveCoreNoteTime(item.dueAtExpression, reference);
    const recurrenceKind = normalizeTaskRecurrence(
      item.recurrence,
      `${taskTitle} ${this.optional(item.description) ?? ""} ${typeof item.startsAtExpression === "string" ? item.startsAtExpression : ""} ${typeof item.dueAtExpression === "string" ? item.dueAtExpression : ""}`,
    );
    const recurrenceParameter = recurrenceValue(recurrenceKind, dueAt?.normalized ?? startsAt?.normalized ?? null);
    const taskId = `${insightId}-task-${index}`;
    const seen = new Set<string>();
    const actionItems = item.actionItems.flatMap((action, position) => {
      const result = this.toAction(action, noteId, taskId, position, reference, referenceIso, deviceTimezone);
      const key = result[0] ? this.normalized(result[0].title) : "";
      if (!key || key === this.normalized(taskTitle) || seen.has(key)) return [];
      seen.add(key);
      return result;
    }).map((action, position) => ({ ...action, position }));
    return [{
      id: taskId, title: taskTitle, description: this.cleanOptional(item.description), status: "pending",
      startsAt: startsAt?.normalized ?? null, dueAt: dueAt?.normalized ?? null, completedAt: null,
      sourceNoteId: noteId, externalSystem: null, externalId: null,
      metadata: this.timeMetadata({ startsAt, dueAt }, referenceIso, deviceTimezone, { generatedBy: "local-llm" }),
      actionItems, isPinned: false, pinnedAt: null, recurrenceKind,
      recurrenceValue: recurrenceParameter,
      seriesKey: recurrenceKind ? recurringSeriesKey(noteId, taskTitle, recurrenceKind, recurrenceParameter) : null,
      occurrenceIndex: 0, isCurrent: true, endedAt: null,
    }];
  }

  private toAction(value: unknown, noteId: string, taskId: string, position: number, reference: Date, referenceIso: string, deviceTimezone: string): CoreActionItem[] {
    if (!value || typeof value !== "object") return [];
    const item = value as OutputItem;
    if (typeof item.title !== "string" || !item.title.trim()) return [];
    const title = stripCoreNoteDateAnnotations(item.title).trim();
    if (!title) return [];
    const startsAt = resolveCoreNoteTime(item.startsAtExpression, reference);
    const dueAt = resolveCoreNoteTime(item.dueAtExpression, reference);
    return [{ id: `${taskId}-action-${position}`, taskId, position, title, description: this.cleanOptional(item.description), status: "pending", startsAt: startsAt?.normalized ?? null, dueAt: dueAt?.normalized ?? null, completedAt: null, sourceNoteId: noteId, externalSystem: null, externalId: null, metadata: this.timeMetadata({ startsAt, dueAt }, referenceIso, deviceTimezone, { generatedBy: "local-llm-explicit-step" }) }];
  }

  private timeMetadata(values: Record<string, ResolvedCoreNoteTime | null>, referenceTime: string, deviceTimezone: string, base: Record<string, unknown> = {}): Record<string, unknown> {
    const expressions = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null).map(([key, value]) => [key, value]));
    return { ...base, timeReference: referenceTime, deviceTimezone, timeExpressions: expressions };
  }

  private optional(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed && !EMPTY_VALUE_STRINGS.has(trimmed.toLocaleLowerCase()) ? trimmed : null;
  }
  private cleanOptional(value: unknown): string | null {
    const optional = this.optional(value);
    return optional ? stripCoreNoteDateAnnotations(optional) : null;
  }
  private normalized(value: string): string { return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""); }
  private uniqueStrings(value: unknown[]): string[] {
    const seen = new Set<string>();
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).filter((item) => { const key = this.normalized(item); if (!key || seen.has(key)) return false; seen.add(key); return true; });
  }
}

export type CoreInsightGenerationState =
  | { status: "idle" }
  | { status: "queued"; requestId: string; startedAt: number }
  | { status: "generating"; requestId: string; startedAt: number; partial: CoreInsightPreview }
  | { status: "stopping"; requestId: string; startedAt: number }
  | { status: "completed"; requestId: string; finishedAt: number }
  | { status: "failed"; requestId: string; finishedAt: number; message: string };

export type CoreInsightPreview = {
  phase: "structured" | "content" | "intents";
  summary: string;
  keyPoints: string[];
  tasks: string[];
};

function emptyCoreInsightPreview(phase: CoreInsightPreview["phase"]): CoreInsightPreview {
  return { phase, summary: "", keyPoints: [], tasks: [] };
}

function previewStructuredOutput(raw: string): CoreInsightPreview {
  return {
    phase: "structured",
    summary: stripTaskRecurrenceAnnotations(extractStreamingString(raw, "summary")),
    keyPoints: extractStreamingStringArray(raw, "keyPoints").map(stripTaskRecurrenceAnnotations),
    tasks: extractStreamingObjectStringFields(raw, "tasks", "title"),
  };
}

function cleanStructuredContent(value: StructuredOutput): ContentOutput {
  return {
    summary: typeof value.summary === "string" ? stripTaskRecurrenceAnnotations(value.summary) : value.summary,
    keyPoints: Array.isArray(value.keyPoints)
      ? value.keyPoints.map((item) => typeof item === "string" ? stripTaskRecurrenceAnnotations(item) : item)
      : value.keyPoints,
  };
}

function sameCoreInsightPreview(left: CoreInsightPreview, right: CoreInsightPreview): boolean {
  const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);
  return left.phase === right.phase && left.summary === right.summary
    && sameList(left.keyPoints, right.keyPoints) && sameList(left.tasks, right.tasks);
}
