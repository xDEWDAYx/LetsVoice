import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogPath = new URL("../src/constants/stt-model-catalog.ts", import.meta.url);
const servicePath = new URL("../src/services/transcription-service.ts", import.meta.url);
const selectorPath = new URL(
  "../src/services/transcription-language.ts",
  import.meta.url,
);

test("the catalog identifies multilingual Whisper and English-only Parakeet", async () => {
  const [catalog, selector] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(selectorPath, "utf8"),
  ]);

  assert.match(catalog, /languageLabel: "Multilingual"/);
  assert.match(catalog, /recommendedForChinese: id === "small"/);
  assert.match(catalog, /English-only NVIDIA Parakeet/);
  assert.match(catalog, /languageLabel: "English only"/);
  assert.match(selector, /\{ code: "zh", label: "中文" \}/);
});

test("live Chinese Whisper transcription uses a longer phrase window", async () => {
  const source = await readFile(servicePath, "utf8");
  assert.match(source, /audioSliceSec: isWhisper \? 12 : 8/);
  assert.match(source, /audioMinSec: isWhisper \? 1\.2 : 0\.8/);
  assert.match(source, /requestedLanguage !== "en"/);
  assert.match(source, /retryEmptyTranscript/);
  assert.match(source, /registerIdleCleanup\(\s*"stt-runtime"/s);
});
