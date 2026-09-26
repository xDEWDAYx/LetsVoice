import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const calendar = await import("../src/services/home-calendar-items.ts");
const notifications = await import("../src/services/note-notification-planner.ts");
const markdown = await import("../src/services/safe-markdown.ts");
const suggestions = await import("../src/services/workspace-name-suggestion.ts");
const inference = await import("../src/services/inference-deadline.ts");
const localInference = await import("../src/services/local-llm-coordinator.ts");
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function note(id, transcript, category = "uncategorized", updatedAt = "2026-08-25T12:00:00+01:00") {
  return {
    getId: () => id,
    getName: () => `${category} note`,
    getTranscript: () => transcript,
    getCategory: () => category,
    getUpdatedAt: () => updatedAt,
  };
}

function task(overrides = {}) {
  return {
    id: "task-1", title: "Submit report", description: null, status: "pending",
    startsAt: null, dueAt: "2026-08-26", completedAt: null, sourceNoteId: "note-1",
    externalSystem: null, externalId: null,
    metadata: { timeExpressions: { dueAt: { precision: "date" } } }, actionItems: [],
    isCurrent: true, ...overrides,
  };
}

function reminder(overrides = {}) {
  return {
    id: "reminder-1", kind: "reminder", title: "Call Sam", description: null,
    status: "pending", startsAt: null, endsAt: null, dueAt: null,
    remindAt: "2026-08-27T15:30:00+01:00", allDay: false, timezone: null,
    sourceNoteId: "note-2", externalSystem: null, externalId: null, metadata: {},
    ...overrides,
  };
}

test("Home calendar uses task due or start dates and ignores retired reminder, event, and transcript inference", () => {
  const items = calendar.buildHomeCalendarItems({
    notes: [
      note("note-1", "I need to submit the final report tomorrow."),
      note("note-2", "Remind me tomorrow to call Sam. Meeting on September 10, 2026."),
      note("note-3", "We should do this later, perhaps next week."),
      note("note-4", "提醒我明天提交表格。"),
    ],
    tasks: [
      task(),
      task({ id: "task-start", sourceNoteId: "note-start", dueAt: null, startsAt: "2026-08-29T14:00:00+01:00" }),
    ],
    calendarIntents: [reminder()],
    reference: new Date("2026-08-25T12:00:00+01:00"),
  });

  assert.equal(items.filter((item) => item.sourceNoteId === "note-1" && item.dateKey === "2026-08-26").length, 1);
  assert.equal(items.find((item) => item.sourceNoteId === "note-1")?.source, "structured");
  assert.equal(items.find((item) => item.sourceNoteId === "note-start")?.dateKey, "2026-08-29");
  assert.equal(items.some((item) => item.sourceNoteId === "note-2"), false);
  assert.equal(items.some((item) => item.sourceNoteId === "note-4"), false);
  assert.equal(items.some((item) => item.sourceNoteId === "note-3"), false);
});

test("Home calendar derives datetime keys in local time instead of truncating UTC", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "Europe/London";
  try {
    const items = calendar.buildHomeCalendarItems({
      tasks: [task({ dueAt: "2026-08-31T23:30:00.000Z" })],
    });
    assert.equal(items[0]?.dateKey, "2026-09-01");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("Home calendar never turns month-precision task data into the first day of that month", () => {
  const items = calendar.buildHomeCalendarItems({
    tasks: [task({ dueAt: "2026-09" })],
  });

  assert.deepEqual(items, []);
});

test("local notifications include only future current tasks and ignore retired reminders", () => {
  const planned = notifications.planNoteNotifications({
    tasks: [
      task(),
      task({ id: "scheduled", sourceNoteId: "note-start", dueAt: null, startsAt: "2026-08-29T14:00:00+01:00", metadata: { timeExpressions: { startsAt: { precision: "datetime" } } } }),
      task({ id: "done", status: "completed" }),
      task({ id: "old-series", isCurrent: false }),
      task({ id: "past", dueAt: "2026-08-24" }),
      task({ id: "invalid", dueAt: "2026-02-31" }),
      task({ id: "month-only", dueAt: "2026-09", metadata: { timeExpressions: { dueAt: { precision: "month" } } } }),
    ],
    calendarIntents: [
      reminder(),
      reminder({ id: "event", kind: "calendar", startsAt: "2026-08-28T09:00:00+01:00", remindAt: null }),
      reminder({ id: "past-reminder", remindAt: "2026-08-20T09:00:00+01:00" }),
    ],
  }, new Date("2026-08-25T12:00:00+01:00"));

  assert.deepEqual(planned.map((item) => item.itemId), ["task-1", "scheduled"]);
  assert.equal(planned[0].triggerAt.getHours(), 9);
  assert.equal(planned[1].triggerAt.getHours(), 14);
  assert.equal(planned[0].identifier, "speakspace-task-task-1");
});

test("retired reminder and calendar insights and the duplicate TTS entry stay removed", async () => {
  const [noteScreen, aiScreen, coreService, repository, homeCalendar, planner, pdf, settings] = await Promise.all([
    read("src/app/notes/[noteId].tsx"),
    read("src/app/(tabs)/ai/index.tsx"),
    read("src/services/core-note-insight-service.ts"),
    read("src/repositories/core-note-insight-repository.ts"),
    read("src/services/home-calendar-items.ts"),
    read("src/services/note-notification-planner.ts"),
    read("src/services/note-pdf-document.ts"),
    read("src/app/(tabs)/settings.tsx"),
  ]);

  assert.doesNotMatch(noteScreen, /key: "reminders"|key: "calendar"|<h2>Reminders|Calendar Intents/);
  assert.doesNotMatch(coreService, /reminderProperties|calendarProperties|toCalendar\(/);
  assert.doesNotMatch(repository, /SELECT \* FROM core_note_calendar_intents|SELECT calendar\.\*/);
  assert.doesNotMatch(homeCalendar, /transcriptFallbacks|calendarIntents/);
  assert.doesNotMatch(planner, /calendarIntents|kind: "reminder"/);
  assert.doesNotMatch(pdf, /<h3>Reminders|<h3>Calendar Events/);
  assert.doesNotMatch(settings, /Task & Reminder Notifications|AI & Reminders/);
  assert.equal([...aiScreen.matchAll(/router\.push\("\/ai\/tts-models"/g)].length, 1);
  assert.match(aiScreen, />TTS Models</);
  assert.doesNotMatch(aiScreen, />Text-to-Speech Models</);
});

test("safe Markdown renders inert blocks, validates links, and produces plain speech", () => {
  const source = "# Answer\n\n**Strong** and [safe](https://example.com/a), [unsafe](http://bad.test).\n\n```js\nalert('copy only')\n```\n<script>steal()</script>![remote](https://bad.test/x.png)";
  const blocks = markdown.parseSafeMarkdown(source);
  assert.equal(blocks[0].type, "heading");
  assert.ok(blocks.some((block) => block.type === "code" && block.text.includes("copy only")));
  assert.equal(JSON.stringify(blocks).includes("steal"), false);
  assert.equal(JSON.stringify(blocks).includes("bad.test/x.png"), false);

  const inline = markdown.parseInlineMarkdown("[safe](https://example.com/a) [unsafe](http://bad.test) **bold**");
  assert.deepEqual(inline.filter((item) => item.type === "link").map((item) => [item.domain, Boolean(item.href)]), [["example.com", true], [null, false]]);
  assert.equal(markdown.markdownToPlainText("**Hello** [world](https://example.com)"), "Hello world");
  assert.equal(
    markdown.markdownToPlainText("| Area | Status |\n| --- | --- |\n| iOS | Ready |"),
    "Area — Status\niOS — Ready",
  );
});

test("workspace naming suggestions are deterministic and limited to empty or generic setups", () => {
  const generic = { getId: () => "workspace-1", getName: () => "My Workspace" };
  const study = suggestions.suggestWorkspaceName([generic], [
    note("one", "Lecture notes about algorithms", "learning"),
    note("two", "Study for the exam tutorial", "learning", "2026-08-24T12:00:00Z"),
  ]);
  assert.equal(study?.name, "Study");
  assert.equal(study?.action, "rename");
  assert.equal(suggestions.suggestWorkspaceName([{ getId: () => "x", getName: () => "Thesis" }], [note("one", "research paper")]), null);
  assert.equal(suggestions.suggestWorkspaceName([generic, { getId: () => "y", getName: () => "Other" }], [note("one", "project")]), null);
});

test("queued local AI work can be cancelled without breaking FIFO state", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();
  let releaseFirst;
  const hold = new Promise((resolve) => { releaseFirst = resolve; });
  const first = coordinator.runExclusive("ask-ai", async () => hold);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const controller = new AbortController();
  const second = coordinator.runExclusive("knowledge", async () => "should not run", { signal: controller.signal });
  controller.abort();
  await assert.rejects(second, (error) => error?.name === "AbortError");
  assert.equal(coordinator.getSnapshot().pendingCount, 1);
  releaseFirst();
  await first;
  assert.deepEqual(coordinator.getSnapshot(), { activeOperation: null, pendingCount: 0 });
});

test("active cancellation returns promptly but keeps native work serialized until it unwinds", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();
  let releaseNative;
  const nativeWork = new Promise((resolve) => { releaseNative = resolve; });
  const controller = new AbortController();
  const active = coordinator.runExclusive("core-insights", async () => nativeWork, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(active, (error) => error?.name === "AbortError");
  assert.equal(coordinator.getSnapshot().activeOperation, "core-insights");

  let nextRan = false;
  const next = coordinator.runExclusive("ask-ai", async () => { nextRan = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(nextRan, false);
  releaseNative();
  await next;
  assert.equal(nextRan, true);
});

test("inference deadlines expose timeout and cancellation reasons", async () => {
  const deadline = new inference.InferenceDeadline(5);
  await new Promise((resolve) => deadline.signal.addEventListener("abort", resolve, { once: true }));
  assert.equal(deadline.reason, "timeout");
  assert.throws(() => deadline.throwIfAborted((reason) => new Error(reason)), /timeout/);
  deadline.dispose();

  const cancelled = new inference.InferenceDeadline(10_000);
  cancelled.abort("cancelled");
  assert.equal(cancelled.reason, "cancelled");
  cancelled.dispose();
});

test("PDF export enforces one-note privacy and removes its temporary cache file", async () => {
  const [document, exportService, conversations] = await Promise.all([
    read("src/services/note-pdf-document.ts"),
    read("src/services/note-pdf-export-service.ts"),
    read("src/services/ai-conversation-service.ts"),
  ]);
  assert.match(document, /Message content is omitted from this one-note export/);
  assert.match(document, /audio is not embedded/);
  assert.match(document, /escapeHtml/);
  assert.match(conversations, /item\.linkedNotes\.length === 1/);
  assert.match(exportService, /Print\.printToFileAsync/);
  assert.match(exportService, /Sharing\.shareAsync/);
  assert.match(exportService, /temporaryPdf\.delete\(\)/);
});

test("the selected user-facing feature entry points are wired with progress feedback", async () => {
  const [noteScreen, askAi, settings, onboarding, onboardingGuard, root] = await Promise.all([
    read("src/app/notes/[noteId].tsx"),
    read("src/app/ask-ai.tsx"),
    read("src/app/(tabs)/settings.tsx"),
    read("src/app/getting-started.tsx"),
    read("src/components/onboarding-guard.tsx"),
    read("src/app/_layout.tsx"),
  ]);
  assert.match(noteScreen, /Export PDF/);
  assert.match(noteScreen, /Ask AI Conversations/);
  assert.match(noteScreen, /autoGenerate !== "1"/);
  assert.match(noteScreen, /ActivityIndicator/);
  assert.match(askAi, /SafeMarkdownText/);
  for (const phase of ["Preparing note context", "Waiting for local AI", "Loading the language model", "Generating an answer", "Saving the answer"]) {
    assert.ok(askAi.includes(phase), `missing Ask AI phase: ${phase}`);
  }
  assert.match(settings, /TEXT_SIZE_PREFERENCES/);
  assert.match(settings, /Speak New AI Answers/);
  assert.match(onboarding, /1 OF \{STEPS\.length\}|step \+ 1/);
  for (const route of ["stt-models", "llm-models", "tts-models"]) {
    assert.ok(onboardingGuard.includes(`/ai/${route}`), `onboarding must allow ${route}`);
  }
  assert.match(root, /hasCompletedOnboarding && pathname !== "\/getting-started"/);
  assert.match(root, /stopAllGenerations/);
});

test("Ask AI keeps speech controls below rendered Markdown and model actions are unambiguous", async () => {
  const [askAi, sttCard, llmCard, ttsCard] = await Promise.all([
    read("src/app/ask-ai.tsx"),
    read("src/components/stt-model-card.tsx"),
    read("src/components/llm-model-card.tsx"),
    read("src/components/tts-model-card.tsx"),
  ]);
  assert.match(
    askAi,
    /messageBubble:\s*\{[\s\S]*?gap:\s*Spacing\.lg,[\s\S]*?maxWidth:\s*"88%"/,
  );
  assert.match(sttCard, /accessibilityLabel=\{`Use \$\{name\}`\}/);
  assert.match(llmCard, /accessibilityLabel=\{`Use \$\{props\.name\}`\}/);
  assert.match(ttsCard, /accessibilityLabel=\{`Use \$\{props\.name\}`\}/);
});

test("iOS local notifications do not require the APNs entitlement", async () => {
  const [appConfig, localNotificationsPlugin] = await Promise.all([
    read("app.config.ts"),
    read("plugins/with-local-notifications-only.js"),
  ]);
  const localPluginIndex = appConfig.indexOf('"./plugins/with-local-notifications-only"');
  const notificationsPluginIndex = appConfig.indexOf('"expo-notifications"');
  assert.ok(localPluginIndex >= 0, "local-notifications-only plugin must be configured");
  assert.ok(
    notificationsPluginIndex > localPluginIndex,
    "the entitlement-removal mod must wrap expo-notifications",
  );
  assert.match(localNotificationsPlugin, /delete configWithEntitlements\.modResults\["aps-environment"\]/);
});
