import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the iPhone build remains compatible with free Personal Team signing", async () => {
  const appConfig = JSON.parse(
    await readFile(new URL("../app.json", import.meta.url), "utf8"),
  );
  const llamaPlugin = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "llama.rn",
  );

  assert.ok(llamaPlugin, "The llama.rn Expo plugin must be configured.");
  assert.equal(
    llamaPlugin[1].enableEntitlements,
    false,
    "Free Apple Developer provisioning does not support llama.rn's optional extended-memory entitlements.",
  );
});
