import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Home keeps overview behind a compact modal and orders recording, tasks, then calendar", async () => {
  const home = await read("src/app/(tabs)/index.tsx");
  const scrollView = home.slice(home.indexOf("<ScrollView"), home.indexOf("</ScrollView>"));
  const overviewModal = home.slice(home.indexOf("<SafeAreaModal"), home.indexOf("</SafeAreaModal>"));

  assert.doesNotMatch(home, /import \{ NoteCard \}/);
  assert.doesNotMatch(home, /import \{ CategoryFilter/);
  assert.doesNotMatch(home, /accessibilityLabel="Search notes and related content"/);
  assert.doesNotMatch(home, /styles\.notesSection/);
  assert.doesNotMatch(home, /styles\.overviewSection/);
  assert.match(home, /accessibilityLabel="Open overview"/);
  assert.match(home, /visible=\{overviewVisible\}/);
  assert.doesNotMatch(scrollView, /<HomeStatCard/);
  assert.match(overviewModal, /<HomeStatCard/);
  assert.doesNotMatch(overviewModal, /A quick snapshot of your notes and open work\./);
  assert.ok(scrollView.indexOf("Start a transcription") < scrollView.indexOf("<HomeTaskList"));
  assert.ok(scrollView.indexOf("<HomeTaskList") < scrollView.indexOf("<Calendar"));
  assert.match(home, /pathname: "\/\(tabs\)\/library"/);
  assert.match(home, /label="Open Library"/);
  assert.match(home, /<HomeTaskList/);
  assert.match(home, /<Calendar/);
  assert.doesNotMatch(home, /Local-first · Your data stays on this device/);
});

test("Library combines first-class Notes and Workspaces modes without adding a fifth tab", async () => {
  const [tabs, library] = await Promise.all([
    read("src/app/(tabs)/_layout.tsx"),
    read("src/app/(tabs)/library.tsx"),
  ]);

  assert.match(tabs, /name="library"[\s\S]*?title: "Library"/);
  assert.equal((tabs.match(/<Tabs\.Screen/g) ?? []).length, 4);
  assert.match(library, /type LibrarySection = "notes" \| "workspaces"/);
  assert.match(library, /useState<LibrarySection>\("notes"\)/);
  assert.match(library, /label="Notes"/);
  assert.match(library, /label="Workspaces"/);
  assert.match(library, /<LibraryNotesPane/);
  assert.match(library, /<WorkspaceListScreen embeddedInLibrary/);
});

test("Library Notes keeps full local search, filters, and incremental result loading", async () => {
  const notes = await read("src/components/library-notes-pane.tsx");

  assert.match(notes, /accessibilityLabel="Search notes and related content"/);
  assert.match(notes, /searchNoteResourceResults\(normalized\)/);
  assert.match(notes, /uniqueNoteSearchDestinations\(/);
  assert.match(notes, /NOTE_RESULT_BATCH_SIZE = 20/);
  assert.match(notes, /visibleNoteResults\.slice\(0, noteResultLimit\)/);
  assert.doesNotMatch(notes, /Search, filter, and open anything you have captured\./);
  assert.match(notes, /import \{ Host, Picker, Text as NativeText \} from "@expo\/ui\/swift-ui"/);
  assert.match(notes, /buttonBorderShape,[\s\S]*?buttonStyle,[\s\S]*?controlSize,[\s\S]*?pickerStyle,[\s\S]*?tag/);
  assert.equal((notes.match(/<Picker(?=\s)/g) ?? []).length, 2);
  assert.equal((notes.match(/<Host(?=\s)/g) ?? []).length, 2);
  assert.match(notes, /testID="library-note-scope-filter"/);
  assert.match(notes, /selection=\{noteFilter\}/);
  assert.match(notes, /onSelectionChange=\{setNoteFilter\}/);
  assert.match(notes, /testID="library-note-category-filter"/);
  assert.match(notes, /selection=\{categoryFilter\}/);
  assert.match(notes, /onSelectionChange=\{setCategoryFilter\}/);
  assert.equal((notes.match(/pickerStyle\("menu"\)/g) ?? []).length, 2);
  assert.equal((notes.match(/buttonStyle\("bordered"\)/g) ?? []).length, 2);
  assert.equal((notes.match(/buttonBorderShape\("capsule"\)/g) ?? []).length, 2);
  assert.equal((notes.match(/controlSize\("small"\)/g) ?? []).length, 2);
  assert.doesNotMatch(notes, /<CategoryFilter(?:\s|\/|>)|<NoteScopeButton(?:\s|\/|>)|styles\.scopeFilters/);
  assert.match(notes, /\{ value: "all", label: "All Notes" \}/);
  assert.match(notes, /\{ value: "pinned", label: "Pinned" \}/);
  assert.match(notes, /\{ value: "todos", label: "Open Tasks" \}/);
  assert.match(notes, /\{ value: "all", label: "All Category" \}/);
  assert.match(notes, /<NoteCard/);
});

test("Library Notes shows two standalone native dropdown pills without an outer filter card", async () => {
  const notes = await read("src/components/library-notes-pane.tsx");

  assert.match(notes, /<View accessibilityLabel="Note filters" style=\{styles\.filterRow\}>/);
  assert.match(notes, /<Host[\s\S]*?matchContents[\s\S]*?<Picker[\s\S]*?NOTE_FILTER_OPTIONS\.map[\s\S]*?<NativeText/);
  assert.match(notes, /<Host[\s\S]*?matchContents[\s\S]*?<Picker[\s\S]*?CATEGORY_FILTER_OPTIONS\.map[\s\S]*?<NativeText/);
  assert.doesNotMatch(notes, /LibraryFilterMenu|MenuView|MenuAction/);
  assert.doesNotMatch(notes, /filterFrame|filterMenu|filterTrigger|filterControl|filterLabel/);
  assert.doesNotMatch(notes, /getLibraryFilterWidth|useWindowDimensions/);
  assert.doesNotMatch(notes, /Show:|Category:|Clear filters/);
});
