import assert from "node:assert/strict";
import test from "node:test";

const noteTitle = await import("../src/services/note-title.ts");

test("mobile note-title prompt stays aligned with the desktop Studio prompt", () => {
  assert.equal(
    noteTitle.NOTE_TITLE_SYSTEM_PROMPT,
    "You are a note title assistant. Based on the user's recording, generate a short title summarizing the topic. Output ONLY the title itself: no quotes, no trailing punctuation, no explanations or prefixes. Use the same language as the content; under 20 characters for Chinese, under 8 words for English.",
  );
  assert.equal(noteTitle.NOTE_TITLE_SOURCE_LIMIT, 2_000);
});

test("generated note titles use the desktop cleanup rules", () => {
  assert.equal(noteTitle.sanitizeGeneratedNoteTitle('  “九月项目会议。”\nExplanation'), "九月项目会议");
  assert.equal(noteTitle.sanitizeGeneratedNoteTitle("'Weekly planning! '"), "Weekly planning");
  assert.equal(noteTitle.sanitizeGeneratedNoteTitle("   "), "");
  assert.equal(noteTitle.sanitizeGeneratedNoteTitle("a".repeat(100)).length, 80);
});

test("recordings always receive a usable timestamp fallback title", () => {
  assert.equal(
    noteTitle.createDefaultNoteTitle(new Date(2026, 7, 27, 14, 5)),
    "Recording 27/08/2026, 14:05",
  );
});
