import assert from "node:assert/strict";
import test from "node:test";

import { extractStreamingObjectStringFields, extractStreamingString, extractStreamingStringArray } from "../src/services/structured-stream-preview.ts";

test("structured previews expose incomplete strings without waiting for valid JSON", () => {
  const raw = '{"summary":"A live sum';
  assert.equal(extractStreamingString(raw, "summary"), "A live sum");
});

test("structured previews expose complete and current array items", () => {
  const raw = '{"keyPoints":["First point","Second po';
  assert.deepEqual(extractStreamingStringArray(raw, "keyPoints"), ["First point", "Second po"]);
});

test("knowledge previews isolate arrays by section key", () => {
  const raw = '{"sections":{"facts":["One"],"examples":["Examp';
  assert.deepEqual(extractStreamingStringArray(raw, "facts"), ["One"]);
  assert.deepEqual(extractStreamingStringArray(raw, "examples"), ["Examp"]);
});

test("structured previews do not borrow a later field when the requested value is null", () => {
  assert.equal(extractStreamingString('{"summary":null,"other":"Wrong"}', "summary"), "");
  assert.deepEqual(extractStreamingStringArray('{"facts":null,"examples":["Wrong"]}', "facts"), []);
});

test("intent previews expose complete and incomplete object titles", () => {
  const raw = '{"tasks":[{"title":"Send report","actionItems":[]},{"title":"Call Al';
  assert.deepEqual(extractStreamingObjectStringFields(raw, "tasks", "title"), ["Send report", "Call Al"]);
});

test("intent previews keep nested action-item titles out of the task list", () => {
  const raw = '{"tasks":[{"title":"Ship release","actionItems":[{"title":"Run tests"}]}],"reminders":[{"title":"Check metrics"}]}';
  assert.deepEqual(extractStreamingObjectStringFields(raw, "tasks", "title"), ["Ship release"]);
  assert.deepEqual(extractStreamingObjectStringFields(raw, "reminders", "title"), ["Check metrics"]);
});

test("intent previews do not promote a nested title when the task title is absent", () => {
  const raw = '{"tasks":[{"actionItems":[{"title":"Nested only"}]},{"title":"Top level"}]}';
  assert.deepEqual(extractStreamingObjectStringFields(raw, "tasks", "title"), ["Top level"]);
});
