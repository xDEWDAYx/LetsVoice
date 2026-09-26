import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../src/app/(tabs)/_layout.tsx", import.meta.url);

test("bottom tabs map the requested icons on iOS, Android, and web", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /ios: "rectangle\.grid\.2x2"/);
  assert.match(source, /android: "dashboard"/);
  assert.match(source, /ios: "books\.vertical", android: "folder", web: "folder"/);
  assert.match(source, /ios: "cube"/);
  assert.match(source, /android: "deployed_code"/);
  assert.match(source, /import \{\s*SymbolView/);
  assert.match(source, /expo-symbols\/androidWeights\/regular/);
  assert.match(source, /expo-symbols\/androidWeights\/semiBold/);
});

test("bottom tabs stay above the iPhone home indicator", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /useSafeAreaInsets\(\)/);
  assert.match(source, /const bottomInset = Math\.max\(insets\.bottom, 8\)/);
  assert.match(source, /height: 56 \+ bottomInset/);
  assert.match(source, /paddingBottom: bottomInset \+ 2/);
});
