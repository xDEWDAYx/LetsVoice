import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatCompactDateTime } from "../src/utils/format-date.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Note creation time is compact and forced onto one line", async () => {
  const note = await read("src/app/notes/[noteId].tsx");

  assert.equal(formatCompactDateTime("2026-08-26T15:37:00"), "26 Aug 2026 · 15:37");
  assert.equal(formatCompactDateTime("not-a-date"), "Unknown date");
  assert.match(note, /adjustsFontSizeToFit minimumFontScale=\{0\.82\} numberOfLines=\{1\}[^>]*styles\.noteTimestamp/);
  assert.match(note, /\{formatCompactDateTime\(state\.note\.getCreatedAt\(\)\)\}/);
  assert.doesNotMatch(note, /Created \{format|function formatNoteDateTime/);
  assert.match(note, /noteTimestamp: \{[^}]*flexShrink: 1[^}]*fontVariant: \["tabular-nums"\]/);
});

test("Workspace detail fixes search and category controls above a scrolling note list", async () => {
  const workspace = await read("src/app/workspaces/[workspaceId]/index.tsx");

  assert.match(workspace, /import \{[\s\S]*?FlatList[\s\S]*?\} from "react-native"/);
  assert.doesNotMatch(workspace, /<ScrollView/);
  assert.match(workspace, /styles\.fixedContent[\s\S]*?accessibilityLabel="Search notes and related content"[\s\S]*?<CategoryFilter[\s\S]*?<FlatList<WorkspaceNoteListItem>/);
  assert.match(workspace, /contentInsetAdjustmentBehavior="automatic"/);
  assert.match(workspace, /keyboardDismissMode="on-drag"/);
  assert.match(workspace, /styles\.noteList/);
});

test("Workspace search covers related resources and opens the matching destination", async () => {
  const workspace = await read("src/app/workspaces/[workspaceId]/index.tsx");

  assert.match(workspace, /noteService\.searchNoteResults\(normalizedNoteQuery\)/);
  assert.match(workspace, /result\.note\.getWorkspaceId\(\) === workspaceId/);
  assert.match(workspace, /coreNoteInsightService\.subscribeToChanges\(refreshSearch\)/);
  assert.match(workspace, /knowledgeService\.subscribeToChanges\(refreshSearch\)/);
  assert.match(workspace, /aiConversationService\.subscribeToChanges\(refreshSearch\)/);
  assert.match(workspace, /match=\{item\.match \? \{ source: item\.match\.source, excerpt: item\.match\.excerpt, query: normalizedNoteQuery/);
  assert.match(workspace, /result\.conversationId[\s\S]*?pathname: "\/ask-ai"/);
  assert.match(workspace, /result\.source === "Knowledge"[\s\S]*?result\.source === "Structured Note"/);
  assert.match(workspace, /insightSection: result\.insightSection/);
  assert.match(workspace, /knowledgeResultId: result\.knowledgeResultId/);
  assert.match(workspace, /No Note, Structured Note, Knowledge result, or Ask AI conversation matches/);
});
