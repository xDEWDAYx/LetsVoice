import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJsonPath = new URL("../package.json", import.meta.url);
const scriptPath = new URL(
  "../scripts/package-ios-sidestore.mjs",
  import.meta.url,
);

test("SideStore packager creates a checksummed IPA without signing assets", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const script = await readFile(scriptPath, "utf8");

  assert.equal(
    packageJson.scripts["package:ios:sidestore"],
    "node scripts/package-ios-sidestore.mjs",
  );
  assert.match(script, /artifactBaseName = `LetsVoice-iOS-v\$\{version\}`/);
  assert.match(script, /`\$\{artifactBaseName\}\.ipa`/);
  assert.match(script, /entry\.name === "_CodeSignature"/);
  assert.match(script, /entry\.name === "embedded\.mobileprovision"/);
  assert.match(script, /createHash\("sha256"\)/);
  assert.match(script, /unzip", \["-tqq", ipaPath\]/);
  assert.match(script, /"--norsrc"/);
  assert.match(script, /entry\.startsWith\("__MACOSX\/"\)/);
});

test("team config supports a per-developer iOS bundle identifier", async () => {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const appJson = JSON.parse(
    await readFile(new URL("../app.json", import.meta.url), "utf8"),
  );
  const dynamicConfig = await readFile(
    new URL("../app.config.ts", import.meta.url),
    "utf8",
  );

  assert.equal(
    appJson.expo.ios.bundleIdentifier,
    "com.dhebhxh.speakspacelocalmobile",
  );
  assert.equal(appJson.expo.version, packageJson.version);
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.match(appJson.expo.ios.buildNumber, /^\d+$/);
  assert.match(dynamicConfig, /process\.env\.IOS_BUNDLE_IDENTIFIER/);
  assert.doesNotMatch(dynamicConfig, /DEVELOPMENT_TEAM|PROVISIONING_PROFILE/);
});
