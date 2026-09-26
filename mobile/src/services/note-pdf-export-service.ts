import { File } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import type { AiConversationService } from "@/services/ai-conversation-service";
import type { CoreNoteInsightService } from "@/services/core-note-insight-service";
import type { KnowledgeService } from "@/services/knowledge-service";
import { buildNotePdfHtml } from "@/services/note-pdf-document";
import type { NoteService } from "@/services/note-service";
import type { WorkspaceService } from "@/services/workspace-service";

export class NotePdfExportService {
  public constructor(
    private readonly noteService: NoteService,
    private readonly workspaceService: WorkspaceService,
    private readonly coreNoteInsightService: CoreNoteInsightService,
    private readonly knowledgeService: KnowledgeService,
    private readonly aiConversationService: AiConversationService,
  ) {}

  public async exportAndShare(noteId: string): Promise<void> {
    const note = await this.noteService.getNote(noteId);
    if (!note) throw new Error("Note not found.");
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("The iOS share sheet is unavailable on this device.");
    }
    const [workspace, structuredNote, knowledgeHistory, conversations] =
      await Promise.all([
        this.workspaceService.getWorkspace(note.getWorkspaceId()),
        this.coreNoteInsightService.getForNote(noteId),
        this.knowledgeService.getHistoryForNote(noteId),
        this.aiConversationService.getConversationExportForNote(noteId),
      ]);
    const html = buildNotePdfHtml({
      note,
      workspaceName: workspace?.getName() ?? null,
      structuredNote,
      knowledgeHistory,
      conversations,
    });
    let temporaryPdf: File | null = null;
    try {
      const result = await Print.printToFileAsync({
        html,
        margins: { top: 36, right: 36, bottom: 36, left: 36 },
      });
      temporaryPdf = new File(result.uri);
      await Sharing.shareAsync(result.uri, {
        UTI: "com.adobe.pdf",
        mimeType: "application/pdf",
        dialogTitle: `Share ${note.getName()?.trim() || "Note"} as PDF`,
      });
    } finally {
      if (temporaryPdf?.exists) {
        try {
          temporaryPdf.delete();
        } catch (error) {
          console.warn("[NotePdfExport] Unable to remove temporary PDF", { error });
        }
      }
    }
  }
}
