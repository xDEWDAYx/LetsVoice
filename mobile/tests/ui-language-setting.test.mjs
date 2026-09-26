import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the iPhone interface exposes English only", async () => {
  const [localization, settings, translator] = await Promise.all([
    read("src/localization/i18n.ts"),
    read("src/app/(tabs)/settings.tsx"),
    read("src/hooks/use-ui-copy-translation.ts"),
  ]);
  assert.match(localization, /UI_LANGUAGES = \["en"\] as const/);
  assert.match(localization, /IOS_UI_LANGUAGE: UiLanguage = "en"/);
  assert.doesNotMatch(settings, /UI language|Language picker|setLanguage|useUiLanguage/iu);
  assert.match(translator, /return \(value: string\) => value/);
  await assert.rejects(access(new URL("../src/hooks/use-ui-language.ts", import.meta.url)));
});

test("English-only UI does not remove multilingual content and speech support", async () => {
  const [localization, ttsLanguage, translationService] = await Promise.all([
    read("src/localization/i18n.ts"),
    read("src/services/tts-language.ts"),
    read("src/services/note-translation-service.ts"),
  ]);
  assert.match(localization, /CONTENT_LANGUAGES = \["en", "zh-CN", "es", "fr", "de", "ja", "ko", "pt"\] as const/);
  assert.match(ttsLanguage, /CONTENT_LANGUAGES\.find/);
  assert.match(ttsLanguage, /Script=Han/);
  assert.match(translationService, /ContentLanguage/);
});

test("the calendar and all settings labels are fixed to English", async () => {
  const [home, settings, uiCopy] = await Promise.all([
    read("src/app/(tabs)/index.tsx"),
    read("src/app/(tabs)/settings.tsx"),
    read("src/localization/ui-copy.ts"),
  ]);
  assert.match(home, /const language = "en" as const/);
  assert.match(home, /key=\{`\$\{language\}-\$\{theme\.mode\}`\}/);
  for (const label of ["Appearance", "Text Size", "Speak New AI Answers", "Task Notifications", "Getting Started"]) {
    assert.ok(settings.includes(label), `missing English setting: ${label}`);
  }
  assert.match(uiCopy, /iOS interface is intentionally English-only/);
  assert.match(uiCopy, /return value/);
});
