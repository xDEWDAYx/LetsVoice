import {
  TranscriptionLanguage,
  WHISPER_LANGUAGE_NAMES,
  WhisperLanguage,
} from '@shared/types/TranscriptionTypes';

export type LanguageOption = {
  value: WhisperLanguage;
  label: string;
};

const DISPLAY_LABEL_OVERRIDES: Partial<Record<WhisperLanguage, string>> = {
  en: 'English',
  zh: '中文 / Chinese',
  ja: '日本語 / Japanese',
  ko: '한국어 / Korean',
  fr: 'Français / French',
  de: 'Deutsch / German',
  es: 'Español / Spanish',
  pt: 'Português / Portuguese',
};

export const COMMON_LANGUAGE_CODES: WhisperLanguage[] = [
  'en',
  'zh',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'pt',
];

export const COMMON_LANGUAGE_OPTIONS: LanguageOption[] =
  COMMON_LANGUAGE_CODES.map((value) => ({
    value,
    label: DISPLAY_LABEL_OVERRIDES[value] ?? WHISPER_LANGUAGE_NAMES[value],
  }));

const commonLanguageSet = new Set<WhisperLanguage>(COMMON_LANGUAGE_CODES);

export const MORE_LANGUAGE_OPTIONS: LanguageOption[] = (
  Object.keys(WHISPER_LANGUAGE_NAMES) as WhisperLanguage[]
)
  .filter((value) => !commonLanguageSet.has(value))
  .map((value) => ({
    value,
    label: DISPLAY_LABEL_OVERRIDES[value] ?? WHISPER_LANGUAGE_NAMES[value],
  }))
  .sort((left, right) => left.label.localeCompare(right.label));

export function getLanguageLabel(language: TranscriptionLanguage): string {
  if (language === 'auto') return 'Auto detect';
  return (
    DISPLAY_LABEL_OVERRIDES[language] ??
    WHISPER_LANGUAGE_NAMES[language] ??
    language.toUpperCase()
  );
}
