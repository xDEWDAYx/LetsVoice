import {
  buildCategoryPrompt,
  parseCategory,
  type NoteCategory,
} from "@/constants/note-categories";
import { NoteRepository } from "@/repositories/note-repository";
import { LlmModelService } from "@/services/llm-model-service";
import { LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { LlmRequestService } from "@/services/llm-request-service";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";

export type NoteCategoryChange = { noteId: string; category: NoteCategory };
type NoteCategoryChangeListener = (change: NoteCategoryChange) => void;

export class NoteClassificationService {
  private readonly listeners = new Set<NoteCategoryChangeListener>();

  public constructor(
    private readonly noteRepository: NoteRepository,
    private readonly llmModelService: LlmModelService,
    private readonly coordinator: LocalLlmCoordinator,
    private readonly requests: LlmRequestService,
    private readonly sharedContext: SharedLlmContextService,
  ) {}

  public async classifyNote(noteId: string): Promise<NoteCategory | null> {
    const note = await this.noteRepository.findById(noteId);
    if (!note || note.getTranscript().trim().length === 0) return null;
    const category = await this.classifyTranscript(note.getTranscript());
    if (!category) return null;
    const saved = await this.noteRepository.updateCategoryIfUnchanged(
      noteId,
      category,
      note.getUpdatedAt(),
    );
    if (saved) this.publish({ noteId, category });
    return saved ? category : null;
  }

  public subscribe(listener: NoteCategoryChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async classifyTranscript(transcript: string): Promise<NoteCategory | null> {
    try {
      const model = await this.llmModelService.getActiveModel();
      if (!model) return null;
      const file = this.llmModelService.resolveModelFile(model);
      if (!file.exists) return null;
      return this.coordinator.runExclusive("note-classification", async () => {
        try {
          const context = await this.requests.ensureReady();
          await this.sharedContext.activateCache(`note-classification:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);
          const { raw } = await this.requests.complete(context, {
            messages: [{ role: "user", content: buildCategoryPrompt(transcript) }],
            n_predict: 16,
            temperature: 0,
          });
          return parseCategory(raw);
        } finally { /* Shared runtime remains READY. */ }
      });
    } catch (error) {
      console.warn("[NoteCategory] Automatic classification failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private publish(change: NoteCategoryChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (error) {
        console.warn("[NoteCategory] Classification listener failed", {
          noteId: change.noteId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
