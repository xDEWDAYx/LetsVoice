import type { TranscriptContextBlock } from "./ask-ai-grounded-messages.ts";

/**
 * The native layer still performs token-exact prefix matching. This identity
 * decides only whether cache reuse is allowed at all.
 */
export function buildAskAiCacheIdentity(
  conversationId: string,
  transcriptBlocks: TranscriptContextBlock[],
): string {
  const noteScope = transcriptBlocks
    .map(
      (block) =>
        `${block.noteId}:${block.updatedAt}:${block.transcript.length}:${hashText(block.transcript)}`,
    )
    .join("|");
  return `ask-ai:${conversationId}:${noteScope}`;
}

function hashText(text: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `${first >>> 0}-${second >>> 0}`;
}
