import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Floating Ask AI keeps its behavior while showing only a single AI label", async () => {
  const source = await readFile(
    new URL("../src/components/floating-ask-ai-button.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /accessibilityLabel="Open Ask AI"/);
  assert.match(source, /<Text numberOfLines=\{1\}[^>]*>AI<\/Text>/);
  assert.doesNotMatch(source, />Ask<\/Text>/);
  assert.match(source, /PanResponder\.create/);
  assert.match(source, /router\.push\("\/ask-ai" as Href\)/);
  assert.match(source, /pathname === "\/ask-ai"/);
});
