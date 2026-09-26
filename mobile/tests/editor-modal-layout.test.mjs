import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const blockingModalScreens = [
  "../src/app/workspaces/index.tsx",
  "../src/app/workspaces/[workspaceId]/index.tsx",
  "../src/app/transcription.tsx",
  "../src/app/audio-transcription.tsx",
  "../src/app/notes/[noteId].tsx",
  "../src/app/ask-ai.tsx",
];

test("all blocking dialogs use the shared safe-area modal", async () => {
  const sources = await Promise.all(
    blockingModalScreens.map(async (path) => [path, await readFile(new URL(path, import.meta.url), "utf8")]),
  );

  for (const [path, source] of sources) {
    assert.match(source, /<SafeAreaModal/, `${path} must use SafeAreaModal`);
    const firstModal = source.indexOf("<SafeAreaModal");
    assert.doesNotMatch(
      source.slice(firstModal),
      /\bautoFocus\b/,
      `${path} modal must open without forcing the keyboard`,
    );
  }
});

test("the shared modal centers every iOS overlay in the safe area and scrolls internally", async () => {
  const source = await readFile(
    new URL("../src/components/safe-area-modal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Platform\.OS === "ios" \|\| androidPresentation === "center"/);
  assert.match(source, /behavior=\{Platform\.OS === "ios" \? "padding"/);
  assert.match(source, /contentInsetAdjustmentBehavior="never"/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /paddingTop: Spacing\.lg \+ insets\.top/);
  assert.match(source, /paddingBottom: Spacing\.lg \+ insets\.bottom/);
  assert.match(source, /animationType="fade"/);
  assert.doesNotMatch(source, /animationType="slide"/);
});

test("custom modal backdrops use the same guarded close path as system dismissal", async () => {
  const [modalSource, closeButtonSource, recordingSource] = await Promise.all([
    readFile(new URL("../src/components/safe-area-modal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/modal-close-button.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/transcription.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(modalSource, /dismissOnBackdropPress = true/);
  assert.match(modalSource, /dismissDisabled = false/);
  assert.match(modalSource, /onRequestClose=\{requestClose\}/);
  assert.match(modalSource, /disabled=\{!dismissOnBackdropPress \|\| dismissDisabled\}/);
  assert.match(modalSource, /onPress=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(closeButtonSource, /height: 44/);
  assert.match(closeButtonSource, /width: 44/);
  assert.match(closeButtonSource, /accessibilityLabel=\{label\}/);
  assert.match(recordingSource, /dismissDisabled=\{isSaving\}/);
  assert.match(recordingSource, /onRequestClose=\{confirmDiscardFinishedSession\}/);
});

test("raw React Native Modal is confined to the safe-area modal component", async () => {
  const roots = [
    new URL("../src/app/", import.meta.url),
    new URL("../src/components/", import.meta.url),
  ];
  const allowedUrl = new URL("../src/components/safe-area-modal.tsx", import.meta.url);
  const allowedPath = decodeURIComponent(allowedUrl.pathname);

  async function collectTsxFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) return collectTsxFiles(url);
      return entry.name.endsWith(".tsx") ? [url] : [];
    }));
    return nested.flat();
  }

  const files = (await Promise.all(roots.map(collectTsxFiles))).flat();
  for (const file of files) {
    const path = decodeURIComponent(file.pathname);
    if (path === allowedPath) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /(?:<Modal\b|\bModal\s*,|,\s*Modal\b)/, `${path} bypasses SafeAreaModal`);
  }
});

test("move note and Ask AI pickers are centered by the shared iOS rule", async () => {
  const [noteSource, askAiSource] = await Promise.all([
    readFile(new URL("../src/app/notes/[noteId].tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/ask-ai.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(noteSource, /<SafeAreaModal[^>]*visible=\{actionModal === "move"\}/);
  assert.match(askAiSource, /<SafeAreaModal[^>]*visible=\{pickerVisible\}/);
  assert.match(askAiSource, /<SafeAreaModal[^>]*visible=\{historyVisible\}/);
  assert.match(askAiSource, /const \[historyBusy, setHistoryBusy\] = useState/);
  assert.match(askAiSource, /dismissDisabled=\{isBusy \|\| isHistoryBusy\}[\s\S]*visible=\{historyVisible\}/);
  assert.match(askAiSource, /accessibilityRole="progressbar"[\s\S]*Loading history…/);
});
