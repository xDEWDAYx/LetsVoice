import type { RNLlamaOAICompatibleMessage } from "llama.rn";

import { LlmModelService } from "@/services/llm-model-service";
import { LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import {
  NOTE_TITLE_SOURCE_LIMIT,
  NOTE_TITLE_SYSTEM_PROMPT,
  sanitizeGeneratedNoteTitle,
} from "@/services/note-title";
import { SharedLlmContextService } from "@/services/shared-llm-context-service";

/** Generates the short semantic title shown before a finished recording is saved. */
export class NoteTitleGenerationService {
  public constructor(
    private readonly llmModelService: LlmModelService,
    private readonly coordinator: LocalLlmCoordinator,
    private readonly sharedContext: SharedLlmContextService,
  ) {}

  public async generate(transcript: string): Promise<string | null> {
    const source = transcript.trim().slice(0, NOTE_TITLE_SOURCE_LIMIT);
    if (!source) return null;

    const requestId = `note-title-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const model = await this.llmModelService.getActiveModel();
      if (!model) return null;
      const file = this.llmModelService.resolveModelFile(model);
      if (!file.exists) return null;

      return await this.coordinator.runExclusive("note-title", async () => {
        const prepared = await this.sharedContext.prepare(model.getId(), file.uri);
        await this.sharedContext.activateCache(requestId);
        const messages: RNLlamaOAICompatibleMessage[] = [
          { role: "system", content: NOTE_TITLE_SYSTEM_PROMPT },
          { role: "user", content: source },
        ];
        const result = await prepared.context.completion({
          messages,
          n_predict: 64,
          temperature: 0.2,
          enable_thinking: false,
          reasoning_format: "none",
        });
        const title = sanitizeGeneratedNoteTitle(result.content || result.text);
        console.info("[NoteTitle] Generation completed", {
          requestId,
          modelId: model.getId(),
          contextReused: prepared.reused,
          titleLength: title.length,
        });
        return title || null;
      });
    } catch (error) {
      console.warn("[NoteTitle] Automatic title generation failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
