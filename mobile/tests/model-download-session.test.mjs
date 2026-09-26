import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MODEL_DOWNLOAD_SERVICES = [
  "src/services/stt-model-service.ts",
  "src/services/llm-model-service.ts",
  "src/services/tts-model-service.ts",
];

for (const relativePath of MODEL_DOWNLOAD_SERVICES) {
  test(`${relativePath} keeps model downloads in the foreground`, async () => {
    const source = await readFile(
      new URL(`../${relativePath}`, import.meta.url),
      "utf8",
    );

    assert.match(source, /File\.createDownloadTask\(/);
    assert.match(
      source,
      /sessionType:\s*["']foreground["']/,
      "Expo iOS download tasks default to a background URL session. Model downloads must explicitly use the foreground session.",
    );
  });
}

test("TTS keeps sherpa-onnx validation and extraction after the foreground download", async () => {
  const source = await readFile(
    new URL("../src/services/tts-model-service.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /extractModelByCategory\(/);
  assert.match(source, /detectTtsModel\(/);
  assert.doesNotMatch(
    source,
    /ensureModelByCategory\(/,
    "ensureModelByCategory uses the dependency's background downloader and must not own the TTS network transfer.",
  );
});
