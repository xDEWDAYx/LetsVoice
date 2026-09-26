import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateImportedAudio } from "../src/domain/audio-import/audio-import.ts";

test("BlueStacks extensionless M4A display names are accepted by MIME type", () => {
  assert.equal(validateImportedAudio("錄製", 222_090, "audio/mp4"), null);
  assert.equal(validateImportedAudio("Recording", 222_090, "audio/x-m4a"), null);
  assert.equal(
    validateImportedAudio("Recording", 222_090, "audio/mp4; codecs=mp4a.40.2"),
    null,
  );
});

test("known extensions still work when a provider omits or mislabels MIME type", () => {
  assert.equal(validateImportedAudio("meeting.M4A", 1_024, null), null);
  assert.equal(
    validateImportedAudio("meeting.wav", 1_024, "application/octet-stream"),
    null,
  );
});

test("unsupported files remain rejected", () => {
  assert.match(
    validateImportedAudio("notes", 1_024, "application/octet-stream") ?? "",
    /Choose a WAV/,
  );
  assert.match(
    validateImportedAudio("voice.ogg", 1_024, "audio/ogg") ?? "",
    /Choose a WAV/,
  );
});

test("the audio picker passes the provider MIME type into validation", async () => {
  const screen = await readFile(
    new URL("../src/app/audio-transcription.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    screen,
    /validateImportedAudio\(\s*asset\.name,\s*sizeBytes,\s*asset\.mimeType,?\s*\)/s,
  );
});

test("imported-audio preparation and transcription show an animated progress indicator", async () => {
  const screen = await readFile(
    new URL("../src/app/audio-transcription.tsx", import.meta.url),
    "utf8",
  );

  assert.match(screen, /import \{ ActivityIndicator,/);
  assert.match(screen, /\{busy && \([\s\S]*?<ActivityIndicator/);
  assert.match(screen, /accessibilityLiveRegion="polite"/);
});
