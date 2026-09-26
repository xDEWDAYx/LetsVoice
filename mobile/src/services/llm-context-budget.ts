import type { LlamaContext, RNLlamaOAICompatibleMessage } from "llama.rn";

import { TRANSCRIPT_TOO_LONG_ERROR } from "../constants/ask-ai-grounding-policy.ts";
import { ASK_AI_PROMPT_BUDGET } from "../constants/ask-ai-inference-config.ts";
import { InferenceError } from "../errors/inference-error.ts";

import { buildGroundedCompletionMessages } from "./ask-ai-grounded-messages.ts";
import type { TranscriptContextBlock } from "./ask-ai-grounded-messages.ts";

type FitMessagesResult = {
  messages: RNLlamaOAICompatibleMessage[];
  promptTokenCount: number;
  historyTrimmed: boolean;
  tokenizationPasses: number;
};

export async function countFormattedPromptTokens(
  context: LlamaContext,
  messages: RNLlamaOAICompatibleMessage[],
): Promise<number> {
  const formatted = await context.getFormattedChat(messages, null, {
    jinja: true,
    enable_thinking: false,
    reasoning_format: "none",
  });
  const prompt = formatted.prompt ?? "";
  const { tokens } = await context.tokenize(prompt);
  return tokens.length;
}

/**
 * Fits grounded messages into the prompt budget.
 * Transcript text is never trimmed. Older history messages may be dropped.
 */
export async function fitGroundedMessagesToBudget(
  context: LlamaContext,
  transcriptBlocks: TranscriptContextBlock[],
  history: { role: string; content: string }[],
  promptBudget: number = ASK_AI_PROMPT_BUDGET,
): Promise<FitMessagesResult> {
  if (history.length === 0) {
    throw new InferenceError("Conversation history is empty.");
  }

  const candidates: { role: string; content: string }[][] = [[...history]];
  while (candidates.at(-1)!.length > 1) {
    candidates.push(trimOldestConversationTurn(candidates.at(-1)!));
  }

  let tokenizationPasses = 0;
  const measured = new Map<
    number,
    { messages: RNLlamaOAICompatibleMessage[]; promptTokenCount: number }
  >();
  const measure = async (index: number) => {
    const cached = measured.get(index);
    if (cached) return cached;
    const messages = buildGroundedCompletionMessages(
      transcriptBlocks,
      candidates[index]!,
    );
    const promptTokenCount = await countFormattedPromptTokens(context, messages);
    tokenizationPasses += 1;
    const result = { messages, promptTokenCount };
    measured.set(index, result);
    return result;
  };

  const full = await measure(0);
  if (full.promptTokenCount <= promptBudget) {
    return { ...full, historyTrimmed: false, tokenizationPasses };
  }

  const lastIndex = candidates.length - 1;
  const latestOnly = await measure(lastIndex);
  if (latestOnly.promptTokenCount > promptBudget) {
    throw new InferenceError(TRANSCRIPT_TOO_LONG_ERROR);
  }

  let low = 1;
  let high = lastIndex;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = await measure(middle);
    if (candidate.promptTokenCount <= promptBudget) high = middle;
    else low = middle + 1;
  }

  return {
    ...(await measure(low)),
    historyTrimmed: true,
    tokenizationPasses,
  };
}

function trimOldestConversationTurn(
  history: { role: string; content: string }[],
): { role: string; content: string }[] {
  if (history.length <= 1) {
    return history;
  }

  const removeCount =
    history[0]?.role === "user" && history[1]?.role === "assistant" ? 2 : 1;
  let trimmed = history.slice(removeCount);

  while (trimmed.length > 1 && trimmed[0]?.role === "assistant") {
    trimmed = trimmed.slice(1);
  }

  return trimmed;
}
