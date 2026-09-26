import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const javaPath = new URL(
  "../node_modules/@fugood/react-native-audio-pcm-stream/android/src/main/java/com/imxiqi/rnliveaudiostream/RNLiveAudioStreamModule.java",
  import.meta.url,
);
const patchPath = new URL(
  "../scripts/patch-audio-pcm-stream-lifecycle.mjs",
  import.meta.url,
);
const adapterPath = new URL(
  "../node_modules/whisper.rn/src/realtime-transcription/adapters/AudioPcmStreamAdapter.ts",
  import.meta.url,
);

test("Android PCM capture waits for AudioRecord teardown before stop resolves", async () => {
  const [source, patch] = await Promise.all([
    readFile(javaPath, "utf8"),
    readFile(patchPath, "utf8"),
  ]);

  for (const value of [source, patch]) {
    assert.match(value, /private volatile boolean isRecording/);
    assert.match(value, /private Thread recordingThread/);
    assert.match(value, /public synchronized void stop\(Promise promise\)/);
    assert.match(value, /pendingStop\.resolve\(null\)/);
  }
});

test("Android PCM capture releases a recorder that fails initialization", async () => {
  const [source, patch] = await Promise.all([
    readFile(javaPath, "utf8"),
    readFile(patchPath, "utf8"),
  ]);

  for (const value of [source, patch]) {
    assert.match(value, /AudioRecord failedRecorder = recorder/);
    assert.match(value, /failedRecorder\.release\(\)/);
  }
});

test("Android PCM capture emits only the bytes returned by AudioRecord.read", async () => {
  const source = await readFile(javaPath, "utf8");

  assert.match(
    source,
    /Base64\.encodeToString\(\s*buffer,\s*offset,\s*outputBytes,\s*Base64\.NO_WRAP\s*\)/s,
  );
  assert.doesNotMatch(
    source,
    /Base64\.encodeToString\(buffer, Base64\.NO_WRAP\)/,
  );
});

test("Android PCM capture drops milliseconds instead of whole buffers", async () => {
  const [source, patch] = await Promise.all([
    readFile(javaPath, "utf8"),
    readFile(patchPath, "utf8"),
  ]);

  for (const value of [source, patch]) {
    assert.match(value, /bytesToSkip[^\n]+\* 40 \/ 1000/);
  }
  assert.doesNotMatch(source, /\+\+count > 2/);
});

test("Whisper waits for native recorder initialization and start", async () => {
  const [adapter, patch] = await Promise.all([
    readFile(adapterPath, "utf8"),
    readFile(patchPath, "utf8"),
  ]);

  for (const value of [adapter, patch]) {
    assert.match(value, /await LiveAudioStream\.init\(\{/);
    assert.match(value, /await LiveAudioStream\.start\(\)/);
  }
});
