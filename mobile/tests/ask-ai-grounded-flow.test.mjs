import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const groundedMessages = await import(
  "../src/services/ask-ai-grounded-messages.ts"
);
const contextBudget = await import("../src/services/llm-context-budget.ts");
const cacheIdentity = await import(
  "../src/services/ask-ai-cache-identity.ts"
);

const RELATIVITY_NOTE = {
  noteId: "note-relativity",
  noteName: "Relativity lecture",
  transcript:
    "Relativity is a framework in physics describing how space and time depend on the observer's frame of reference.",
  updatedAt: "2026-08-24T10:00:00.000Z",
};

function createTokenContext() {
  return {
    async getFormattedChat(messages) {
      return { prompt: JSON.stringify(messages) };
    },
    async tokenize(prompt) {
      return { tokens: Array.from(prompt) };
    },
  };
}

test("cross-language questions receive the complete transcript context", () => {
  const messages = groundedMessages.buildGroundedCompletionMessages(
    [RELATIVITY_NOTE],
    [{ role: "user", content: "相对论的定义是什么？" }],
  );

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /Relativity is a framework in physics/);
  assert.match(messages[0].content, /language may differ/);
  assert.equal(messages[1].content, "相对论的定义是什么？");
});

test("grounding policy requires an explicit context-insufficient response", () => {
  const messages = groundedMessages.buildGroundedCompletionMessages(
    [RELATIVITY_NOTE],
    [{ role: "user", content: "What was Einstein's birth date?" }],
  );

  assert.match(messages[0].content, /sole source of factual evidence/);
  assert.match(messages[0].content, /does not contain enough information/);
  assert.match(messages[0].content, /Do not guess, fabricate/);
});

test("prompt budgeting trims old chat turns but keeps the full transcript and latest question", async () => {
  const history = [
    { role: "user", content: "old question ".repeat(20) },
    { role: "assistant", content: "old answer ".repeat(20) },
    { role: "user", content: "相对论的定义是什么？" },
  ];
  const latestOnly = groundedMessages.buildGroundedCompletionMessages(
    [RELATIVITY_NOTE],
    [history.at(-1)],
  );
  const promptBudget = JSON.stringify(latestOnly).length;

  const result = await contextBudget.fitGroundedMessagesToBudget(
    createTokenContext(),
    [RELATIVITY_NOTE],
    history,
    promptBudget,
  );

  assert.equal(result.historyTrimmed, true);
  assert.match(result.messages[0].content, /Relativity is a framework in physics/);
  assert.equal(result.messages.at(-1).content, "相对论的定义是什么？");
  assert.equal(result.messages.some((message) => message.content.includes("old question")), false);
});

test("Ask AI core path performs one completion without evidence pre-classification", async () => {
  const source = await readFile(
    new URL("../src/services/llm-inference-service.ts", import.meta.url),
    "utf8",
  );

  assert.equal((source.match(/this\.requests\.complete\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /ask-ai-evidence-gate/);
  assert.doesNotMatch(source, /classifySelectedEvidence/);
  assert.doesNotMatch(source, /fitEvidenceExtractionMessagesToBudget/);
  assert.match(source, /fitGroundedMessagesToBudget/);
});

test("cache identity isolates conversations and invalidates changed notes", () => {
  const original = cacheIdentity.buildAskAiCacheIdentity("conversation-a", [
    RELATIVITY_NOTE,
  ]);
  const otherConversation = cacheIdentity.buildAskAiCacheIdentity(
    "conversation-b",
    [RELATIVITY_NOTE],
  );
  const editedNote = cacheIdentity.buildAskAiCacheIdentity("conversation-a", [
    { ...RELATIVITY_NOTE, transcript: `${RELATIVITY_NOTE.transcript} Edited.` },
  ]);

  assert.notEqual(original, otherConversation);
  assert.notEqual(original, editedNote);
});

test("long history budget search uses logarithmic tokenization passes", async () => {
  const history = [];
  for (let index = 0; index < 32; index += 1) {
    history.push({ role: "user", content: `question ${index} `.repeat(8) });
    history.push({ role: "assistant", content: `answer ${index} `.repeat(8) });
  }
  history.push({ role: "user", content: "latest question" });

  const latestOnly = groundedMessages.buildGroundedCompletionMessages(
    [RELATIVITY_NOTE],
    [history.at(-1)],
  );
  const result = await contextBudget.fitGroundedMessagesToBudget(
    createTokenContext(),
    [RELATIVITY_NOTE],
    history,
    JSON.stringify(latestOnly).length + 250,
  );

  assert.equal(result.historyTrimmed, true);
  assert.ok(result.tokenizationPasses <= 8, `${result.tokenizationPasses} passes`);
  assert.equal(result.messages.at(-1).content, "latest question");
});

test("shared context owns cache switching for Ask AI and translation", async () => {
  const [sharedSource, askAiSource, translationSource] = await Promise.all([
    readFile(new URL("../src/services/shared-llm-context-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/llm-inference-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/note-translation-service.ts", import.meta.url), "utf8"),
  ]);

  assert.match(sharedSource, /cacheIdentity === identity/);
  assert.match(sharedSource, /this\.context\.clearCache\(false\)/);
  assert.doesNotMatch(askAiSource, /prepareConversationSwitch/);
  assert.match(askAiSource, /buildAskAiCacheIdentity/);
  assert.match(translationSource, /sharedContext\.activateCache/);
});

test("an unanswered Ask AI turn remains recoverable from the composer", async () => {
  const source = await readFile(
    new URL("../src/app/ask-ai.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /hasUnansweredUserMessage\s*\?\s*"Retry"/);
  assert.match(source, /hasUnansweredUserMessage\s*\?\s*retryLastUserMessage\(\)/);
  assert.match(source, /!hasUnansweredUserMessage && input\.trim\(\)\.length === 0/);
  assert.match(source, /useFocusEffect/);
});
