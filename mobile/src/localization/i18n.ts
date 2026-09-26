/** Content translation languages remain separate from the English-only iPhone UI. */
export const CONTENT_LANGUAGES = ["en", "zh-CN", "es", "fr", "de", "ja", "ko", "pt"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const UI_LANGUAGES = ["en"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export const IOS_UI_LANGUAGE: UiLanguage = "en";
export const languageNames: Record<ContentLanguage, string> = {
  en: "English",
  "zh-CN": "Simplified Chinese",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
};
