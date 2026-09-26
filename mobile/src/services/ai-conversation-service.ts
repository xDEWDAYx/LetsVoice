import { AiConversation } from "@/domain/ai-conversation/ai-conversation";
import { AiMessage, AiMessageRole } from "@/domain/ai-message/ai-message";
import { Note } from "@/domain/note/note";
import { AiConversationNotFoundError } from "@/errors/ai-conversation-not-found-error";
import { ValidationError } from "@/errors/validation-error";
import { AiConversationRepository } from "@/repositories/ai-conversation-repository";
import { AiMessageRepository } from "@/repositories/ai-message-repository";
import { ConversationContextRepository } from "@/repositories/conversation-context-repository";
import { NoteRepository } from "@/repositories/note-repository";

export type SendUserMessageInput =
  | {
      conversationId: string;
      content: string;
    }
  | {
      noteIds: readonly string[];
      content: string;
      conversationName?: string | null;
    };

export type SendUserMessageResult = {
  conversationId: string;
  messages: AiMessage[];
};

export type AiConversationHistoryItem = {
  conversation: AiConversation;
  linkedNotes: Note[];
  latestMessage: AiMessage | null;
};

export type NoteConversationExportItem = AiConversationHistoryItem & {
  messages: AiMessage[] | null;
};

export class AiConversationService {
  private readonly changeListeners = new Set<() => void>();

  public constructor(
    private readonly conversationRepository: AiConversationRepository,
    private readonly messageRepository: AiMessageRepository,
    private readonly contextRepository: ConversationContextRepository,
    private readonly noteRepository: NoteRepository,
  ) {}

  public async findConversation(id: string): Promise<AiConversation | null> {
    return this.conversationRepository.findById(id);
  }

  public subscribeToChanges(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  public async getConversationHistory(): Promise<AiConversationHistoryItem[]> {
    const conversations = await this.conversationRepository.findWithMessages();
    const items: AiConversationHistoryItem[] = [];

    for (const conversation of conversations) {
      const [linkedNotes, messages] = await Promise.all([
        this.getLinkedNotes(conversation.getId()),
        this.messageRepository.findByConversationId(conversation.getId()),
      ]);
      items.push({
        conversation,
        linkedNotes,
        latestMessage: messages.at(-1) ?? null,
      });
    }

    return items;
  }

  public async getConversationHistoryForNote(
    noteId: string,
  ): Promise<AiConversationHistoryItem[]> {
    const normalizedNoteId = noteId.trim();
    if (!normalizedNoteId) throw new ValidationError("Note id cannot be empty.");
    const history = await this.getConversationHistory();
    return history.filter((item) =>
      item.linkedNotes.some((note) => note.getId() === normalizedNoteId),
    );
  }

  public async getConversationExportForNote(
    noteId: string,
  ): Promise<NoteConversationExportItem[]> {
    const history = await this.getConversationHistoryForNote(noteId);
    return Promise.all(
      history.map(async (item) => ({
        ...item,
        messages:
          item.linkedNotes.length === 1 && item.linkedNotes[0].getId() === noteId
            ? await this.messageRepository.findByConversationId(
                item.conversation.getId(),
              )
            : null,
      })),
    );
  }

  public async getResumeTargetForNote(
    noteId: string,
  ): Promise<AiConversation | null> {
    const normalizedNoteId = noteId.trim();
    if (normalizedNoteId.length === 0) {
      throw new ValidationError("Note id cannot be empty.");
    }
    return this.conversationRepository.findLatestByNoteId(normalizedNoteId);
  }

  public async getResumeTargetForNotes(noteIds: readonly string[]): Promise<AiConversation | null> {
    const normalized = this.normalizeNoteIds(noteIds);
    return this.conversationRepository.findLatestByExactNoteIds(normalized);
  }

  public async getConversationOrThrow(id: string): Promise<AiConversation> {
    const conversation = await this.conversationRepository.findById(id);
    if (conversation === null) {
      throw new AiConversationNotFoundError(id);
    }
    return conversation;
  }

  public async hasMessages(conversationId: string): Promise<boolean> {
    const count = await this.messageRepository.countByConversationId(conversationId);
    return count > 0;
  }

  public async getCanonicalMessages(conversationId: string): Promise<AiMessage[]> {
    await this.getConversationOrThrow(conversationId);
    return this.messageRepository.findByConversationId(conversationId);
  }

  public async getLinkedNoteIds(conversationId: string): Promise<string[]> {
    await this.getConversationOrThrow(conversationId);
    return this.contextRepository.findNoteIdsByConversationId(conversationId);
  }

  public async getLinkedNotes(conversationId: string): Promise<Note[]> {
    const noteIds = await this.getLinkedNoteIds(conversationId);
    const notes: Note[] = [];
    for (const noteId of noteIds) {
      const note = await this.noteRepository.findByIdIncludingTrashed(noteId);
      if (note !== null) {
        notes.push(note);
      }
    }
    return notes;
  }

  public async canGenerate(conversationId: string): Promise<boolean> {
    const ids = await this.getLinkedNoteIds(conversationId);
    return this.noteRepository.areAllActive(ids);
  }

  public async assertCanGenerate(conversationId: string): Promise<void> {
    if (!(await this.canGenerate(conversationId))) {
      throw new ValidationError("Restore all source notes and workspaces before asking another question.");
    }
  }

  public async linkNote(conversationId: string, noteId: string): Promise<void> {
    await this.getConversationOrThrow(conversationId);
    if (await this.hasMessages(conversationId)) {
      throw new ValidationError(
        "Cannot change transcript context after the conversation has started.",
      );
    }

    const note = await this.noteRepository.findById(noteId);
    if (note === null) {
      throw new ValidationError("Note not found.");
    }

    if (note.getTranscript().trim().length === 0) {
      throw new ValidationError("Note has no transcript.");
    }

    await this.contextRepository.link(conversationId, noteId);
    this.publishChange();
  }

  public async unlinkNote(conversationId: string, noteId: string): Promise<void> {
    await this.getConversationOrThrow(conversationId);
    if (await this.hasMessages(conversationId)) {
      throw new ValidationError(
        "Cannot change transcript context after the conversation has started.",
      );
    }
    await this.contextRepository.unlink(conversationId, noteId);
    this.publishChange();
  }

  /**
   * Saves a user message and returns canonical history from the database.
   * When conversationId is omitted, atomically creates conversation + context + first message.
   */
  public async sendUserMessage(
    input: SendUserMessageInput,
  ): Promise<SendUserMessageResult> {
    const content = input.content.trim();
    if (content.length === 0) {
      throw new ValidationError("Message cannot be empty.");
    }

    if ("conversationId" in input) {
      const conversationId = input.conversationId;
      await this.getConversationOrThrow(conversationId);
      await this.assertCanGenerate(conversationId);
      await this.insertUserMessage(conversationId, content);
      this.publishChange();
      return {
        conversationId,
        messages: await this.getCanonicalMessages(conversationId),
      };
    }

    const noteIds = this.normalizeNoteIds(input.noteIds);
    const notes: Note[] = [];
    for (const noteId of noteIds) {
      const note = await this.noteRepository.findById(noteId);
      if (!note) throw new ValidationError("One or more selected notes are unavailable.");
      if (!note.getTranscript().trim()) throw new ValidationError("Every selected note must have a transcript.");
      notes.push(note);
    }

    const conversationId = await this.createConversationWithFirstMessage(
      notes,
      content,
      input.conversationName ?? (notes.length === 1 ? notes[0].getName() : `${notes.length} notes`),
    );
    this.publishChange();

    return {
      conversationId,
      messages: await this.getCanonicalMessages(conversationId),
    };
  }

  public async addAssistantMessage(
    conversationId: string,
    content: string,
  ): Promise<AiMessage> {
    const normalized = content.trim();
    if (normalized.length === 0) {
      throw new ValidationError("Assistant message cannot be empty.");
    }

    await this.getConversationOrThrow(conversationId);
    const message = this.createMessage(conversationId, "assistant", normalized);
    await this.messageRepository.create(message);
    await this.conversationRepository.touchUpdatedAt(
      conversationId,
      new Date().toISOString(),
    );
    this.publishChange();
    return message;
  }

  private async insertUserMessage(
    conversationId: string,
    content: string,
  ): Promise<void> {
    const message = this.createMessage(conversationId, "user", content);
    await this.messageRepository.create(message);
    await this.conversationRepository.touchUpdatedAt(
      conversationId,
      new Date().toISOString(),
    );
  }

  private async createConversationWithFirstMessage(
    notes: readonly Note[],
    userContent: string,
    conversationName: string | null,
  ): Promise<string> {
    const now = new Date().toISOString();
    const conversationId = this.createId("conv");
    const conversation = new AiConversation(
      conversationId,
      conversationName?.trim() || "Ask AI",
      now,
      now,
    );
    const userMessage = this.createMessage(conversationId, "user", userContent);

    await this.conversationRepository.createWithContextsAndFirstMessage(
      conversation,
      notes.map((note) => note.getId()),
      userMessage,
    );

    return conversationId;
  }

  private normalizeNoteIds(noteIds: readonly string[]): string[] {
    const normalized = [...new Set(noteIds.map((id) => id.trim()).filter(Boolean))].sort();
    if (normalized.length === 0) throw new ValidationError("Select at least one note.");
    if (normalized.length > 3) throw new ValidationError("Select up to 3 notes.");
    return normalized;
  }

  private createMessage(
    conversationId: string,
    role: AiMessageRole,
    content: string,
  ): AiMessage {
    const now = new Date().toISOString();
    return new AiMessage(
      this.createId("msg"),
      conversationId,
      role,
      content,
      now,
    );
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private publishChange(): void {
    this.changeListeners.forEach((listener) => listener());
  }
}
