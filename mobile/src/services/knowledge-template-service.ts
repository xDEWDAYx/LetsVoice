import { KnowledgeTemplate, type KnowledgeTemplateSection } from "@/domain/knowledge/knowledge-template";
import { ValidationError } from "@/errors/validation-error";
import { KnowledgeTemplateRepository } from "@/repositories/knowledge-template-repository";
import { extractFirstJsonObject } from "@/services/core-note-insight-generation-policy";
import { LlmModelService } from "@/services/llm-model-service";
import { InferenceCancelledError, type InferenceTask, LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { LlmRequestService } from "@/services/llm-request-service";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";

type Proposal = { sections?: { title?: unknown; instruction?: unknown }[] };

export class KnowledgeTemplateService {
  private activeTask: InferenceTask<KnowledgeTemplateSection[]> | null = null;
  public constructor(
    private readonly repository: KnowledgeTemplateRepository,
    private readonly llmModelService: LlmModelService,
    private readonly coordinator: LocalLlmCoordinator,
    private readonly requests: LlmRequestService,
    private readonly sharedContext: SharedLlmContextService,
  ) {}

  public getTemplates(): Promise<KnowledgeTemplate[]> { return this.repository.findAll(); }
  public getTemplate(id: string): Promise<KnowledgeTemplate | null> { return this.repository.findById(id); }
  public cancelProposal(): Promise<void> { return this.activeTask?.cancel() ?? Promise.resolve(); }
  public async ensureReady(): Promise<void> { await this.coordinator.runExclusive("knowledge-template", async () => { await this.requests.ensureReady(); }); }

  public async proposeSections(name: string, requirement: string): Promise<KnowledgeTemplateSection[]> {
    const normalizedName = this.requireText(name, "Template name");
    const normalizedRequirement = this.requireText(requirement, "Template requirement");
    const model = await this.llmModelService.getActiveModel();
    if (!model) throw new ValidationError("Choose and activate a local language model first, or build the sections manually.");
    const file = this.llmModelService.resolveModelFile(model);
    if (!file.exists) throw new ValidationError("The active model file is missing. Reinstall it or build the sections manually.");

    const task = this.coordinator.schedule("knowledge-template", async (lifecycle) => {
      try {
        const context = await this.requests.ensureReady();
        await this.sharedContext.activateCache(`knowledge-template:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);
        lifecycle.throwIfCancelled();
        const { raw } = await this.requests.complete(context, {
          messages: [{
            role: "user",
            content: `Design 2 to 8 extraction sections for a local note Knowledge template.
Template name: ${normalizedName}
User requirement: ${normalizedRequirement}

Each section needs a short title and a precise instruction describing what grounded information to extract from a transcript. Do not include a generic summary, key points, tasks, reminders, or calendar sections. Return JSON only.`,
          }],
          response_format: { type: "json_schema", json_schema: { strict: true, schema: {
            type: "object",
            properties: { sections: { type: "array", minItems: 2, maxItems: 8, items: { type: "object", properties: { title: { type: "string" }, instruction: { type: "string" } }, required: ["title", "instruction"], additionalProperties: false } } },
            required: ["sections"],
            additionalProperties: false,
          } } },
          n_predict: 900,
          temperature: 0,
        }, lifecycle);
        const json = extractFirstJsonObject(raw);
        if (!json) throw new Error("The local model did not return complete JSON.");
        const proposal = JSON.parse(json) as Proposal;
        const sections = (proposal.sections ?? []).flatMap((section, index) => {
          const title = typeof section.title === "string" ? section.title.trim() : "";
          const instruction = typeof section.instruction === "string" ? section.instruction.trim() : "";
          return title && instruction ? [{ key: this.sectionKey(title, index), title, instruction }] : [];
        });
        return this.validateSections(sections);
      } catch (error) {
        if (error instanceof InferenceCancelledError) throw error;
        if (error instanceof ValidationError) throw error;
        console.warn("[KnowledgeTemplate] Section proposal failed", { error });
        throw new ValidationError("The local model could not propose a valid template. Retry or build it manually.");
      } finally { /* Shared runtime remains READY. */ }
    });
    this.activeTask = task;
    return task.promise.finally(() => { if (this.activeTask === task) this.activeTask = null; });
  }

  public async save(input: {
    id?: string;
    name: string;
    requirement: string;
    sections: readonly KnowledgeTemplateSection[];
  }): Promise<KnowledgeTemplate> {
    const now = new Date().toISOString();
    const existing = input.id ? await this.repository.findById(input.id) : null;
    const template = new KnowledgeTemplate(
      input.id ?? `knowledge-template-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      this.requireText(input.name, "Template name"),
      this.requireText(input.requirement, "Template requirement"),
      this.validateSections(input.sections),
      existing?.getCreatedAt() ?? now,
      now,
    );
    await this.repository.save(template);
    return template;
  }

  public manualSections(): KnowledgeTemplateSection[] {
    return [
      { key: "section_1", title: "", instruction: "" },
      { key: "section_2", title: "", instruction: "" },
    ];
  }

  private validateSections(sections: readonly KnowledgeTemplateSection[]): KnowledgeTemplateSection[] {
    if (sections.length < 2 || sections.length > 8) throw new ValidationError("A template needs 2 to 8 sections.");
    const used = new Set<string>();
    return sections.map((section, index) => {
      const title = this.requireText(section.title, `Section ${index + 1} title`);
      const instruction = this.requireText(section.instruction, `Section ${index + 1} guidance`);
      let key = this.sectionKey(title, index);
      while (used.has(key)) key = `${key}_${index + 1}`;
      used.add(key);
      return { key, title, instruction };
    });
  }

  private requireText(value: string, label: string): string {
    const normalized = value.trim();
    if (!normalized) throw new ValidationError(`${label} cannot be empty.`);
    return normalized;
  }

  private sectionKey(title: string, index: number): string {
    const normalized = title.normalize("NFKD").toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return normalized || `section_${index + 1}`;
  }
}
