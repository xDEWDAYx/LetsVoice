import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Android TTS teardown waits for streaming inference before releasing the engine", async () => {
  const patcher = await readFile(
    new URL("../scripts/patch-sherpa-tts-stream-lifetime.mjs", import.meta.url),
    "utf8",
  );

  assert.match(patcher, /ttsStreamCancelled\.set\(true\)/);
  assert.match(patcher, /streamThread\.join\(5000\)/);
  assert.match(patcher, /streamThread\?\.isAlive == true/);
  assert.match(patcher, /inst\.releaseEngines\(\)/);
});
