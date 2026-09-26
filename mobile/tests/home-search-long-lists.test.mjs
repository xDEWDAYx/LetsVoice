import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Library search covers related local content without per-note database queries", async () => {
  const [libraryNotes, repository, fuzzySearch, noteService, database, searchIndexes, appContainer, trashService, noteSearchScreen, noteDetail, noteCard] = await Promise.all([
    readFile(new URL("../src/components/library-notes-pane.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/repositories/note-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/note-fuzzy-search.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/note-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/database/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/database/migrations/note-search-index-migration.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/application/app-container.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/trash-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/notes/search.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/notes/[noteId].tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/note-card.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(libraryNotes, /accessibilityLabel="Search notes and related content"/);
  assert.match(libraryNotes, /searchNoteResourceResults\(normalized\)/);
  assert.match(libraryNotes, /NOTE_RESULT_BATCH_SIZE = 20/);
  assert.match(libraryNotes, /visibleNoteResults\.slice\(0, noteResultLimit\)/);
  assert.match(libraryNotes, /coreNoteInsightService\.subscribeToChanges/);
  assert.match(libraryNotes, /knowledgeService\.subscribeToChanges/);
  assert.match(libraryNotes, /aiConversationService\.subscribeToChanges/);
  assert.match(repository, /conversation_contexts cc/);
  assert.match(repository, /group_concat\(m\.content/);
  assert.match(repository, /core_note_tasks WHERE insight_id = i\.id/);
  assert.match(repository, /core_note_action_items WHERE insight_id = i\.id/);
  assert.doesNotMatch(repository, /core_note_(?:tasks|action_items) WHERE source_note_id = n\.id/);
  assert.match(database, /DatabaseConfig\("speakspace\.db", 13\)/);
  assert.match(database, /new NoteSearchIndexMigration\(\)/);
  assert.match(searchIndexes, /idx_core_note_key_points_insight_id/);
  assert.match(searchIndexes, /idx_ai_messages_conversation_id/);
  assert.doesNotMatch(repository, /notes\.map\(async/);
  assert.match(fuzzySearch, /export function searchNoteResourceCorpus/);
  assert.match(fuzzySearch, /text: markdownToPlainText\(conversation\.text\)/);
  assert.match(fuzzySearch, /conversationId: field\.conversationId/);
  assert.match(fuzzySearch, /export function noteSearchDestinationKey/);
  assert.match(fuzzySearch, /if \(result\.conversationId\) return `conversation:/);
  assert.match(fuzzySearch, /if \(result\.knowledgeResultId\) return `knowledge:/);
  assert.match(fuzzySearch, /result\.insightSection \?\? "summary"/);
  assert.match(fuzzySearch, /export function uniqueNoteSearchDestinations/);
  assert.match(libraryNotes, /uniqueNoteSearchDestinations\(\s*noteSearch\.results\.filter/);
  assert.match(libraryNotes, /insightSection: result\.match\?\.insightSection/);
  assert.match(repository, /AS summary[\s\S]*?AS key_points[\s\S]*?AS tasks[\s\S]*?AS action_items/);
  assert.match(repository, /\{ section: "tasks", text: \[row\.tasks, row\.action_items\]/);
  assert.match(repository, /SELECT cc\.note_id, c\.id, c\.name/);
  assert.match(noteDetail, /initialSection=\{requestedInsightSection\}/);
  assert.match(noteDetail, /useState<InsightSectionKey>\(initialSection\)/);
  assert.match(noteCard, /match\.resourceTitle \? `\$\{match\.source\} · \$\{match\.resourceTitle\}`/);
  assert.match(noteService, /private searchCorpus: NoteSearchCorpus\[\] \| null/);
  assert.match(noteService, /public invalidateSearchIndex\(\)/);
  assert.match(noteService, /if \(this\.searchCorpusLoad\) return this\.searchCorpusLoad/);
  assert.match(noteService, /public notifyExternalContentChange\(\)/);
  assert.match(appContainer, /coreNoteInsightService\.subscribeToChanges\(invalidateNoteSearch\)/);
  assert.match(appContainer, /knowledgeService\.subscribeToChanges\(invalidateNoteSearch\)/);
  assert.match(appContainer, /aiConversationService\.subscribeToChanges\(invalidateNoteSearch\)/);
  assert.match(trashService, /this\.onSearchContentChanged\(\)/);
  assert.match(noteSearchScreen, /useFocusEffect/);
  assert.match(noteSearchScreen, /searchRevision/);
  assert.match(noteSearchScreen, /insightSection: result\.insightSection/);
});

test("speech playback exposes active state and a 44-point TTS recovery target", async () => {
  const speechPlayback = await readFile(
    new URL("../src/components/speech-playback-button.tsx", import.meta.url),
    "utf8",
  );

  assert.match(speechPlayback, /accessibilityState=\{\{ busy: isPreparing, disabled, selected: isPlaying \}\}/);
  assert.match(speechPlayback, /accessibilityLabel="Open Text-to-Speech Models"/);
  assert.match(speechPlayback, /modelsButton: \{[^}]*minHeight: 44/);
});

test("the live recording save modal filters and bounds workspace choices", async () => {
  const transcription = await readFile(
    new URL("../src/app/transcription.tsx", import.meta.url),
    "utf8",
  );

  assert.match(transcription, /accessibilityLabel="Search workspaces"/);
  assert.match(transcription, /filteredWorkspaces\.length === 0/);
  assert.match(transcription, /accessibilityRole="radio"/);
  assert.match(transcription, /workspaceListScroll: \{ maxHeight: 260 \}/);
  assert.match(transcription, /keyboardShouldPersistTaps="handled"/);
  assert.match(transcription, /const selectedWorkspaceVisible = filteredWorkspaces\.some/);
  assert.match(transcription, /disabled=\{isSaving \|\| noteName\.trim\(\)\.length === 0 \|\| !selectedWorkspaceVisible\}/);
});
