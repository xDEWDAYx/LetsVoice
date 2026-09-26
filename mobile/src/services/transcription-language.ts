import Storage from "expo-sqlite/kv-store";

export const TRANSCRIPTION_LANGUAGES = [
  { code: "auto", label: "Auto" },
  { code: "zh", label: "中文" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
] as const;

export type TranscriptionLanguage =
  (typeof TRANSCRIPTION_LANGUAGES)[number]["code"];

export const TRANSCRIPTION_LANGUAGE_STORAGE_KEY =
  "settings.transcription-language";

export function isTranscriptionLanguage(
  value: string | null,
): value is TranscriptionLanguage {
  return TRANSCRIPTION_LANGUAGES.some(({ code }) => code === value);
}

export function readTranscriptionLanguage(): TranscriptionLanguage {
  try {
    const stored = Storage.getItemSync(TRANSCRIPTION_LANGUAGE_STORAGE_KEY);
    return isTranscriptionLanguage(stored) ? stored : "auto";
  } catch (error) {
    console.warn(
      "[Transcription] Could not read the speech language setting; using automatic detection.",
      { error },
    );
    return "auto";
  }
}

export async function saveTranscriptionLanguage(
  language: TranscriptionLanguage,
): Promise<void> {
  await Storage.setItem(TRANSCRIPTION_LANGUAGE_STORAGE_KEY, language);
}
