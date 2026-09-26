import { NOTE_TRANSLATION_COPY } from "@/localization/note-translation-copy";

export function useNoteTranslationCopy() {
  return { language: "en" as const, copy: NOTE_TRANSLATION_COPY.en };
}
