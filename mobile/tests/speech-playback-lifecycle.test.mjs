import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicePath = new URL("../src/services/speech-playback-service.ts", import.meta.url);
const sharedLlmPath = new URL("../src/services/shared-llm-context-service.ts", import.meta.url);
const buttonPath = new URL("../src/components/speech-playback-button.tsx", import.meta.url);
const notePath = new URL("../src/app/notes/[noteId].tsx", import.meta.url);

test("LLM and TTS runtimes remain cached across alternating inference", async () => {
  const [speechSource, sharedLlmSource, noteSource] = await Promise.all([
    readFile(servicePath, "utf8"),
    readFile(sharedLlmPath, "utf8"),
    readFile(notePath, "utf8"),
  ]);

  assert.match(sharedLlmSource, /"core-insights", "tts"/);
  assert.match(speechSource, /if \(this\.cachedEngine && this\.cachedEngineKey === key\) return/);
  assert.match(speechSource, /if \(engine !== this\.cachedEngine\) await engine\.destroy/);
  assert.match(noteSource, /coreNoteInsightService\.ensureReady\(\)/);
  assert.doesNotMatch(noteSource, /speechPlaybackService\.ensureReady\(\)/);
});

test("speech playback uses cancellable streaming TTS with serialized lifecycle", async () => {
  const source = await readFile(servicePath, "utf8");

  assert.match(source, /createStreamingTTS/);
  assert.match(source, /generateSpeechStream/);
  assert.match(source, /pcmPlayback\.write/);
  assert.match(source, /cancelSpeechStream/);
  assert.match(source, /pcmPlayback\.stopImmediately/);
  assert.doesNotMatch(source, /engine\.startPcmPlayer/);
  assert.doesNotMatch(source, /engine\.writePcmChunk/);
  assert.match(source, /engine\.destroy\(\)/);
  assert.match(source, /lifecycleChain/);
  assert.match(source, /uiDetachedTaskIds/);
  assert.match(source, /isInferenceBlockingSpeechUi/);
  assert.match(source, /tts-service-task-returned/);
  assert.match(source, /native-onEnd-fired/);
  assert.match(source, /queued-pcm-writes-drained/);
  assert.match(source, /interruptPromise/);
  assert.match(source, /session\.interruptPromise \?\? this\.interruptEngine\(engine\)/);
  assert.match(source, /if \(session\.streamStarted\) await session\.streamEnded/);
  assert.match(source, /session\.resolveStreamEnded\(\)/);
  assert.match(source, /if \(!this\.isCurrent\(session\)\) session\.interruptPromise = this\.interruptEngine\(engine\)/);
  assert.doesNotMatch(source, /createTTS\(/);
  assert.doesNotMatch(source, /public async pause/);
  assert.doesNotMatch(source, /public async resume/);
});

test("stopped TTS cleanup does not keep playback UI busy and replay is scheduler queued", async () => {
  const source = await readFile(servicePath, "utf8");

  assert.match(source, /this\.uiDetachedTaskIds\.add\(session\.task\.id\)/);
  assert.match(source, /inferenceBusy: this\.isInferenceBlockingSpeechUi\(\)/);
  assert.match(source, /const task = this\.coordinator\.schedule\("tts"/);
});

test("speech button only exposes start and stop semantics", async () => {
  const source = await readFile(buttonPath, "utf8");

  assert.match(source, /"Stop"/);
  assert.match(source, /"Read aloud"/);
  assert.doesNotMatch(source, /"Pause"/);
  assert.doesNotMatch(source, /"Resume"/);
});

test("leaving note detail stops the global TTS session", async () => {
  const source = await readFile(notePath, "utf8");

  assert.match(source, /useEffect\(\(\) => \(\) => \{/);
  assert.match(source, /speechPlaybackService\.stop\(\)/);
});
