import type { ContentLanguage } from "@/localization/i18n";

export type NoteTranslationPayload = {
  transcript: string;
  strings: Record<string, string>;
  sources?: Record<string, string>;
  languageCode?: ContentLanguage;
};

export type NoteTranslationSection = "transcript" | "insights" | "knowledge";

export class NoteTranslation {
  public constructor(
    private readonly noteId: string,
    private readonly targetLanguage: string,
    private readonly payload: NoteTranslationPayload,
    private readonly activeSections: NoteTranslationSection[],
    private readonly modelId: string,
    private readonly createdAt: string,
    private readonly updatedAt: string,
  ) {}

  public getNoteId(): string { return this.noteId; }
  public getTargetLanguage(): string { return this.targetLanguage; }
  public getPayload(): NoteTranslationPayload { return this.payload; }
  public getActiveSections(): readonly NoteTranslationSection[] { return this.activeSections; }
  public isSectionActive(section: NoteTranslationSection): boolean { return this.activeSections.includes(section); }
  public getModelId(): string { return this.modelId; }
  public getCreatedAt(): string { return this.createdAt; }
  public getUpdatedAt(): string { return this.updatedAt; }
}
