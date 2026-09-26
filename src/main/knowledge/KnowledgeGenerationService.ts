/* eslint-disable lines-between-class-members, no-return-assign, no-void, class-methods-use-this, no-empty, one-var */
import crypto from 'crypto';
import type {
  CalendarIntent,
  StructuredNote,
  StructuredNoteDraft,
  GenerationState,
  InsightItem,
  InsightTask,
  KnowledgeScenario,
  NoteKnowledgeBundle,
  ScenarioTemplateDefinition,
  ScenarioTemplateSelection,
  ScenarioKnowledge,
} from '@shared/types/KnowledgeGenerationTypes';
import { KNOWLEDGE_SCENARIOS } from '@shared/types/KnowledgeGenerationTypes';
import { KnowledgeTemplateRepository } from '../database/repositories/KnowledgeTemplateRepository';
import LocalChatService from '../llm/LocalChatService';
import ollamaServerController from '../llm/OllamaRuntime';
import { DatabaseManager } from '../database/DatabaseManager';
import KnowledgeRepository from './KnowledgeRepository';
import LocalLlmCoordinator from './LocalLlmCoordinator';
import {
  getScenarioDefinition,
  type KnowledgeOutputLanguage,
} from './KnowledgeScenarios';
import {
  ensureStructuredSummary,
  isStructuredNoteActions,
  isStructuredNoteContent,
  parseStrictJson,
  type StructuredNoteRawItem,
  type StructuredNoteRawTime,
} from './CoreOutputParser';

const coordinator = new LocalLlmCoordinator();
const MAX_TRANSCRIPT_CHARS = 24000;
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const nullableStringSchema = { type: ['string', 'null'] };
const actionItemSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: nullableStringSchema,
    startsAtExpression: nullableStringSchema,
    dueAtExpression: nullableStringSchema,
  },
  required: ['title', 'description', 'startsAtExpression', 'dueAtExpression'],
  additionalProperties: false,
};
const taskSchema = {
  ...actionItemSchema,
  properties: {
    ...actionItemSchema.properties,
    actionItems: { type: 'array', items: actionItemSchema },
  },
  required: [...actionItemSchema.required, 'actionItems'],
};
const calendarSchema = {
  ...actionItemSchema,
  properties: {
    ...actionItemSchema.properties,
    endsAtExpression: nullableStringSchema,
    remindAtExpression: nullableStringSchema,
    allDay: { type: 'boolean' },
    timezone: nullableStringSchema,
  },
  required: [
    ...actionItemSchema.required,
    'endsAtExpression',
    'remindAtExpression',
    'allDay',
    'timezone',
  ],
};
const structuredNoteContentSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', minLength: 1 },
    keyPoints: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'keyPoints'],
  additionalProperties: false,
};
const structuredNoteActionsSchema = {
  type: 'object',
  properties: {
    tasks: { type: 'array', items: taskSchema },
    unassignedActionItems: { type: 'array', items: actionItemSchema },
    reminders: { type: 'array', items: calendarSchema },
    calendarIntents: { type: 'array', items: calendarSchema },
  },
  required: ['tasks', 'unassignedActionItems', 'reminders', 'calendarIntents'],
  additionalProperties: false,
};

export default class KnowledgeGenerationService {
  private readonly repository = new KnowledgeRepository();
  private readonly chat = new LocalChatService();
  private readonly templates = new KnowledgeTemplateRepository();
  private readonly structuredNoteStates = new Map<number, GenerationState>();
  private readonly scenarioStates = new Map<number, GenerationState>();
  private readonly active = new Map<string, Promise<unknown>>();

  get(noteId: number): NoteKnowledgeBundle {
    return {
      structuredNote: this.repository.getStructuredNote(noteId),
      scenario: this.repository.getScenario(noteId),
      structuredNoteState: this.structuredNoteStates.get(noteId) ?? {
        status: 'idle',
      },
      scenarioState: this.scenarioStates.get(noteId) ?? { status: 'idle' },
    };
  }
  generateStructuredNote(noteId: number): Promise<StructuredNote> {
    return this.generate(
      'structured-note',
      noteId,
      undefined,
    ) as Promise<StructuredNote>;
  }
  generateStructuredNoteDraft(
    transcript: string,
  ): Promise<StructuredNoteDraft> {
    const note = this.normalizeTranscript(transcript);
    return coordinator.run(() =>
      this.runStructuredNoteDraft(note, crypto.randomUUID()),
    );
  }
  saveStructuredNoteDraft(
    noteId: number,
    draft: StructuredNoteDraft,
  ): StructuredNote {
    const previous = this.repository.getStructuredNote(noteId);
    const now = new Date().toISOString();
    const bindItem = (item: InsightItem): InsightItem => ({
      ...item,
      sourceNoteId: noteId,
    });
    const value: StructuredNote = {
      ...draft,
      noteId,
      tasks: draft.tasks.map((task) => ({
        ...bindItem(task),
        actionItems: task.actionItems.map(bindItem),
      })),
      unassignedActionItems: draft.unassignedActionItems.map(bindItem),
      calendarIntents: draft.calendarIntents.map((intent) => ({
        ...intent,
        sourceNoteId: noteId,
      })),
      createdAt: previous?.createdAt ?? draft.createdAt,
      updatedAt: now,
    };
    this.repository.saveStructuredNote(value);
    return value;
  }
  generateScenario(
    noteId: number,
    rawSelection: ScenarioTemplateSelection | KnowledgeScenario,
    rawLanguage: unknown = 'en',
  ): Promise<ScenarioKnowledge> {
    const selection = this.normalizeScenarioSelection(rawSelection);
    return this.generate(
      'scenario',
      noteId,
      selection,
      rawLanguage === 'zh' ? 'zh' : 'en',
    ) as Promise<ScenarioKnowledge>;
  }
  toggleTask(
    noteId: number,
    taskId: string,
    completed: boolean,
  ): StructuredNote {
    const insight = this.repository.getStructuredNote(noteId);
    if (!insight) throw new Error('Structured note was not found.');
    const now = new Date().toISOString();
    let found = false;
    insight.tasks = insight.tasks.map((task) =>
      task.id === taskId
        ? ((found = true),
          {
            ...task,
            status: completed ? 'completed' : 'pending',
            completedAt: completed ? now : null,
          })
        : task,
    );
    if (!found) throw new Error('Task was not found.');
    insight.updatedAt = now;
    this.repository.saveStructuredNote(insight);
    return insight;
  }
  private generate(
    kind: 'structured-note' | 'scenario',
    noteId: number,
    template?: ScenarioTemplateSelection,
    language: KnowledgeOutputLanguage = 'en',
  ): Promise<StructuredNote | ScenarioKnowledge> {
    const key = `${kind}:${noteId}`;
    const existing = this.active.get(key);
    if (existing)
      return existing as Promise<StructuredNote | ScenarioKnowledge>;
    const requestId = crypto.randomUUID();
    const states =
      kind === 'structured-note'
        ? this.structuredNoteStates
        : this.scenarioStates;
    const scenario =
      template?.source === 'builtin' ? template.scenario : undefined;
    states.set(noteId, {
      status: 'queued',
      requestId,
      scenario,
      template,
      startedAt: Date.now(),
    });
    const promise = coordinator.run(async () => {
      states.set(noteId, {
        status: 'generating',
        requestId,
        scenario,
        template,
        startedAt: Date.now(),
      });
      const value =
        kind === 'structured-note'
          ? await this.runStructuredNote(noteId, requestId)
          : await this.runScenario(noteId, template!, requestId, language);
      states.set(noteId, {
        status: 'completed',
        requestId,
        scenario,
        template,
        finishedAt: Date.now(),
      });
      return value;
    });
    this.active.set(key, promise);
    void promise
      .catch((e: unknown) =>
        states.set(noteId, {
          status: 'failed',
          requestId,
          scenario,
          template,
          finishedAt: Date.now(),
          message: e instanceof Error ? e.message : 'Generation failed.',
        }),
      )
      .finally(() => this.active.delete(key));
    return promise;
  }
  private transcript(noteId: number): string {
    const row = DatabaseManager.getInstance()
      .getDatabase()
      .prepare('SELECT transcript FROM notes WHERE id=? AND trashed_at IS NULL')
      .get(noteId) as { transcript: string } | undefined;
    if (!row) throw new Error('Note not found.');
    return this.normalizeTranscript(row.transcript, noteId);
  }
  private normalizeTranscript(raw: string, noteId?: number): string {
    const text = String(raw ?? '').trim();
    if (!text) throw new Error('This note has no transcript to generate from.');
    if (text.length > MAX_TRANSCRIPT_CHARS) {
      console.warn('[Knowledge] transcript truncated', {
        noteId,
        originalLength: text.length,
        usedLength: MAX_TRANSCRIPT_CHARS,
      });
    }
    return text.slice(0, MAX_TRANSCRIPT_CHARS);
  }
  private async complete(
    system: string,
    user: string,
    requestId: string,
    format: Record<string, unknown>,
  ) {
    await ollamaServerController.ensureRunning();
    const started = Date.now();
    try {
      const result = await this.chat.chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { temperature: 0, format },
      );
      console.info('[Knowledge] completion', {
        requestId,
        model: result.modelName,
        durationMs: Date.now() - started,
        outputLength: result.content.length,
      });
      return result;
    } catch (e) {
      console.error('[Knowledge] failure', {
        requestId,
        durationMs: Date.now() - started,
        errorType: e instanceof Error ? e.name : 'unknown',
      });
      throw e;
    }
  }
  private async runStructuredNote(
    noteId: number,
    requestId: string,
  ): Promise<StructuredNote> {
    const note = this.transcript(noteId);
    const draft = await this.runStructuredNoteDraft(note, requestId);
    return this.saveStructuredNoteDraft(noteId, draft);
  }
  private async runStructuredNoteDraft(
    note: string,
    requestId: string,
  ): Promise<StructuredNoteDraft> {
    const system =
      'Use only NOTE evidence. Never add external knowledge or invent facts, people, decisions, dates, tasks, reminders, or events. Preserve uncertainty, attribution, and primary language. Empty unsupported categories must be []. Return only exact JSON; use null, never unknown/N/A.';
    const contentR = await this.complete(
      system,
      `Extract summary and key points only. Summary must be a non-empty concise description whenever NOTE is non-empty. Greetings, repetitions, filler, and incomplete fragments still count as content; summarize them literally without inventing meaning. Exact JSON: {"summary":"non-empty summary","keyPoints":[]}. NOTE:\n---\n${note}\n---`,
      requestId,
      structuredNoteContentSchema,
    );
    const actionsR = await this.complete(
      system,
      `Extract only explicit assigned/requested/promised actions; facts, advice, examples, tutorials and completed work are not tasks. Action items must be explicit steps and must not duplicate their parent. Reminders require explicit remember/remind intent. Calendar intents require explicit meeting/event/appointment/scheduling intent; a time alone is insufficient. Keep natural-language time expressions, do not infer ISO. Exact JSON keys: tasks,unassignedActionItems,reminders,calendarIntents. Every task/action has title,description,startsAtExpression,dueAtExpression; tasks also actionItems. Every reminder/calendar item additionally has endsAtExpression,remindAtExpression,allDay,timezone. Arrays must exist. NOTE:\n---\n${note}\n---`,
      requestId,
      structuredNoteActionsSchema,
    );
    const content = parseStrictJson(contentR.content, isStructuredNoteContent);
    const actions = parseStrictJson(actionsR.content, isStructuredNoteActions);
    const now = new Date();
    const modelId = actionsR.modelName;
    const tasks = actions.tasks.map((x, i) =>
      this.task(x, 0, `task-${i}`, now),
    );
    const unassigned = actions.unassignedActionItems.map((x, i) =>
      this.item(x, 0, `action-${i}`, now),
    );
    const calendarIntents: CalendarIntent[] = [
      ...actions.reminders.map((x, i) =>
        this.calendar(x, 'reminder', 0, `reminder-${i}`, now),
      ),
      ...actions.calendarIntents.map((x, i) =>
        this.calendar(x, 'calendar', 0, `calendar-${i}`, now),
      ),
    ];
    return {
      summary: ensureStructuredSummary(content.summary, note),
      keyPoints: content.keyPoints.map((x) => x.trim()).filter(Boolean),
      tasks,
      unassignedActionItems: unassigned,
      calendarIntents,
      modelId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }
  private async runScenario(
    noteId: number,
    selection: ScenarioTemplateSelection,
    requestId: string,
    language: KnowledgeOutputLanguage,
  ): Promise<ScenarioKnowledge> {
    const note = this.transcript(noteId);
    const resolved = this.resolveScenarioTemplate(selection, language);
    const d = resolved.definition;
    const shape = Object.fromEntries(d.sections.map((s) => [s.key, []]));
    const guide = d.sections
      .map((s) => `- ${s.key} (${s.title}): ${s.instruction}`)
      .join('\n');
    const result = await this.complete(
      'Extract scenario-specific knowledge only. Do not recreate summary, general key points, tasks, action items, reminders, or calendar intents. Use only NOTE evidence; preserve uncertainty, attribution, and language. Each item must contain concrete information, not a label. Unsupported fields are []. Return only exact JSON.',
      `Create ${resolved.name} knowledge. Exact JSON: {"sections":${JSON.stringify(shape)}}\n${guide}\nNOTE:\n---\n${note}\n---`,
      requestId,
      {
        type: 'object',
        properties: {
          sections: {
            type: 'object',
            properties: Object.fromEntries(
              d.sections.map((section) => [
                section.key,
                { type: 'array', items: { type: 'string' } },
              ]),
            ),
            required: d.sections.map((section) => section.key),
            additionalProperties: false,
          },
        },
        required: ['sections'],
        additionalProperties: false,
      },
    );
    const valid = (v: unknown): v is { sections: Record<string, string[]> } => {
      if (!object(v) || !object(v.sections)) return false;
      const sections = v.sections as Record<string, unknown>;
      return (
        d.sections.every((s) => strings(sections[s.key])) &&
        Object.keys(sections).every((k) => d.sections.some((s) => s.key === k))
      );
    };
    const parsed = parseStrictJson<{ sections: Record<string, string[]> }>(
      result.content,
      valid,
    );
    const now = new Date().toISOString();
    const previous = this.repository.getScenario(noteId);
    const value = {
      noteId,
      scenario: resolved.scenario,
      templateId: resolved.templateId,
      templateName: resolved.name,
      templateSource: resolved.source,
      sections: d.sections.map((s) => ({
        key: s.key,
        title: s.title,
        items: parsed.sections[s.key].map((x) => x.trim()).filter(Boolean),
      })),
      modelId: result.modelName,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.repository.saveScenario(value);
    return value;
  }

  private normalizeScenarioSelection(
    value: ScenarioTemplateSelection | KnowledgeScenario,
  ): ScenarioTemplateSelection {
    if (typeof value === 'string') {
      if (!KNOWLEDGE_SCENARIOS.includes(value)) {
        throw new Error('Unsupported knowledge scenario.');
      }
      return { source: 'builtin', scenario: value };
    }
    if (
      value?.source === 'builtin' &&
      KNOWLEDGE_SCENARIOS.includes(value.scenario)
    ) {
      return value;
    }
    if (
      value?.source === 'custom' &&
      Number.isInteger(value.templateId) &&
      value.templateId > 0
    ) {
      return value;
    }
    throw new Error('Invalid scenario template selection.');
  }

  private resolveScenarioTemplate(
    selection: ScenarioTemplateSelection,
    language: KnowledgeOutputLanguage,
  ): {
    source: 'builtin' | 'custom';
    scenario: KnowledgeScenario | null;
    templateId: number | null;
    name: string;
    definition: ScenarioTemplateDefinition;
  } {
    if (selection.source === 'builtin') {
      const builtIn = getScenarioDefinition(selection.scenario, language);
      return {
        source: 'builtin',
        scenario: selection.scenario,
        templateId: null,
        name: builtIn.name,
        definition: {
          description: builtIn.description,
          sections: builtIn.sections,
        },
      };
    }
    const template = this.templates.findById(selection.templateId);
    if (!template) {
      throw new Error('Custom scenario template was not found.');
    }
    return {
      source: 'custom',
      scenario: null,
      templateId: template.getId(),
      name: template.getName(),
      definition: template.getEffectiveDefinition(),
    };
  }
  private resolve(
    raw: string | null,
    ref: Date,
  ): { normalized: string | null; metadata: Record<string, unknown> } {
    if (!raw?.trim()) return { normalized: null, metadata: {} };
    const text = raw.trim();
    const d = new Date(ref);
    const lower = text.toLowerCase();
    if (/\btomorrow\b|明天/.test(lower)) d.setDate(d.getDate() + 1);
    else if (/\btoday\b|今天/.test(lower)) {
    } else if (/next week|下周/.test(lower)) d.setDate(d.getDate() + 7);
    else
      return {
        normalized: null,
        metadata: {
          raw: text,
          normalized: null,
          precision: 'unknown',
          approximate: true,
        },
      };
    return {
      normalized: d.toISOString(),
      metadata: {
        raw: text,
        normalized: d.toISOString(),
        precision: 'date',
        approximate: false,
      },
    };
  }
  private item(
    x: StructuredNoteRawItem,
    noteId: number,
    id: string,
    ref: Date,
  ): InsightItem {
    const starts = this.resolve(x.startsAtExpression, ref),
      due = this.resolve(x.dueAtExpression, ref);
    return {
      id,
      title: x.title.trim(),
      description: x.description?.trim() || null,
      status: 'pending',
      startsAt: starts.normalized,
      dueAt: due.normalized,
      completedAt: null,
      sourceNoteId: noteId,
      externalSystem: null,
      externalId: null,
      metadata: {
        timeReference: ref.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timeExpressions: { startsAt: starts.metadata, dueAt: due.metadata },
      },
    };
  }
  private task(
    x: StructuredNoteRawItem,
    noteId: number,
    id: string,
    ref: Date,
  ): InsightTask {
    return {
      ...this.item(x, noteId, id, ref),
      actionItems: (x.actionItems ?? [])
        .filter(
          (a) => a.title.trim().toLowerCase() !== x.title.trim().toLowerCase(),
        )
        .map((a, i) => this.item(a, noteId, `${id}-action-${i}`, ref)),
    };
  }
  private calendar(
    x: StructuredNoteRawTime,
    kind: 'reminder' | 'calendar',
    noteId: number,
    id: string,
    ref: Date,
  ): CalendarIntent {
    const base = this.item(x, noteId, id, ref),
      ends = this.resolve(x.endsAtExpression, ref),
      remind = this.resolve(x.remindAtExpression, ref);
    return {
      ...base,
      kind,
      endsAt: ends.normalized,
      remindAt: remind.normalized,
      allDay: x.allDay,
      timezone:
        x.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone,
      metadata: {
        ...base.metadata,
        endsAt: ends.metadata,
        remindAt: remind.metadata,
      },
    };
  }
}

/** 主进程内共享同一份生成状态，自动生成与工作空间面板不会重复启动任务。 */
export const knowledgeGenerationService = new KnowledgeGenerationService();
