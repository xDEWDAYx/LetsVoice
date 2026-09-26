import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const categories = await import("../src/constants/note-categories.ts");
const recurrence = await import("../src/services/task-recurrence.ts");

test("automatic category output accepts exactly one fixed category", () => {
  assert.equal(categories.parseCategory("meeting"), "meeting");
  assert.equal(categories.parseCategory("The category is IDEA."), "idea");
  assert.equal(categories.parseCategory("meeting or personal"), null);
  assert.equal(categories.parseCategory("uncategorized"), null);
});

test("English and Chinese recurrence phrases receive deterministic first dates", () => {
  const reference = new Date("2026-08-20T12:00:00+01:00");
  const annotated = recurrence.annotateTaskRecurrences(
    "每天检查消息，每周五发周报, every other week review metrics, and each Monday call Sam.",
    reference,
  );

  assert.match(annotated, /每天\(2026-08-20, REPEAT=daily\)/);
  assert.match(annotated, /每周五\(2026-08-21, REPEAT=weekly\)/);
  assert.match(annotated, /every other week\(2026-08-24, REPEAT=biweekly\)/i);
  assert.match(annotated, /each Monday\(2026-08-24, REPEAT=weekly\)/i);
  assert.equal(recurrence.annotateTaskRecurrences(annotated, reference), annotated);
});

test("traditional Chinese recurrence and absent monthly days stay grounded", () => {
  const reference = new Date("2026-02-01T12:00:00Z");
  const annotated = recurrence.annotateTaskRecurrences(
    "每個月31號核對帳目，每週三提交摘要。",
    reference,
  );

  assert.match(annotated, /每個月31號\(2026-03-31, REPEAT=monthly\)/);
  assert.match(annotated, /每週三\(2026-02-04, REPEAT=weekly\)/);
  assert.deepEqual(
    recurrence.extractTaskRecurrenceEvidence(annotated),
    { phrase: "每個月31號", firstDate: "2026-03-31", kind: "monthly" },
  );
});

test("rolling recurrence skips missed dates and nonexistent monthly days", () => {
  const monthly = new Date(recurrence.nextRecurringDate(
    "2026-01-31T09:00:00.000Z",
    "monthly",
    "2026-02-01T10:00:00.000Z",
    "31",
  ));
  assert.deepEqual(
    [monthly.getFullYear(), monthly.getMonth() + 1, monthly.getDate(), monthly.getHours()],
    [2026, 3, 31, 9],
  );
  assert.equal(
    recurrence.nextRecurringDate(
      "2026-08-21T09:00:00.000Z",
      "weekdays",
      "2026-08-21T17:00:00.000Z",
      null,
    ),
    "2026-08-24T09:00:00.000Z",
  );
  assert.equal(
    recurrence.nextRecurringDate(
      "2026-08-20T09:00:00.000Z",
      "daily",
      "2026-08-23T17:00:00.000Z",
      null,
    ),
    "2026-08-24T09:00:00.000Z",
  );
});

test("iOS parity storage keeps four Trash types and immutable Knowledge history", async () => {
  const [migration, trashService, knowledgeRepository, fuzzySearch] = await Promise.all([
    readFile(new URL("../src/database/migrations/ios-parity-schema-migration.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/trash-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/repositories/knowledge-document-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/note-fuzzy-search.ts", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS knowledge_results/);
  assert.match(migration, /ALTER TABLE core_note_tasks ADD COLUMN recurrence_kind/);
  assert.match(trashService, /\["note", "workspace", "conversation", "template"\]/);
  assert.match(trashService, /withExclusiveTransactionAsync/);
  assert.match(knowledgeRepository, /INSERT INTO knowledge_results/);
  assert.doesNotMatch(knowledgeRepository, /ON CONFLICT/);
  assert.match(fuzzySearch, /boundedEditDistance/);
  assert.doesNotMatch(fuzzySearch, /embedding|vector/iu);
});

test("Trash undo refreshes the visible collection after restoring data", async () => {
  const [templatesScreen, searchScreen, workspaceScreen] = await Promise.all([
    readFile(new URL("../src/app/(tabs)/ai/knowledge-templates.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/notes/search.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/workspaces/[workspaceId]/index.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(templatesScreen, /undo: async \(\) => \{[\s\S]*?restore\("template"[\s\S]*?await load\(\)/);
  assert.match(templatesScreen, /useFocusEffect\(useCallback\(\(\) => \{[\s\S]*?void load\(\);[\s\S]*?\}, \[load\]\)\)/);
  assert.match(searchScreen, /undo: async \(\) => \{[\s\S]*?restoreNotes\(ids\)[\s\S]*?searchNoteResults/);
  assert.match(workspaceScreen, /undo: async \(\) => \{[\s\S]*?restoreNotes\(ids\)[\s\S]*?await loadWorkspace\(\)/);
});

test("background note classification publishes its saved category to mounted screens", async () => {
  const [classificationService, noteService, workspaceScreen, homeScreen] = await Promise.all([
    readFile(new URL("../src/services/note-classification-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/note-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/workspaces/[workspaceId]/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(tabs)/index.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(classificationService, /if \(saved\) this\.publish\(\{ noteId, category \}\)/);
  assert.match(noteService, /subscribeToCategoryChanges/);
  assert.match(workspaceScreen, /subscribeToCategoryChanges/);
  assert.match(homeScreen, /subscribeToCategoryChanges/);
});

test("a newly generated Knowledge result collapses the previously newest result", async () => {
  const noteDetail = await readFile(new URL("../src/app/notes/[noteId].tsx", import.meta.url), "utf8");

  assert.match(noteDetail, /initiallyExpanded=\{index === 0 \|\| document\.getId\(\) === knowledgeResultId\}/);
  assert.match(noteDetail, /useEffect\(\(\) => setExpanded\(initiallyExpanded\), \[initiallyExpanded\]\)/);
});

test("Knowledge generation caps section size, uses compact output, and records actionable timing", async () => {
  const service = await readFile(new URL("../src/services/knowledge-service.ts", import.meta.url), "utf8");

  assert.match(service, /const MAX_PREDICTED_TOKENS = 1280/);
  assert.match(service, /const RECOVERY_PREDICTED_TOKENS = 1792/);
  assert.match(service, /const MAX_SECTION_ITEMS = 6/);
  assert.match(service, /slice\(0, MAX_SECTION_ITEMS\)/);
  assert.match(service, /Prefer 2 to 5 items for an ordinary supported section/);
  assert.doesNotMatch(service, /There is no fixed item count/);
  assert.match(service, /publishStreamingPreview/);
  assert.match(service, /sameKnowledgeSections/);
  for (const metric of ["queueWaitMs", "contextPrepareMs", "promptTokens", "timeToFirstTokenMs", "timeToFirstVisibleContentMs", "generationMs", "tokensPredicted", "tokensPerSecond"]) {
    assert.match(service, new RegExp(metric));
  }
});

test("Knowledge generation uses plain JSON with runtime validation", async () => {
  const service = await readFile(new URL("../src/services/knowledge-service.ts", import.meta.url), "utf8");

  assert.match(service, /const KNOWLEDGE_JSON_MODE = "plain" as const/);
  assert.doesNotMatch(service, /EXPO_PUBLIC_KNOWLEDGE_JSON_MODE/);
  assert.doesNotMatch(service, /response_format|json_schema/);
  assert.match(service, /JSON\.parse/);
  assert.match(service, /Model omitted required section arrays/);
  assert.match(service, /jsonMode: KNOWLEDGE_JSON_MODE/);
});

test("the redundant floating Ask AI control does not cover note-detail actions", async () => {
  const floatingButton = await readFile(new URL("../src/components/floating-ask-ai-button.tsx", import.meta.url), "utf8");

  assert.match(floatingButton, /pathname\.startsWith\("\/notes\/"\) && pathname !== "\/notes\/search"/);
});
