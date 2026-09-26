import type { TTSModelType } from "react-native-sherpa-onnx/tts";
import type { TtsLanguageCode } from "@/services/tts-language";

export type TtsModelCatalogEntry = {
  id: string;
  name: string;
  description: string;
  modelType: TTSModelType;
  languages: readonly TtsLanguageCode[];
  sizeBytes: number;
  speakers: string;
};

/** Curated sherpa-onnx release models that are practical for local mobile use. */
export const TTS_MODEL_CATALOG: readonly TtsModelCatalogEntry[] = [
  {
    id: "sherpa-onnx-supertonic-3-tts-int8-2026-05-11",
    name: "Supertonic 3 (INT8)",
    description: "Default multilingual model for broad language coverage.",
    modelType: "supertonic",
    languages: ["en", "es", "fr", "de", "ja", "ko", "pt"],
    sizeBytes: 128_774_318,
    speakers: "Multiple voices",
  },
  {
    id: "kokoro-int8-multi-lang-v1_1",
    name: "Kokoro Multilingual v1.1 (INT8)",
    description: "Recommended Chinese model with compact INT8 weights and English support.",
    modelType: "kokoro",
    languages: ["zh-CN", "en"],
    sizeBytes: 147_031_220,
    speakers: "Multiple voices",
  },
  {
    id: "kokoro-multi-lang-v1_0",
    name: "Kokoro Multilingual v1.0",
    description: "Full-precision Chinese and English alternative.",
    modelType: "kokoro",
    languages: ["zh-CN", "en"],
    sizeBytes: 349_418_188,
    speakers: "Multiple voices",
  },
  {
    id: "matcha-icefall-zh-en",
    name: "Matcha Chinese + English",
    description: "Bilingual alternative based on the Matcha architecture.",
    modelType: "matcha",
    languages: ["zh-CN", "en"],
    sizeBytes: 79_033_838,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-zh_CN-xiao_ya-medium",
    name: "Piper Xiao Ya Chinese (Medium)",
    description: "Dedicated Mandarin voice and the preferred compact Piper option.",
    modelType: "vits",
    languages: ["zh-CN"],
    sizeBytes: 60_462_944,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-zh_CN-chaowen-medium",
    name: "Piper Chaowen Chinese (Medium)",
    description: "Dedicated Mandarin backup voice.",
    modelType: "vits",
    languages: ["zh-CN"],
    sizeBytes: 60_443_846,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-en_US-lessac-medium",
    name: "Piper Lessac English (Medium)",
    description: "Compact US English voice with a good quality and speed balance.",
    modelType: "vits",
    languages: ["en"],
    sizeBytes: 67_230_653,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-en_US-lessac-high",
    name: "Piper Lessac English (High)",
    description: "Higher-quality US English voice for devices with more storage.",
    modelType: "vits",
    languages: ["en"],
    sizeBytes: 115_545_841,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-es_ES-davefx-medium",
    name: "Piper DaveFX Spanish (Medium)",
    description: "Dedicated Spanish voice.",
    modelType: "vits",
    languages: ["es"],
    sizeBytes: 67_184_952,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-fr_FR-siwis-medium",
    name: "Piper Siwis French (Medium)",
    description: "Dedicated French voice.",
    modelType: "vits",
    languages: ["fr"],
    sizeBytes: 67_207_459,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-de_DE-thorsten-medium",
    name: "Piper Thorsten German (Medium)",
    description: "Compact dedicated German voice.",
    modelType: "vits",
    languages: ["de"],
    sizeBytes: 67_214_254,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-de_DE-thorsten-high",
    name: "Piper Thorsten German (High)",
    description: "Higher-quality German voice for devices with more storage.",
    modelType: "vits",
    languages: ["de"],
    sizeBytes: 115_591_546,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-pt_BR-jeff-medium",
    name: "Piper Jeff Portuguese (Brazil, Medium)",
    description: "Dedicated Brazilian Portuguese voice.",
    modelType: "vits",
    languages: ["pt"],
    sizeBytes: 67_207_052,
    speakers: "1 voice",
  },
  {
    id: "vits-piper-pt_PT-tugao-medium",
    name: "Piper Tugao Portuguese (Portugal, Medium)",
    description: "Dedicated European Portuguese voice.",
    modelType: "vits",
    languages: ["pt"],
    sizeBytes: 67_195_014,
    speakers: "1 voice",
  },
];
