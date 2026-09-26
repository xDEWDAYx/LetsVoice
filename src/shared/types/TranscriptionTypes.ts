export const WHISPER_LANGUAGE_NAMES = {
  en: 'English',
  zh: 'Chinese',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
  ko: 'Korean',
  fr: 'French',
  ja: 'Japanese',
  pt: 'Portuguese',
  tr: 'Turkish',
  pl: 'Polish',
  ca: 'Catalan',
  nl: 'Dutch',
  ar: 'Arabic',
  sv: 'Swedish',
  it: 'Italian',
  id: 'Indonesian',
  hi: 'Hindi',
  fi: 'Finnish',
  vi: 'Vietnamese',
  he: 'Hebrew',
  uk: 'Ukrainian',
  el: 'Greek',
  ms: 'Malay',
  cs: 'Czech',
  ro: 'Romanian',
  da: 'Danish',
  hu: 'Hungarian',
  ta: 'Tamil',
  no: 'Norwegian',
  th: 'Thai',
  ur: 'Urdu',
  hr: 'Croatian',
  bg: 'Bulgarian',
  lt: 'Lithuanian',
  la: 'Latin',
  mi: 'Maori',
  ml: 'Malayalam',
  cy: 'Welsh',
  sk: 'Slovak',
  te: 'Telugu',
  fa: 'Persian',
  lv: 'Latvian',
  bn: 'Bengali',
  sr: 'Serbian',
  az: 'Azerbaijani',
  sl: 'Slovenian',
  kn: 'Kannada',
  et: 'Estonian',
  mk: 'Macedonian',
  br: 'Breton',
  eu: 'Basque',
  is: 'Icelandic',
  hy: 'Armenian',
  ne: 'Nepali',
  mn: 'Mongolian',
  bs: 'Bosnian',
  kk: 'Kazakh',
  sq: 'Albanian',
  sw: 'Swahili',
  gl: 'Galician',
  mr: 'Marathi',
  pa: 'Punjabi',
  si: 'Sinhala',
  km: 'Khmer',
  sn: 'Shona',
  yo: 'Yoruba',
  so: 'Somali',
  af: 'Afrikaans',
  oc: 'Occitan',
  ka: 'Georgian',
  be: 'Belarusian',
  tg: 'Tajik',
  sd: 'Sindhi',
  gu: 'Gujarati',
  am: 'Amharic',
  yi: 'Yiddish',
  lo: 'Lao',
  uz: 'Uzbek',
  fo: 'Faroese',
  ht: 'Haitian Creole',
  ps: 'Pashto',
  tk: 'Turkmen',
  nn: 'Nynorsk',
  mt: 'Maltese',
  sa: 'Sanskrit',
  lb: 'Luxembourgish',
  my: 'Myanmar',
  bo: 'Tibetan',
  tl: 'Tagalog',
  mg: 'Malagasy',
  as: 'Assamese',
  tt: 'Tatar',
  haw: 'Hawaiian',
  ln: 'Lingala',
  ha: 'Hausa',
  ba: 'Bashkir',
  jw: 'Javanese',
  su: 'Sundanese',
  yue: 'Cantonese',
} as const;

export type WhisperLanguage = keyof typeof WHISPER_LANGUAGE_NAMES;
export type TranscriptionLanguage = 'auto' | WhisperLanguage;

export function isWhisperLanguage(value: unknown): value is WhisperLanguage {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(WHISPER_LANGUAGE_NAMES, value)
  );
}

export type LanguageDetectionResult = {
  language: WhisperLanguage;
  confidence: number | null;
  source: 'whisper' | 'model-fixed';
};

export type TranscriptionSource =
  | { kind: 'file'; filePath: string; language?: TranscriptionLanguage }
  | {
      kind: 'recording';
      relativePath: string;
      language?: TranscriptionLanguage;
    };

export type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number | null;
  text: string;
};

export type TranscriptionProgress = {
  phase: 'preparing' | 'transcribing' | 'completed';
  message: string;
};

export type TranscriptionPartial = {
  jobId: string;
  segment: TranscriptSegment;
};

export type TranscriptionResult = {
  text: string;
  segments: TranscriptSegment[];
  engine: 'whisper' | 'parakeet';
  modelId: string;
  modelName: string;
  elapsedMs: number;
};

export type TranscriptionJobStatus =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TranscriptionJob = {
  id: string;
  source: TranscriptionSource;
  status: TranscriptionJobStatus;
  phase: TranscriptionProgress['phase'];
  statusMessage: string;
  errorMessage: string | null;
  result: TranscriptionResult | null;
  attempt: number;
  createdAt: string;
  updatedAt: string;
};
