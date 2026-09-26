import { CONTENT_LANGUAGES, languageNames, type ContentLanguage } from "@/localization/i18n";

export type TtsLanguageCode = ContentLanguage;

const LANGUAGE_ALIASES: Record<TtsLanguageCode, readonly string[]> = {
  en: ["en", "en-us", "us-en", "en-gb", "gb-en", "english", "default"],
  "zh-CN": ["zh-cn", "zh", "cmn", "chinese", "mandarin"],
  es: ["es", "es-es", "spanish"],
  fr: ["fr", "fr-fr", "french"],
  de: ["de", "de-de", "german"],
  ja: ["ja", "ja-jp", "jp", "japanese"],
  ko: ["ko", "ko-kr", "kr", "korean"],
  pt: ["pt", "pt-br", "pt-pt", "portuguese"],
};

export function normalizeTtsLanguage(value: string | null | undefined): TtsLanguageCode | null {
  if (!value) return null;
  const normalized = value.trim().toLocaleLowerCase().replaceAll("_", "-");
  return CONTENT_LANGUAGES.find((language) =>
    language.toLocaleLowerCase() === normalized ||
    languageNames[language].toLocaleLowerCase() === normalized ||
    LANGUAGE_ALIASES[language].includes(normalized),
  ) ?? null;
}

export function selectLexiconLanguage(
  language: TtsLanguageCode,
  candidates: readonly string[],
): string | null {
  const normalizedCandidates = candidates.map((candidate) => candidate.toLocaleLowerCase().replaceAll("_", "-"));
  const match = LANGUAGE_ALIASES[language].find((alias) => normalizedCandidates.includes(alias));
  return match ? candidates[normalizedCandidates.indexOf(match)] : null;
}

/** Lightweight fallback used only when content metadata did not provide a language. */
export function detectTtsLanguage(text: string): TtsLanguageCode {
  if (/\p{Script=Han}/u.test(text)) return "zh-CN";
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return "ja";
  if (/\p{Script=Hangul}/u.test(text)) return "ko";
  const words = text.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
  const markers: Record<Exclude<TtsLanguageCode, "zh-CN" | "ja" | "ko">, readonly string[]> = {
    en: ["the", "and", "is", "to", "of", "this", "that"],
    es: ["el", "la", "los", "las", "de", "que", "para", "una"],
    fr: ["le", "la", "les", "des", "est", "que", "pour", "une"],
    de: ["der", "die", "das", "und", "ist", "für", "nicht"],
    pt: ["o", "a", "os", "as", "de", "que", "para", "uma", "não"],
  };
  let best: keyof typeof markers = "en";
  let bestScore = -1;
  for (const [language, languageMarkers] of Object.entries(markers) as [keyof typeof markers, readonly string[]][]) {
    const score = words.reduce((total, word) => total + Number(languageMarkers.includes(word)), 0);
    if (score > bestScore) { best = language; bestScore = score; }
  }
  return best;
}
