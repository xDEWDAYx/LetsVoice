import type { LlmModelEngine } from "@/domain/llm-model/llm-model";

export const LLM_MODELS_DIRECTORY_NAME = "llm-models";

export type LlmModelCatalogEntry = {
  id: string;
  engine: LlmModelEngine;
  name: string;
  description: string;
  format: string;
  quantization: string;
  sizeBytes: number;
  fileName: string;
  downloadUrl: string;
  recommendedForChinese?: boolean;
};

/**
 * Instruction-tuned GGUF candidates for on-device feasibility testing.
 * Model identities were checked against the official publisher cards; every
 * Q4_K_M filename below was separately checked in the linked GGUF repository.
 */
export const LLM_MODEL_CATALOG: readonly LlmModelCatalogEntry[] = [
  {
    id: "qwen2.5-1.5b-instruct-q4-k-m",
    engine: "llama.rn",
    name: "Qwen2.5 1.5B Instruct",
    description:
      "Recommended for Chinese and mixed Chinese/English notes, with stronger grounded question answering and structured JSON output.",
    format: "GGUF",
    quantization: "Q4_K_M",
    sizeBytes: 986_000_000,
    fileName: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf?download=true",
    recommendedForChinese: true,
  },
  {
    id: "llama-3.2-1b-instruct-q4-k-m",
    engine: "llama.rn",
    name: "Llama 3.2 1B Instruct",
    description:
      "Llama 1B general-purpose multilingual instruction model for compact text generation.",
    format: "GGUF",
    quantization: "Q4_K_M",
    sizeBytes: 808_000_000,
    fileName: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true",
  },
  {
    id: "llama-3.2-3b-instruct-q4-k-m",
    engine: "llama.rn",
    name: "Llama 3.2 3B Instruct",
    description:
      "Larger 3B instruction-tuned candidate from the multilingual Llama 3.2 family.",
    format: "GGUF",
    quantization: "Q4_K_M",
    sizeBytes: 2_020_000_000,
    fileName: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true",
  },
  {
    id: "gemma-3-1b-it-q4-k-m",
    engine: "llama.rn",
    name: "Gemma 3 1B IT",
    description:
      "Current-generation 1B multilingual Gemma instruction model for text generation.",
    format: "GGUF",
    quantization: "Q4_K_M",
    sizeBytes: 806_000_000,
    fileName: "gemma-3-1b-it-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf?download=true",
  },
  {
    id: "phi-4-mini-instruct-q4-k-m",
    engine: "llama.rn",
    name: "Phi-4 Mini Instruct",
    description:
      "Microsoft's approximately 3.8B-parameter multilingual general instruction model.",
    format: "GGUF",
    quantization: "Q4_K_M",
    sizeBytes: 2_490_000_000,
    fileName: "Phi-4-mini-instruct-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf?download=true",
  },
  {
    id: "lfm2.5-1.2b-instruct-q4-k-m",
    engine: "llama.rn",
    name: "LFM2.5 1.2B Instruct",
    description:
      "LFM 1.2B general instruction model designed for compact and on-device deployment.",
    format: "GGUF",
    quantization: "Q4_K_M",
    sizeBytes: 731_000_000,
    fileName: "LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/main/LFM2.5-1.2B-Instruct-Q4_K_M.gguf?download=true",
  },
  {
    id: "ministral-3-8b-instruct-2512-q4-k-m",
    engine: "llama.rn",
    name: "Ministral 3 8B Instruct",
    description:
      "High-resource 8B boundary candidate reserved for on-device feasibility testing.",
    format: "GGUF",
    quantization: "Q4_K_M",
    sizeBytes: 5_200_000_000,
    fileName: "Ministral-3-8B-Instruct-2512-Q4_K_M.gguf",
    downloadUrl:
      "https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512-GGUF/resolve/main/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf?download=true",
  },
];
