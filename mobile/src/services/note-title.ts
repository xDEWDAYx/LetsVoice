export const NOTE_TITLE_SOURCE_LIMIT = 2_000;

/** Kept verbatim with the desktop Studio prompt so both clients title notes alike. */
export const NOTE_TITLE_SYSTEM_PROMPT =
  "You are a note title assistant. Based on the user's recording, generate a short title summarizing the topic. Output ONLY the title itself: no quotes, no trailing punctuation, no explanations or prefixes. Use the same language as the content; under 20 characters for Chinese, under 8 words for English.";

/** Mirrors desktop title cleanup: first line, no wrapping quotes/end punctuation, 80-char cap. */
export function sanitizeGeneratedNoteTitle(raw: string): string {
  const firstLine = raw.trim().split(/\r?\n/u)[0] ?? "";
  return firstLine
    .replace(/^["'“”「」『』\s]+|["'“”「」『』\s]+$/gu, "")
    .replace(/[。.!！?？,，;；:：]+$/u, "")
    .trim()
    .slice(0, 80);
}

/** Gives the save modal a useful title even when no local LLM is available. */
export function createDefaultNoteTitle(now = new Date()): string {
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return `Recording ${twoDigits(now.getDate())}/${twoDigits(now.getMonth() + 1)}/${now.getFullYear()}, ${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}`;
}
