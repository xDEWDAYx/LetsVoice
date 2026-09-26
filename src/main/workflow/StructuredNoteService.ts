import { KnowledgeOutput } from '@shared/entities/KnowledgeOutput';
import { KnowledgeOutputRepository } from '../database/repositories/KnowledgeOutputRepository';
import { KnowledgeTemplateRepository } from '../database/repositories/KnowledgeTemplateRepository';
import { NoteRepository } from '../database/repositories/NoteRepository';
import LocalChatService, { LocalChatResult } from '../llm/LocalChatService';
import {
  buildStructuredNoteMessages,
  normalizeWorkflowId,
  serializeKnowledgeOutput,
} from './StructuredNoteSupport';
import {
  KnowledgeOutputDTO,
  StructuredNoteResult,
} from './StructuredNoteTypes';

type ChatService = {
  chat(messages: unknown, options?: unknown): Promise<LocalChatResult>;
};

type Dependencies = {
  notes?: NoteRepository;
  templates?: KnowledgeTemplateRepository;
  outputs?: KnowledgeOutputRepository;
  chat?: ChatService;
};

/** 使用知识模板整理一篇已保存笔记，并把模型结果持久化到当前数据库。 */
export default class StructuredNoteService {
  private readonly notes: NoteRepository;

  private readonly templates: KnowledgeTemplateRepository;

  private readonly outputs: KnowledgeOutputRepository;

  private readonly chat: ChatService;

  public constructor(dependencies: Dependencies = {}) {
    this.notes = dependencies.notes ?? new NoteRepository();
    this.templates =
      dependencies.templates ?? new KnowledgeTemplateRepository();
    this.outputs = dependencies.outputs ?? new KnowledgeOutputRepository();
    this.chat = dependencies.chat ?? new LocalChatService();
  }

  public listOutputs(rawNoteId: unknown): KnowledgeOutputDTO[] {
    const noteId = normalizeWorkflowId(rawNoteId, '笔记');
    if (!this.notes.existsById(noteId)) {
      throw new Error('笔记不存在 / Note not found');
    }
    return this.outputs.findAllByNote(noteId).map(serializeKnowledgeOutput);
  }

  public async generate(
    rawNoteId: unknown,
    rawTemplateId: unknown,
  ): Promise<StructuredNoteResult> {
    const noteId = normalizeWorkflowId(rawNoteId, '笔记');
    const templateId = normalizeWorkflowId(rawTemplateId, '模板');
    const note = this.notes.findById(noteId);
    const template = this.templates.findById(templateId);
    if (!note) throw new Error('笔记不存在 / Note not found');
    if (!template) throw new Error('知识模板不存在 / Template not found');

    const startedAt = Date.now();
    const result = await this.chat.chat(
      buildStructuredNoteMessages(note, template),
      { temperature: 0.2 },
    );

    const now = new Date();
    const outputId = this.outputs.create(
      new KnowledgeOutput(
        0,
        noteId,
        templateId,
        'text/markdown',
        result.content,
        now,
        now,
      ),
    );
    const output = this.outputs.findById(outputId);
    if (!output) throw new Error('结构化笔记保存失败 / Output was not saved');

    return {
      output: serializeKnowledgeOutput(output),
      modelName: result.modelName,
      runtimeName: result.runtimeName,
      llmDurationMs: Date.now() - startedAt,
    };
  }
}
