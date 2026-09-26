import type { SttModelEngine } from "@/domain/stt-model/stt-model";

/** Directory (relative to the app document directory) for downloaded models. */
export const STT_MODELS_DIRECTORY_NAME = "stt-models";

export type SttModelCatalogEntry = {
  id: string;
  engine: SttModelEngine;
  name: string;
  description: string;
  format: string;
  quantization: string | null;
  sizeBytes: number;
  expectedSizeBytes?: number;
  fileName: string;
  downloadUrl: string;
  transcriptionLanguage?: string;
  languageLabel: string;
  recommendedForChinese?: boolean;
};

type ModelDefinition = readonly [id: string, sizeMiB: number];

const WHISPER_MODELS: readonly ModelDefinition[] = [
  ["tiny", 75],
  ["tiny-q5_1", 31],
  ["tiny-q8_0", 42],
  ["base", 142],
  ["base-q5_1", 57],
  ["base-q8_0", 78],
  ["small", 466],
  ["small-q5_1", 181],
  ["small-q8_0", 252],
  ["medium", 1_464],
  ["medium-q5_0", 514],
  ["medium-q8_0", 785],
  ["large-v3", 2_950],
  ["large-v3-q5_0", 1_080],
  ["large-v3-turbo", 1_550],
  ["large-v3-turbo-q5_0", 574],
  ["large-v3-turbo-q8_0", 834],
];

const PARAKEET_MODELS: readonly ModelDefinition[] = [
  ["parakeet-tdt-0.6b-v3-f32", 2_520],
  ["parakeet-tdt-0.6b-v3-f16", 1_290],
  ["parakeet-tdt-0.6b-v3-q8_0", 669],
  ["parakeet-tdt-0.6b-v3-q4_0", 356],
  ["parakeet-tdt-0.6b-v3-q4_k", 416],
];

function quantizationFromId(id: string): string {
  const suffix = id.match(/-(f32|f16|q\d+_[0-9a-z]+)$/i)?.[1];
  return suffix?.toUpperCase() ?? "F16";
}

function createWhisperEntry([id, sizeMiB]: ModelDefinition): SttModelCatalogEntry {
  const quantization = quantizationFromId(id);
  const modelName = id.replace(/-(?:q5_0|q5_1|q8_0)$/i, "");
  return {
    id,
    engine: "whisper",
    name: `Whisper ${modelName} (${quantization})`,
    description: `Multilingual Whisper ${modelName} speech recognition model (${quantization}).`,
    format: "GGML",
    quantization,
    sizeBytes: sizeMiB * 1024 * 1024,
    fileName: `ggml-${id}.bin`,
    downloadUrl: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin?download=true`,
    languageLabel: "Multilingual",
    recommendedForChinese: id === "small",
  };
}

function createParakeetEntry([id, sizeMiB]: ModelDefinition): SttModelCatalogEntry {
  const quantization = quantizationFromId(id);
  return {
    id,
    engine: "parakeet",
    name: `Parakeet TDT 0.6B v3 (${quantization})`,
    description: `English-only NVIDIA Parakeet TDT 0.6B v3 speech recognition model (${quantization}).`,
    format: "GGUF",
    quantization,
    sizeBytes: sizeMiB * 1024 * 1024,
    fileName: `ggml-${id}.bin`,
    downloadUrl: `https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/ggml-${id}.bin?download=true`,
    languageLabel: "English only",
  };
}

/** The complete set of STT models offered for download. */
export const STT_MODEL_CATALOG: readonly SttModelCatalogEntry[] = [
  ...WHISPER_MODELS.map(createWhisperEntry),
  ...PARAKEET_MODELS.map(createParakeetEntry),
];
