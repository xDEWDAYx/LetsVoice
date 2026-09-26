import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AIConversation } from '@shared/entities/AIConversation';
import { Subnote } from '@shared/entities/Subnote';
import { AIConversationRepository } from '../database/repositories/AIConversationRepository';
import { AIMessageRepository } from '../database/repositories/AIMessageRepository';
import { ConversationContextRepository } from '../database/repositories/ConversationContextRepository';
import { NoteRepository } from '../database/repositories/NoteRepository';
import { SubnoteRepository } from '../database/repositories/SubnoteRepository';
import LocalChatService from '../llm/LocalChatService';
import { TodoExtractionService } from '../dashboard/TodoExtractionService';
import AskAINoteService from './AskAINoteService';
import {
  buildAskAIMessages,
  createEmptyContextAnswer,
} from './AskAIPromptBuilder';
import {
  createConversationName,
  serializeConversation,
  serializeMessage,
  serializeNote,
} from './AskAISerializer';
import {
  AskAIConversationDTO,
  AskAINoteDetailDTO,
  AskAINoteDTO,
  AskAIRequest,
  AskAIResultDTO,
  CreateAskAINoteRequest,
  RecordAskAITurnRequest,
} from './AskAITypes';

const MAX_QUESTION_CHARACTERS = 5000;

type AskAIServiceDependencies = {
  conversationRepository?: AIConversationRepository;
  messageRepository?: AIMessageRepository;
  contextRepository?: ConversationContextRepository;
  noteService?: AskAINoteService;
  chatService?: LocalChatService;
  noteRepository?: NoteRepository;
  subnoteRepository?: SubnoteRepository;
  todoExtractionService?: TodoExtractionService;
};

/** 协调笔记证据、会话持久化和本地 Ollama 回复。 */
export default class AskAIService {
  private readonly conversationRepository: AIConversationRepository;

  private readonly messageRepository: AIMessageRepository;

  private readonly contextRepository: ConversationContextRepository;

  private readonly noteService: AskAINoteService;

  private readonly chatService: LocalChatService;

  private readonly noteRepository: NoteRepository;

  private readonly subnoteRepository: SubnoteRepository;

  private readonly todoExtractionService: TodoExtractionService;

  public constructor(dependencies: AskAIServiceDependencies = {}) {
    this.conversationRepository =
      dependencies.conversationRepository ?? new AIConversationRepository();
    this.messageRepository =
      dependencies.messageRepository ?? new AIMessageRepository();
    this.contextRepository =
      dependencies.contextRepository ?? new ConversationContextRepository();
    this.noteService = dependencies.noteService ?? new AskAINoteService();
    this.chatService = dependencies.chatService ?? new LocalChatService();
    this.noteRepository = dependencies.noteRepository ?? new NoteRepository();
    this.subnoteRepository =
      dependencies.subnoteRepository ?? new SubnoteRepository();
    this.todoExtractionService =
      dependencies.todoExtractionService ?? new TodoExtractionService();
  }

  public listNotes(workspaceId: number | null = null): AskAINoteDTO[] {
    return this.noteService.list(workspaceId).map(serializeNote);
  }

  public createNote(request: CreateAskAINoteRequest): AskAINoteDTO {
    return serializeNote(this.noteService.create(request));
  }

  /** 笔记详情：原文转录之外，一并返回摘要等整理结果，供预览面板完整展示。 */
  public getNoteDetail(noteId: number): AskAINoteDetailDTO | null {
    const note = this.noteRepository.findById(noteId);
    if (!note) return null;

    return {
      ...serializeNote(note),
      subnotes: this.subnoteRepository.findAllByNote(noteId).map((subnote) => ({
        id: subnote.getId(),
        contentType: subnote.getContentType(),
        content: subnote.getContent(),
        createdAt: subnote.getCreatedAt().toISOString(),
      })),
    };
  }

  public listConversations(): AskAIConversationDTO[] {
    return this.conversationRepository.findAll().map(serializeConversation);
  }

  public getConversation(conversationId: number) {
    const conversation = this.requireConversation(conversationId);
    return {
      conversation: serializeConversation(conversation),
      messages: this.messageRepository
        .findAllByConversation(conversationId)
        .map(serializeMessage),
      sources: this.contextRepository
        .findAllByConversation(conversationId)
        .map(serializeNote),
    };
  }

  public async autoSegmentNote(noteId: number): Promise<void> {
    const logFile = path.join(app.getPath('userData'), 'speakspace_askai.log');
    fs.appendFileSync(
      logFile,
      `\n[${new Date().toISOString()}] autoSegmentNote called for noteId ${noteId}\n`,
    );
    try {
      const note = this.noteRepository.findById(noteId);
      fs.appendFileSync(logFile, `Note found: ${!!note}\n`);
      if (!note || !note.getTranscript().trim()) {
        fs.appendFileSync(
          logFile,
          `Aborting: note missing or empty transcript.\n`,
        );
        return;
      }

      fs.appendFileSync(
        logFile,
        `todoExtractionService exists: ${!!this.todoExtractionService}\n`,
      );

      // Launch Todo Extraction independently so it doesn't block or depend on the summary generation
      if (this.todoExtractionService) {
        this.todoExtractionService.extractTodosForNote(noteId).catch((err) => {
          console.error('Failed to extract todos automatically:', err);
          fs.appendFileSync(logFile, `extractTodosForNote threw: ${err}\n`);
        });
      } else {
        fs.appendFileSync(logFile, `todoExtractionService is UNDEFINED!\n`);
      }

      const prompt = `Please analyze the following transcript and provide a structured summary.
Break down the transcript into logical segments based on the topics discussed.
For each segment, provide a brief title and a concise bullet-point summary of what that part specifically refers to or what actions were decided.

Transcript:
${note.getTranscript()}`;

      const reply = await this.chatService.chat([
        { role: 'user', content: prompt },
      ]);

      if (reply && reply.content) {
        const subnote = new Subnote(
          0,
          noteId,
          'AI Auto Segmentation',
          reply.content,
          new Date(),
        );
        this.subnoteRepository.create(subnote);
      }
    } catch (error) {
      console.error('Failed to auto-segment note:', error);
    }
  }

  public async ask(request: AskAIRequest): Promise<AskAIResultDTO> {
    const question = AskAIService.normalizeQuestion(request.question);
    const { scope } = request;
    const existingConversation = request.conversationId
      ? this.requireConversation(request.conversationId)
      : null;
    const history = existingConversation
      ? this.messageRepository.findAllByConversation(
          existingConversation.getId(),
        )
      : [];
    const sources = this.noteService.getSources(
      scope,
      request.workspaceId ?? null,
      request.noteId ?? null,
      request.noteIds ?? null,
    );
    const directAnswer = createEmptyContextAnswer(scope, sources, question);
    const reply = directAnswer
      ? { content: directAnswer, modelName: null }
      : await this.chatService.chat(
          buildAskAIMessages(scope, sources, history, question),
        );
    const conversation =
      existingConversation ??
      this.conversationRepository.createWithName(
        createConversationName(question),
      );

    this.attachSources(
      conversation.getId(),
      sources.map((note) => note.getId()),
    );
    this.messageRepository.createForConversation(
      conversation.getId(),
      'user',
      question,
    );
    this.messageRepository.createForConversation(
      conversation.getId(),
      'assistant',
      reply.content,
    );
    conversation.setUpdatedAt(new Date());
    this.conversationRepository.update(conversation);

    return {
      ...this.getConversation(conversation.getId()),
      answer: reply.content,
      modelName: reply.modelName,
      scope,
    };
  }

  /**
   * 把一轮已经生成好的问答写进会话记录，不调用模型。
   * 智能体模式用它，让 Agent 的问答和普通对话一样出现在「最近会话」里，
   * 也能被重新打开查看。
   */
  public recordTurn(request: RecordAskAITurnRequest): AskAIResultDTO {
    const question = AskAIService.normalizeQuestion(request.question);
    const answer = String(request.answer || '').trim();
    if (!answer) throw new Error('回答不能为空 / Answer is required');

    const conversation =
      (request.conversationId
        ? this.requireConversation(request.conversationId)
        : null) ??
      this.conversationRepository.createWithName(
        createConversationName(question),
      );

    // 智能体有关联笔记时以它们为明确上下文；这里同步记为会话来源。
    const noteIds = (request.noteIds ?? []).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    this.attachSources(conversation.getId(), noteIds);
    this.messageRepository.createForConversation(
      conversation.getId(),
      'user',
      question,
    );
    this.messageRepository.createForConversation(
      conversation.getId(),
      'assistant',
      answer,
    );
    conversation.setUpdatedAt(new Date());
    this.conversationRepository.update(conversation);

    return {
      ...this.getConversation(conversation.getId()),
      answer,
      modelName: null,
      scope: 'multi-note',
    };
  }

  private requireConversation(id: number): AIConversation {
    const conversation = this.conversationRepository.findById(id);
    if (!conversation) throw new Error('会话不存在 / Conversation not found');
    return conversation;
  }

  private attachSources(conversationId: number, noteIds: number[]): void {
    noteIds.forEach((noteId) => {
      // A stale renderer may still submit an id after the Note was moved to
      // Trash. Keep the conversation, but never reattach unavailable content.
      if (!this.noteRepository.findById(noteId)) return;
      if (!this.contextRepository.exists(conversationId, noteId)) {
        this.contextRepository.addContext(conversationId, noteId);
      }
    });
  }

  private static normalizeQuestion(value: unknown): string {
    const question = typeof value === 'string' ? value.trim() : '';
    if (!question) throw new Error('问题不能为空 / Question is required');
    if (question.length > MAX_QUESTION_CHARACTERS) {
      throw new Error(`问题不能超过 ${MAX_QUESTION_CHARACTERS} 个字符`);
    }
    return question;
  }
}
