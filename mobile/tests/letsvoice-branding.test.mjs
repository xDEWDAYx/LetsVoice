import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const previousBrand = ["Speak", "Space"].join("");
const previousUpperBrand = previousBrand.toUpperCase();

test("LetsVoice is the current display brand without changing compatibility identifiers", async () => {
  const appConfig = JSON.parse(await readFile(new URL("../app.json", import.meta.url), "utf8"));
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(appConfig.expo.name, "LetsVoice");
  assert.equal(appConfig.expo.version, "1.6.2");
  assert.equal(appConfig.expo.ios.buildNumber, "9");
  assert.equal(packageJson.version, "1.6.2");

  assert.equal(appConfig.expo.slug, "speakspace-local-mobile");
  assert.equal(appConfig.expo.scheme, "speakspacelocalmobile");
  assert.equal(appConfig.expo.ios.bundleIdentifier, "com.dhebhxh.speakspacelocalmobile");
  assert.equal(appConfig.expo.android.package, "com.dhebhxh.speakspacelocalmobile");
});

test("Home shows the exact LetsVoice wordmark without the local suffix", async () => {
  const home = await readFile(new URL("../src/app/(tabs)/index.tsx", import.meta.url), "utf8");

  assert.match(home, />LetsVoice<\/Text>/);
  assert.doesNotMatch(home, /LETSVOICE-LOCAL/);
});

test("current product surfaces contain no previous display-brand name", async () => {
  const files = [
    "app.json",
    "README.md",
    "CONTEXT.md",
    "docs/ios-local-install.md",
    "docs/ios-sidestore-windows.md",
    "docs/ios-release-v1.6.2-YQ.md",
    "docs/llm-model-selection.md",
    "docs/stt-model-selection.md",
    "docs/adr/0020-preserve-technical-identifiers-during-letsvoice-rebrand.md",
    ...(await collectTextFiles("src")),
    ...(await collectTextFiles("scripts")),
    ...(await collectTextFiles("modules")),
    ...(await collectTextFiles("plugins")),
  ];

  const stale = [];
  for (const file of files) {
    const content = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    if (content.includes(previousBrand) || content.includes(previousUpperBrand)) stale.push(file);
  }

  assert.deepEqual(stale, []);
});

async function collectTextFiles(directory) {
  const entries = await readdir(new URL(`../${directory}/`, import.meta.url), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(relativePath)));
      continue;
    }
    if ([".js", ".json", ".md", ".mjs", ".podspec", ".swift", ".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(relativePath);
    }
  }

  return files;
}
