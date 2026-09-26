export const NOTE_CATEGORY_KEYS = [
  "meeting",
  "personal",
  "idea",
  "learning",
  "general",
  "uncategorized",
] as const;

export type NoteCategory = (typeof NOTE_CATEGORY_KEYS)[number];

export const CLASSIFIABLE_NOTE_CATEGORIES = NOTE_CATEGORY_KEYS.slice(0, 5) as readonly Exclude<
  NoteCategory,
  "uncategorized"
>[];

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  meeting: "Meeting",
  personal: "Personal",
  idea: "Idea",
  learning: "Learning",
  general: "General",
  uncategorized: "Uncategorized",
};

export const CATEGORY_INPUT_LIMIT = 1_200;

export function isNoteCategory(value: string): value is NoteCategory {
  return NOTE_CATEGORY_KEYS.includes(value as NoteCategory);
}

export function buildCategoryPrompt(transcript: string): string {
  const excerpt = transcript.trim().slice(0, CATEGORY_INPUT_LIMIT);
  return `You classify a voice note into EXACTLY ONE category.
Answer with the category id only — one lowercase word, nothing else.

CATEGORIES
- meeting  : a discussion involving other people at work — meetings, reviews,
             stand-ups, client calls, task hand-outs to teammates, decisions
             made together. Third-person names doing work are a strong signal.
- personal : the speaker talking to themselves about their own life or errands —
             reminders, appointments, shopping, bills, paperwork, health, travel.
             First person, no colleagues involved.
- idea     : brainstorming, product or content ideas, "what if we…", drafts of a
             plan that is still being invented rather than reported.
- learning : notes taken while studying — lectures, tutorials, books, papers,
             technical explanations the speaker is recording to remember.
- general  : anything that does not clearly fit the four above — questions,
             greetings, one-liners, short fragments, and plain logging of facts.

RULES
1. Pick the dominant purpose of the note as a whole, not a single sentence.
2. Containing to-dos does NOT decide the category; decide by WHO the note is about.
3. Merely naming another person does not make a note a meeting.
4. A factual question is general; learning records an explanation.
5. When two categories are equally plausible, prefer the specific one over general.
6. Output one of: meeting | personal | idea | learning | general
   No punctuation, explanation, quotes, or markdown.

Note:
"""
${excerpt}
"""`;
}

export function parseCategory(raw: string): Exclude<NoteCategory, "uncategorized"> | null {
  const text = (raw ?? "").toLocaleLowerCase();
  const hits = CLASSIFIABLE_NOTE_CATEGORIES.filter((key) =>
    new RegExp(String.raw`\b${key}\b`).test(text),
  );
  return hits.length === 1 ? hits[0] : null;
}
