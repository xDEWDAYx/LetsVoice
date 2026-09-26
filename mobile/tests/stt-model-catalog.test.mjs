import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/constants/stt-model-catalog.ts", import.meta.url),
  "utf8",
);

const expectedIds = [
  "tiny", "tiny-q5_1", "tiny-q8_0", "base", "base-q5_1", "base-q8_0",
  "small", "small-q5_1", "small-q8_0", "medium", "medium-q5_0",
  "medium-q8_0", "large-v3", "large-v3-q5_0", "large-v3-turbo",
  "large-v3-turbo-q5_0", "large-v3-turbo-q8_0",
  "parakeet-tdt-0.6b-v3-f32", "parakeet-tdt-0.6b-v3-f16",
  "parakeet-tdt-0.6b-v3-q8_0", "parakeet-tdt-0.6b-v3-q4_0",
  "parakeet-tdt-0.6b-v3-q4_k",
];

test("the downloadable STT catalog contains exactly the 22 supported candidates", () => {
  const actualIds = [...source.matchAll(/^  \["([^"]+)", [\d_]+\],$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(actualIds, expectedIds);
});
