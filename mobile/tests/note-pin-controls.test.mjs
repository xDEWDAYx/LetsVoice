import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("note pin controls are available from search and note detail", async () => {
  const [search, detail] = await Promise.all([
    read("src/app/notes/search.tsx"),
    read("src/app/notes/[noteId].tsx"),
  ]);

  assert.match(search, /onPinPress=\{frozenResults === null \? \(\) => void togglePinned\(result\) : undefined\}/);
  assert.match(detail, /label=\{state\.note\.getIsPinned\(\) \? "Unpin note" : "Pin note"\}/);
  for (const screen of [search, detail]) assert.match(screen, /setNotePinned\(/);
});

test("Home keeps task pinning in the task-only list", async () => {
  const [home, taskList] = await Promise.all([
    read("src/app/(tabs)/index.tsx"),
    read("src/components/home-task-list.tsx"),
  ]);

  assert.match(home, /onTaskPinnedChange=\{async \(task, pinned\) =>/);
  assert.match(taskList, /await onTaskPinnedChange\(task, !task\.isPinned\)/);
  assert.match(taskList, /task\.isPinned \? "Unpin task" : "Pin task"/);
  assert.doesNotMatch(home, /togglePinned\(note\)|noteFilter|openTaskNotes/);
});
