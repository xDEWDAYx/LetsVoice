import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/constants/llm-model-catalog.ts", import.meta.url),
  "utf8",
);

const expectedIds = [
  "qwen2.5-1.5b-instruct-q4-k-m",
  "llama-3.2-1b-instruct-q4-k-m",
  "llama-3.2-3b-instruct-q4-k-m",
  "gemma-3-1b-it-q4-k-m",
  "phi-4-mini-instruct-q4-k-m",
  "lfm2.5-1.2b-instruct-q4-k-m",
  "ministral-3-8b-instruct-2512-q4-k-m",
];

test("the downloadable LLM catalog contains exactly the seven candidates", () => {
  const actualIds = [...source.matchAll(/^    id: "([^"]+)",$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(actualIds, expectedIds);
});

test("each LLM candidate uses a verified Q4_K_M GGUF download", () => {
  assert.equal((source.match(/quantization: "Q4_K_M"/g) ?? []).length, 7);
  assert.equal((source.match(/\.gguf\?download=true"/g) ?? []).length, 7);
});
