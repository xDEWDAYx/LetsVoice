import { DatabaseManager } from "@/database";
import { AiConversationRepository } from "@/repositories/ai-conversation-repository";
import { AiMessageRepository } from "@/repositories/ai-message-repository";
import { ConversationContextRepository } from "@/repositories/conversation-context-repository";
import { NoteRepository } from "@/repositories/note-repository";
import { LlmModelRepository } from "@/repositories/llm-model-repository";
import { SttModelRepository } from "@/repositories/stt-model-repository";
import { TtsModelRepository } from "@/repositories/tts-model-repository";
import { WorkspaceRepository } from "@/repositories/workspace-repository";
import { AiConversationService } from "@/services/ai-conversation-service";
import { NoteService } from "@/services/note-service";
import { LlmInferenceService } from "@/services/llm-inference-service";
import { LlmModelService } from "@/services/llm-model-service";
import { SttModelService } from "@/services/stt-model-service";
import { TtsModelService } from "@/services/tts-model-service";
import { WorkspaceService } from "@/services/workspace-service";
import { TranscriptionService } from "@/services/transcription-service";
import { KnowledgeDocumentRepository } from "@/repositories/knowledge-document-repository";
import { KnowledgeService } from "@/services/knowledge-service";
import { CoreNoteInsightRepository } from "@/repositories/core-note-insight-repository";
import { CoreNoteInsightService } from "@/services/core-note-insight-service";
import { LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { SpeechPlaybackService } from "@/services/speech-playback-service";
import { NoteTranslationRepository } from "@/repositories/note-translation-repository";
import { NoteTranslationService } from "@/services/note-translation-service";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";
import { NoteClassificationService } from "@/services/note-classification-service";
import { TrashService } from "@/services/trash-service";
import { KnowledgeTemplateRepository } from "@/repositories/knowledge-template-repository";
import { KnowledgeTemplateService } from "@/services/knowledge-template-service";
import { AppPreferencesService } from "@/services/app-preferences-service";
import { NoteNotificationService } from "@/services/note-notification-service";
import { NotePdfExportService } from "@/services/note-pdf-export-service";
import { NoteTitleGenerationService } from "@/services/note-title-generation-service";
import { LlmRequestService } from "@/services/llm-request-service";

export class AppContainer {
  public readonly workspaceService: WorkspaceService;
  public readonly noteService: NoteService;
  public readonly llmModelService: LlmModelService;
  public readonly sttModelService: SttModelService;
  public readonly ttsModelService: TtsModelService;
  public readonly transcriptionService: TranscriptionService;
  public readonly knowledgeService: KnowledgeService;
  public readonly coreNoteInsightService: CoreNoteInsightService;
  public readonly aiConversationService: AiConversationService;
  public readonly llmInferenceService: LlmInferenceService;
  public readonly speechPlaybackService: SpeechPlaybackService;
  public readonly noteTranslationService: NoteTranslationService;
  public readonly trashService: TrashService;
  public readonly knowledgeTemplateService: KnowledgeTemplateService;
  public readonly preferencesService: AppPreferencesService;
  public readonly noteNotificationService: NoteNotificationService;
  public readonly notePdfExportService: NotePdfExportService;
  public readonly noteTitleGenerationService: NoteTitleGenerationService;
  public readonly inferenceScheduler: LocalLlmCoordinator;
  public readonly llmRequestService: LlmRequestService;

  public constructor(databaseManager: DatabaseManager) {
    this.preferencesService = new AppPreferencesService();
    const workspaceRepository = new WorkspaceRepository(databaseManager);
    const noteRepository = new NoteRepository(databaseManager);
    const llmModelRepository = new LlmModelRepository(databaseManager);
    const sttModelRepository = new SttModelRepository(databaseManager);
    const ttsModelRepository = new TtsModelRepository(databaseManager);
    const knowledgeDocumentRepository = new KnowledgeDocumentRepository(databaseManager);
    const knowledgeTemplateRepository = new KnowledgeTemplateRepository(databaseManager);
    const coreNoteInsightRepository = new CoreNoteInsightRepository(databaseManager);
    const aiConversationRepository = new AiConversationRepository(databaseManager);
    const aiMessageRepository = new AiMessageRepository(databaseManager);
    const conversationContextRepository = new ConversationContextRepository(
      databaseManager,
    );
    const localLlmCoordinator = new LocalLlmCoordinator();
    this.inferenceScheduler = localLlmCoordinator;
    const sharedLlmContextService = new SharedLlmContextService(localLlmCoordinator);
    const noteTranslationRepository = new NoteTranslationRepository(databaseManager);
    this.llmModelService = new LlmModelService(llmModelRepository, localLlmCoordinator);
    this.noteTitleGenerationService = new NoteTitleGenerationService(
      this.llmModelService,
      localLlmCoordinator,
      sharedLlmContextService,
    );
    this.llmRequestService = new LlmRequestService(this.llmModelService, sharedLlmContextService);
    this.noteTranslationService = new NoteTranslationService(noteTranslationRepository, this.llmModelService, localLlmCoordinator, sharedLlmContextService, this.llmRequestService);
    const noteClassificationService = new NoteClassificationService(
      noteRepository,
      this.llmModelService,
      localLlmCoordinator,
      this.llmRequestService,
      sharedLlmContextService,
    );
    this.workspaceService = new WorkspaceService(workspaceRepository, noteRepository);
    this.noteService = new NoteService(
      noteRepository,
      workspaceRepository,
      noteClassificationService,
    );
    this.trashService = new TrashService(
      databaseManager,
      () => this.noteService.notifyExternalContentChange(),
    );
    this.knowledgeService = new KnowledgeService(knowledgeDocumentRepository, this.llmModelService, localLlmCoordinator, this.llmRequestService, sharedLlmContextService);
    this.knowledgeTemplateService = new KnowledgeTemplateService(
      knowledgeTemplateRepository,
      this.llmModelService,
      localLlmCoordinator,
      this.llmRequestService,
      sharedLlmContextService,
    );
    this.coreNoteInsightService = new CoreNoteInsightService(coreNoteInsightRepository, this.llmModelService, localLlmCoordinator, this.llmRequestService, sharedLlmContextService);
    this.noteNotificationService = new NoteNotificationService(
      this.coreNoteInsightService,
      this.noteService,
      this.preferencesService,
      this.workspaceService,
    );
    this.sttModelService = new SttModelService(sttModelRepository);
    this.ttsModelService = new TtsModelService(ttsModelRepository);
    this.speechPlaybackService = new SpeechPlaybackService(this.ttsModelService, localLlmCoordinator);
    this.transcriptionService = new TranscriptionService(this.sttModelService, localLlmCoordinator);
    this.aiConversationService = new AiConversationService(
      aiConversationRepository,
      aiMessageRepository,
      conversationContextRepository,
      noteRepository,
    );
    const invalidateNoteSearch = () => this.noteService.invalidateSearchIndex();
    noteClassificationService.subscribe(invalidateNoteSearch);
    this.workspaceService.subscribeToChanges(invalidateNoteSearch);
    this.coreNoteInsightService.subscribeToChanges(invalidateNoteSearch);
    this.knowledgeService.subscribeToChanges(invalidateNoteSearch);
    this.aiConversationService.subscribeToChanges(invalidateNoteSearch);
    this.notePdfExportService = new NotePdfExportService(
      this.noteService,
      this.workspaceService,
      this.coreNoteInsightService,
      this.knowledgeService,
      this.aiConversationService,
    );
    this.llmInferenceService = new LlmInferenceService(
      this.llmModelService,
      this.aiConversationService,
      localLlmCoordinator,
      sharedLlmContextService,
      this.llmRequestService,
      this.preferencesService,
      this.speechPlaybackService,
    );
  }
}
