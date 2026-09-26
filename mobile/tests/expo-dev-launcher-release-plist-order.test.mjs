import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../node_modules/expo-dev-launcher/plugin/build/withDevLauncher.js",
    import.meta.url,
  ),
  "utf8",
);

test("Expo's Release privacy cleanup waits for the processed Info.plist", () => {
  assert.match(
    source,
    /inputPaths: \['"\$\(TARGET_BUILD_DIR\)\/\$\(INFOPLIST_PATH\)"'\]/,
  );
});
