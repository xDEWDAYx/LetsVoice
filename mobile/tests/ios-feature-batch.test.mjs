import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const speechChunks = await import("../src/services/speech-text-chunks.ts");
const taskIdentity = await import("../src/services/core-task-identity.ts");
const taskGroups = await import("../src/services/home-task-groups.ts");
const localInference = await import("../src/services/local-llm-coordinator.ts");
const sandboxPaths = await import("../src/services/sandbox-document-path.ts");

test("speech output is split progressively on natural punctuation", () => {
  const text = `${"第一句话很重要。".repeat(32)}${"This is another sentence! ".repeat(24)}`;
  const chunks = speechChunks.splitSpeechText(text);

  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 360));
  assert.equal(speechChunks.splitSpeechText("   ").length, 0);
});

test("long English speech chunks prefer word boundaries", () => {
  const chunks = speechChunks.splitSpeechText("word ".repeat(240));

  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 360));
  assert.ok(chunks.slice(0, -1).every((chunk) => chunk.endsWith("word")));
});

test("local inference stays FIFO while the first request clears speech playback", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();
  let stopCount = 0;
  let finishFirstStop;
  const firstStop = new Promise((resolve) => { finishFirstStop = resolve; });
  coordinator.registerSpeechPlaybackStopper(async () => {
    stopCount += 1;
    if (stopCount === 1) await firstStop;
  });
  const order = [];

  const first = coordinator.runExclusive("ask-ai", async () => { order.push("first"); });
  await Promise.resolve();
  const second = coordinator.runExclusive("knowledge", async () => { order.push("second"); });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, []);

  finishFirstStop();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first", "second"]);
});

test("Ask AI and translation keep their shared native context warm", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();
  let releases = 0;
  coordinator.registerIdleCleanup("shared-llm", async () => { releases += 1; }, ["ask-ai", "translation", "note-title"]);
  await coordinator.runExclusive("ask-ai", async () => undefined);
  await coordinator.runExclusive("translation", async () => undefined);
  await coordinator.runExclusive("note-title", async () => undefined);
  assert.equal(releases, 0);
  await coordinator.runExclusive("knowledge", async () => undefined);
  assert.equal(releases, 1);
});

test("queued inference cancellation never starts and does not lock the scheduler", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();
  let releaseFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = coordinator.runExclusive("ask-ai", () => gate);
  let started = false;
  const queued = coordinator.schedule("knowledge", async () => { started = true; });
  await queued.cancel();
  await assert.rejects(queued.promise, /cancelled/i);
  assert.equal(started, false);
  releaseFirst();
  await first;
  await coordinator.runExclusive("translation", async () => undefined);
  assert.equal(coordinator.isBusy(), false);
});

test("completed inference tasks do not accumulate in scheduler snapshots", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();

  for (let index = 0; index < 25; index += 1) {
    await coordinator.runExclusive("translation", async () => index);
  }

  assert.deepEqual(coordinator.getSnapshot().tasks, []);
});

test("running inference cancellation invokes the registered native interrupt", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();
  let interrupted = false;
  let finish;
  let markRegistered;
  const registered = new Promise((resolve) => { markRegistered = resolve; });
  const nativeWork = new Promise((resolve) => { finish = resolve; });
  const task = coordinator.schedule("ask-ai", async (lifecycle) => {
    lifecycle.setInterrupt(async () => { interrupted = true; finish(); });
    markRegistered();
    await nativeWork;
  });
  await registered;
  await task.cancel();
  await assert.rejects(task.promise, /cancelled/i);
  assert.equal(interrupted, true);
  assert.equal(coordinator.isBusy(), false);
});

test("running inference cancellation accepts a synchronous native interrupt", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();
  let interrupted = false;
  let finish;
  let markRegistered;
  const registered = new Promise((resolve) => { markRegistered = resolve; });
  const nativeWork = new Promise((resolve) => { finish = resolve; });
  const task = coordinator.schedule("translation", async (lifecycle) => {
    lifecycle.setInterrupt(() => { interrupted = true; finish(); });
    markRegistered();
    await nativeWork;
  });
  await registered;
  await task.cancel();
  await assert.rejects(task.promise, /cancelled/i);
  assert.equal(interrupted, true);
  assert.equal(coordinator.isBusy(), false);
});

test("cancelling LLM work keeps the shared runtime compatible and reusable", async () => {
  const coordinator = new localInference.LocalLlmCoordinator();
  let releases = 0;
  coordinator.registerIdleCleanup("shared-llm", async () => { releases += 1; }, [
    "ask-ai", "translation", "knowledge", "knowledge-template", "note-classification", "core-insights", "tts",
  ]);
  let finish;
  let markRegistered;
  const registered = new Promise((resolve) => { markRegistered = resolve; });
  const nativeWork = new Promise((resolve) => { finish = resolve; });
  const task = coordinator.schedule("core-insights", async (lifecycle) => {
    lifecycle.setInterrupt(() => { finish(); });
    markRegistered();
    await nativeWork;
  });
  await registered;
  await task.cancel();
  await assert.rejects(task.promise, /cancelled/i);
  await coordinator.runExclusive("translation", async () => undefined);
  await coordinator.runExclusive("tts", async () => undefined);
  await coordinator.runExclusive("core-insights", async () => undefined);
  assert.equal(releases, 0);
});

test("TTS model paths survive an iOS sandbox container UUID change", () => {
  const oldPath = "/old-container/Documents/sherpa-onnx/models/tts/model/model";
  const currentDocuments = "file:///new-container/Documents/";

  assert.equal(
    sandboxPaths.toDocumentRelativePath(oldPath),
    "sherpa-onnx/models/tts/model/model",
  );
  assert.equal(
    sandboxPaths.resolveDocumentPath(oldPath, currentDocuments),
    "/new-container/Documents/sherpa-onnx/models/tts/model/model",
  );
  assert.equal(
    sandboxPaths.resolveDocumentPath("sherpa-onnx/models/tts/model/model", currentDocuments),
    "/new-container/Documents/sherpa-onnx/models/tts/model/model",
  );
});

test("task identity uses normalized title and due date before start date", () => {
  assert.equal(
    taskIdentity.coreTaskIdentity(" Email Sam! ", "2026-08-23T18:00:00+01:00", null),
    taskIdentity.coreTaskIdentity("email-sam", "2026-08-23T09:00:00+01:00", "2026-08-22T09:00:00+01:00"),
  );
  assert.notEqual(
    taskIdentity.coreTaskIdentity("Email Sam", "2026-08-23T09:00:00+01:00", null),
    taskIdentity.coreTaskIdentity("Email Sam", "2026-08-24T09:00:00+01:00", null),
  );
});

test("Home groups only generated pending tasks and keeps completed separate", () => {
  const makeTask = (id, status, dueAt) => ({
    id,
    title: id,
    description: null,
    status,
    startsAt: null,
    dueAt,
    completedAt: status === "completed" ? "2026-08-23T12:00:00+01:00" : null,
    sourceNoteId: "note-1",
    externalSystem: null,
    externalId: null,
    metadata: {},
    actionItems: [],
  });
  const grouped = taskGroups.groupHomeTasks([
    makeTask("overdue", "pending", "2026-08-22T09:00:00+01:00"),
    makeTask("today", "pending", "2026-08-23T18:00:00+01:00"),
    makeTask("upcoming", "pending", "2026-08-24T09:00:00+01:00"),
    makeTask("unscheduled", "pending", null),
    makeTask("done", "completed", null),
    makeTask("cancelled", "cancelled", null),
  ], new Date("2026-08-23T12:00:00+01:00"));

  assert.deepEqual(grouped.pending.map((group) => [group.key, group.tasks.map((task) => task.id)]), [
    ["overdue", ["overdue"]],
    ["today", ["today"]],
    ["upcoming", ["upcoming"]],
    ["unscheduled", ["unscheduled"]],
  ]);
  assert.deepEqual(grouped.completed.map((task) => task.id), ["done"]);
});

test("theme launch and speech stop keep their resolved state", async () => {
  const [themeProvider, rootLayout, speechService, tabs] = await Promise.all([
    readFile(new URL("../src/providers/theme-provider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/_layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/speech-playback-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(tabs)/_layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(themeProvider, /Storage\.getItemSync\(THEME_PREFERENCE_KEY\)/);
  assert.match(themeProvider, /return "light"/);
  assert.match(rootLayout, /SplashScreen\.preventAutoHideAsync\(\)/);
  assert.match(rootLayout, /stopForBackground\(\)/);
  assert.match(speechService, /cancelSpeechStream\(\)/);
  assert.match(speechService, /pcmPlayback\.stopImmediately\(\)/);
  assert.doesNotMatch(tabs, /name="dashboard"/);
  assert.match(tabs, /name="settings"/);
});

test("Structured Note regeneration reconciles exact one-off and recurring identities", async () => {
  const repository = await readFile(
    new URL("../src/repositories/core-note-insight-repository.ts", import.meta.url),
    "utf8",
  );

  assert.match(repository, /status = 'completed'/);
  assert.match(repository, /coreTaskIdentity\(previous\.title, previous\.due_at, previous\.starts_at\)/);
  assert.match(repository, /previous\.series_key === task\.seriesKey/);
  assert.match(repository, /const taskId = matching\?\.id \?\? task\.id/);
  assert.match(repository, /WHERE insight_id = \? AND is_current = 1/);
});

test("Structured Note keeps historical tasks out of the current view without showing a permanent spinner", async () => {
  const noteDetail = await readFile(
    new URL("../src/app/notes/[noteId].tsx", import.meta.url),
    "utf8",
  );

  assert.match(noteDetail, /busy=\{busyIds\.has\(task\.id\)\}/);
  assert.match(noteDetail, /disabled=\{task\.status === "completed" && !canRestore\}/);
  assert.doesNotMatch(noteDetail, /busy=\{busyIds\.has\(task\.id\) \|\| \(task\.status === "completed" && !canRestore\)\}/);
});
