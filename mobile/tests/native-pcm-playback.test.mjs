import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("iOS Stop synchronously stops and resets the owned AVAudioPlayerNode", async () => {
  const source = await read("../modules/speech-pcm-player/ios/SpeechPcmPlayerModule.swift");
  assert.match(source, /Function\("stop"\)/);
  assert.match(source, /sessionId = nil/);
  assert.match(source, /oldPlayer\?\.stop\(\)/);
  assert.match(source, /oldPlayer\?\.reset\(\)/);
  assert.match(source, /oldEngine\?\.stop\(\)/);
  assert.match(source, /oldEngine\?\.reset\(\)/);
  assert.match(source, /self\.sessionId == sessionId/);
  assert.match(source, /AVAudioSession\.sharedInstance\(\)\.setActive\(true\)/);
});

test("Android Stop synchronously flushes and releases the owned AudioTrack", async () => {
  const source = await read("../modules/speech-pcm-player/android/src/main/java/expo/modules/speechpcmplayer/SpeechPcmPlayerModule.kt");
  assert.match(source, /Function\("stop"\)/);
  assert.match(source, /sessionId = null/);
  assert.match(source, /it\.pause\(\)/);
  assert.match(source, /it\.flush\(\)/);
  assert.match(source, /it\.stop\(\)/);
  assert.match(source, /it\.release\(\)/);
  assert.match(source, /sessionId != expectedSessionId/);
  assert.match(source, /if \(written < 0\)/);
  assert.match(source, /offset \+= written/);
  assert.match(source, /catch \(error: Throwable\)/);
  assert.match(source, /nextTrack\.release\(\)/);
});

test("speech playback is independent from Sherpa's built-in PCM player", async () => {
  const source = await read("../src/services/speech-playback-service.ts");
  assert.match(source, /pcmPlayback\.stopImmediately\(\)/);
  assert.match(source, /engine\.cancelSpeechStream\(\)/);
  assert.doesNotMatch(source, /engine\.stopPcmPlayer\(\)/);
  assert.doesNotMatch(source, /engine\.writePcmChunk\(samples\)/);
});
