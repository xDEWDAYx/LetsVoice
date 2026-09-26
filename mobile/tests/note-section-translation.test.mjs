import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("note detail exposes independent persisted translation controls", async () => {
  const screen = await read("src/app/notes/[noteId].tsx");
  const domain = await read("src/domain/note-translation/note-translation.ts");
  const service = await read("src/services/note-translation-service.ts");

  for (const section of ["transcript", "insights", "knowledge"]) {
    assert.ok(screen.includes(`section="${section}"`), `missing ${section} translation control`);
  }
  assert.match(domain, /activeSections: NoteTranslationSection\[\]/);
  assert.match(service, /restoreOriginal\(noteId: string, section: NoteTranslationSection\)/);
  assert.match(service, /collectStrings\(section: NoteTranslationSection/);
  assert.match(service, /if \(this\.activePromise\)/);
  assert.match(service, /return this\.activePromise/);
  assert.match(screen, /noteTranslationService\.subscribe/);
  assert.match(service, /partialPayload:/);
  assert.match(service, /data\.accumulated_text/);
  assert.match(service, /translationTokenBudget/);
  assert.match(service, /sharedContext\.activateCache/);
  assert.match(service, /sharedContext\.prepare/);
  assert.match(service, /First token received/);
  assert.match(screen, /First token rendered/);
  assert.match(service, /promptPrefillMs/);
  assert.doesNotMatch(service, /response_format|json_schema|parseTranslation|batchStructured|retry|fallback/i);
  assert.match(screen, /livePayload/);
  assert.match(screen, /knowledgeTranslationVisible = liveSection === "knowledge" \|\| knowledgeTranslated/);
  assert.match(screen, /knowledgeTranslationVisible && displayKnowledge/);
  assert.doesNotMatch(screen, /Translate all/);
});

test("translation UI copy is centralized and remains English-only", async () => {
  const screen = await read("src/app/notes/[noteId].tsx");
  const copy = await read("src/localization/note-translation-copy.ts");

  assert.match(screen, /useNoteTranslationCopy\(\)/);
  assert.doesNotMatch(screen, /Restore original|Translating…|Translate into/);
  assert.match(copy, /en: \{/);
  assert.doesNotMatch(copy, /"zh-CN":|\bes: \{|\bfr: \{|\bde: \{|\bja: \{|\bko: \{|\bpt: \{/);
});
