import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Workspace list keeps controls fixed while a FlatList filters by workspace name", async () => {
  const source = await read("src/app/workspaces/index.tsx");

  assert.match(source, /import \{[^}]*FlatList[^}]*\} from "react-native"/);
  assert.doesNotMatch(source, /<ScrollView/);
  assert.match(source, /const normalizedWorkspaceQuery = workspaceQuery\.trim\(\)\.toLocaleLowerCase\("en"\)/);
  assert.match(source, /state\.workspaces\.filter\(\(workspace\) => workspace\.getName\(\)\.toLocaleLowerCase\("en"\)\.includes\(normalizedWorkspaceQuery\)\)/);
  assert.match(source, /style=\{\[[\s\S]*?styles\.fixedHeader[\s\S]*?<TextInput[\s\S]*?accessibilityLabel="Search workspaces by name"[\s\S]*?<Pressable[\s\S]*?accessibilityLabel="New workspace"[\s\S]*?<SymbolView name="plus"[\s\S]*?<FlatList<WorkspaceListItem>/);
  assert.match(source, /newWorkspaceButton: \{[^}]*height: 44[^}]*width: 44/);
  assert.doesNotMatch(source, /label="\+ New workspace"/);
  assert.match(source, /paddingTop: embeddedInTab \? insets\.top \+ Spacing\.md : Spacing\.lg/);
  assert.match(source, /data=\{filteredWorkspaces\}/);
  assert.match(source, /const showSuggestion = state\.status === "success"[\s\S]*?normalizedWorkspaceQuery\.length === 0/);
  assert.match(source, /ListHeaderComponent=\{showSuggestion \? \([\s\S]*?ORGANISATION SUGGESTION/);
  assert.match(source, /ListEmptyComponent=[\s\S]*?"No workspaces yet"[\s\S]*?"No matching workspaces"/);
  assert.doesNotMatch(source, /label="Create workspace"/);
});

test("Workspace editors use icon close controls, preserve drafts on dismiss, and clear only after success", async () => {
  const [listSource, detailSource] = await Promise.all([
    read("src/app/workspaces/index.tsx"),
    read("src/app/workspaces/[workspaceId]/index.tsx"),
  ]);

  for (const source of [listSource, detailSource]) {
    assert.match(source, /import \{ ModalCloseButton \}/);
    assert.match(source, /dismissDisabled=\{isSaving\}/);
    assert.match(source, /<ModalCloseButton disabled=\{isSaving\}/);
    assert.doesNotMatch(source, />Close<\/Text>/);
  }

  assert.match(listSource, /const closeCreateWorkspace = \(\) => \{[\s\S]*?if \(isSaving\) return;[\s\S]*?setIsModalVisible\(false\)/);
  assert.doesNotMatch(listSource.match(/const closeCreateWorkspace = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "", /setName\(/);
  assert.match(listSource, /await workspaceService\.createWorkspace\(name\);[\s\S]*?setName\(""\)/);

  assert.match(detailSource, /const \[newNoteTitle, setNewNoteTitle\] = useState\(""\)/);
  assert.match(detailSource, /const \[newNoteTranscript, setNewNoteTranscript\] = useState\(""\)/);
  assert.match(detailSource, /const \[renameWorkspaceDraft, setRenameWorkspaceDraft\] = useState<string \| null>\(null\)/);
  assert.match(detailSource, /const openNewNote = \(\) => \{[\s\S]*?setModalMode\("create-note"\)[\s\S]*?setIsModalVisible\(true\)/);
  assert.doesNotMatch(detailSource.match(/const openNewNote = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "", /setNewNote(?:Title|Transcript)\(/);
  assert.match(detailSource, /await noteService\.createNote\(workspaceId, newNoteTitle, newNoteTranscript\);[\s\S]*?setNewNoteTitle\(""\);[\s\S]*?setNewNoteTranscript\(""\)/);
  assert.match(detailSource, /setRenameWorkspaceDraft\(\(current\) => current \?\? state\.workspace\.getName\(\)\)/);
  assert.match(detailSource, /await workspaceService\.renameWorkspace\(workspaceId, renameWorkspaceDraft \?\? ""\);[\s\S]*?setRenameWorkspaceDraft\(null\)/);
  assert.match(detailSource, /<EmptyState title="No notes yet" \/>/);
  assert.doesNotMatch(detailSource, /label="Create note"/);
});
