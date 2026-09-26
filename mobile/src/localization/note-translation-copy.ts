export type NoteTranslationCopy = {
  languageName: string;
  translate: string;
  translating: string;
  restore: string;
  translatedInto: (language: string) => string;
  translateInto: (language: string) => string;
  localHint: string;
  genericError: string;
  restoreError: string;
};

export const NOTE_TRANSLATION_COPY = {
  en: {
    languageName: "English",
    translate: "Translate",
    translating: "Translating…",
    restore: "Restore original",
    translatedInto: (language: string) => `Translated into ${language}`,
    translateInto: (language: string) => `Translate into ${language}`,
    localHint: "Runs privately with your active local LLM.",
    genericError: "Unable to translate this section.",
    restoreError: "Unable to restore the original text.",
  },
} as const;
