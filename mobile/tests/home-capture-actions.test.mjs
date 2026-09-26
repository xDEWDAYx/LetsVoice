import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homePath = new URL("../src/app/(tabs)/index.tsx", import.meta.url);

test("Home restores the original primary live recording card", async () => {
  const home = await readFile(homePath, "utf8");

  assert.match(home, /<View style=\{styles\.transcriptionChoices\}>[\s\S]*?styles\.transcriptionCard[\s\S]*?styles\.liveCard[\s\S]*?>Live recording<\/Text>[\s\S]*?>Record and transcribe as you speak\.<\/Text>[\s\S]*?<Link href="\/transcription" asChild><AppButton label="Record now" \/><\/Link>[\s\S]*?<\/View>\s*<\/View>/);
  assert.match(home, /transcriptionChoices: \{ gap: Spacing\.sm \}/);
  assert.match(home, /liveCard: \{[^}]*boxShadow: Shadows\.raised[^}]*padding: Spacing\.lg/);
  assert.doesNotMatch(home, /captureCard|captureTitle/);
});

test("Home restores the original secondary upload row below the live card", async () => {
  const home = await readFile(homePath, "utf8");

  assert.match(home, /<\/View>\s*<View style=\{\[styles\.secondaryActionCard[\s\S]*?>Upload audio<\/Text>[\s\S]*?>Choose a file and start transcribing\.<\/Text>[\s\S]*?<Link href=\{"\/audio-transcription" as Href\} asChild><AppButton label="Upload" variant="quiet" \/><\/Link>/);
  assert.match(home, /secondaryActionCard: \{[^}]*flexDirection: "row"[^}]*minHeight: 88/);
  assert.match(home, /secondaryCopy: \{[^}]*flex: 1[^}]*minWidth: 0/);
});
