import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../src/app/transcription.tsx", import.meta.url);
const servicePath = new URL("../src/services/transcription-service.ts", import.meta.url);
const editorModalPath = new URL(
  "../src/components/safe-area-modal.tsx",
  import.meta.url,
);

test("finish waits for the final queued transcription before stopping", async () => {
  const source = await readFile(servicePath, "utf8");
  const finishStart = source.indexOf("public async finish()");
  const finishEnd = source.indexOf("public async discard()", finishStart);
  const finish = source.slice(finishStart, finishEnd);

  const stopAudio = finish.indexOf("await this.audioStream?.stop()");
  const queueFinalSlice = finish.indexOf("await this.transcriber.nextSlice()");
  const waitForResult = finish.indexOf(
    "await this.waitForPendingTranscriptions(this.transcriber)",
  );
  const stopTranscriber = finish.indexOf("await this.transcriber.stop()");

  assert.ok(finishStart >= 0 && finishEnd > finishStart);
  assert.ok(stopAudio >= 0 && stopAudio < queueFinalSlice);
  assert.ok(queueFinalSlice < waitForResult);
  assert.ok(waitForResult < stopTranscriber);
  assert.match(source, /await processingPromise/);
});

test("short Whisper recordings replace redundant snapshots with one final pass", async () => {
  const source = await readFile(servicePath, "utf8");

  assert.match(source, /MAX_COMBINED_FINAL_AUDIO_MS = 45 \* 1000/);
  assert.match(source, /this\.collectRetainedAudio\(this\.transcriber\)/);
  assert.match(source, /await this\.cancelPendingTranscriptions\(this\.transcriber\)/);
  assert.match(source, /combinedAudio\.buffer as ArrayBuffer/);
  assert.match(source, /const previewText = this\.getTranscript\(\)/);
  assert.match(source, /finalText\.length > 0 \|\| previewText\.length === 0/);
  assert.match(source, /retainedPreview:/);
});

test("a live session keeps its original model through finalization", async () => {
  const source = await readFile(servicePath, "utf8");

  assert.match(source, /this\.sessionModel = model/);
  assert.match(source, /const activeModel = this\.sessionModel/);
  assert.match(source, /this\.sessionModel = null/);
});

test("empty live transcription cannot enter an unsavable modal", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /result\.transcript\.trim\(\)\.length === 0/);
  assert.match(source, /No speech detected/);
  assert.match(source, /Discard recording/);
});

test("Finish opens the save modal directly without a redundant confirmation", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /const result = await transcriptionService\.finish\(\);[\s\S]*void prepareSave\(result\);/);
  assert.doesNotMatch(source, /Finish transcription\?/);
  assert.doesNotMatch(source, /text: "Save", onPress: \(\) => void prepareSave\(result\)/);
});

test("finished transcription modal exposes a confirmed discard exit", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /onRequestClose=\{confirmDiscardFinishedSession\}/);
  assert.match(source, /<ModalCloseButton[\s\S]*label="Close save transcription"[\s\S]*onPress=\{confirmDiscardFinishedSession\}/);
  assert.doesNotMatch(source, />Discard<\/Text>/);
  assert.match(source, /This permanently deletes the finished recording and transcript/);
});

test("finished transcription receives a local automatic title without overwriting edits", async () => {
  const [source, container] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(new URL("../src/application/app-container.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /createDefaultNoteTitle\(\)/);
  assert.match(source, /noteTitleGenerationService\.generate\(result\.transcript\)/);
  assert.match(source, /noteNameEditedRef\.current/);
  assert.match(source, /Generating a title locally/);
  assert.match(container, /new NoteTitleGenerationService\(/);
});

test("finished transcription modal centers its card inside the safe area", async () => {
  const [source, editorModal] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(editorModalPath, "utf8"),
  ]);

  assert.match(source, /<SafeAreaModal[\s\S]*androidPresentation="center"/);
  assert.doesNotMatch(source, /autoFocus/);
  assert.match(editorModal, /paddingTop: Spacing\.lg \+ insets\.top/);
  assert.match(editorModal, /paddingBottom: Spacing\.lg \+ insets\.bottom/);
  assert.match(editorModal, /centeredDismissArea:[\s\S]*justifyContent: "center"/);
  assert.match(editorModal, /accessibilityViewIsModal/);
});
