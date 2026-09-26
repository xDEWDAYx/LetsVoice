import { NOTE_CATEGORY_LABELS } from "@/constants/note-categories";
import type { Note } from "@/domain/note/note";
import type { NoteSearchCorpus } from "@/repositories/note-repository";
import { markdownToPlainText } from "@/services/safe-markdown";

export type NoteMatchSource = "Title" | "Transcript" | "Structured Note" | "Knowledge" | "Ask AI" | "Category";
export type NoteInsightSearchSection = "summary" | "key-points" | "tasks";

export type NoteSearchResult = {
  note: Note;
  score: number;
  source: NoteMatchSource;
  excerpt: string;
  resourceTitle?: string;
  insightSection?: NoteInsightSearchSection;
  knowledgeResultId?: string;
  conversationId?: string;
};

type Field = {
  source: NoteMatchSource;
  text: string;
  resourceTitle?: string;
  insightSection?: NoteInsightSearchSection;
  knowledgeResultId?: string;
  conversationId?: string;
};

const INSIGHT_SECTION_LABELS: Record<NoteInsightSearchSection, string> = {
  summary: "Summary",
  "key-points": "Key points",
  tasks: "Tasks",
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function termsFor(query: string): string[] {
  const normalized = normalize(query);
  const split = normalized.split(/\s+/).filter(Boolean);
  if (split.length > 1 || !/[\p{Script=Han}]/u.test(normalized)) return split;
  if (normalized.length <= 2) return [normalized];
  return [normalized, ...Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2))];
}

function boundedEditDistance(left: string, right: string, limit: number): number | null {
  if (Math.abs(left.length - right.length) > limit) return null;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return null;
    previous = current;
  }
  return previous[right.length] <= limit ? previous[right.length] : null;
}

function fuzzyContains(text: string, query: string): boolean {
  const compactText = normalize(text).replace(/\s/g, "");
  const compactQuery = normalize(query).replace(/\s/g, "");
  if (compactQuery.length < 3) return false;
  const limit = compactQuery.length <= 6 ? 1 : 2;
  for (let size = compactQuery.length - limit; size <= compactQuery.length + limit; size += 1) {
    if (size <= 0) continue;
    for (let index = 0; index + size <= compactText.length; index += 1) {
      if (boundedEditDistance(compactQuery, compactText.slice(index, index + size), limit) !== null) return true;
    }
  }
  return false;
}

function excerptFor(text: string, query: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 180) return clean;
  const index = normalize(clean).indexOf(normalize(query));
  const start = Math.max(0, (index >= 0 ? index : 0) - 60);
  const end = Math.min(clean.length, start + 180);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

function fieldsFor(entry: NoteSearchCorpus): Field[] {
  return [
    { source: "Title", text: entry.note.getName() ?? "" },
    { source: "Transcript", text: entry.note.getTranscript() },
    ...entry.structuredSections.map((section) => ({
      source: "Structured Note" as const,
      text: section.text,
      resourceTitle: INSIGHT_SECTION_LABELS[section.section],
      insightSection: section.section,
    })),
    ...entry.knowledgeResults.map((result) => ({
      source: "Knowledge" as const,
      text: result.text,
      resourceTitle: result.title,
      knowledgeResultId: result.id,
    })),
    ...entry.conversations.map((conversation) => ({
      source: "Ask AI" as const,
      text: markdownToPlainText(conversation.text),
      resourceTitle: conversation.title,
      conversationId: conversation.id,
    })),
    { source: "Category", text: NOTE_CATEGORY_LABELS[entry.note.getCategory()] },
  ];
}

function scoreField(field: Field, phrase: string, terms: readonly string[]): number {
  const text = normalize(field.text);
  if (!text) return 0;
  const isTitle = field.source === "Title";
  if (text.includes(phrase)) return isTitle ? 500 : 300;
  if (terms.every((term) => text.includes(term))) return isTitle ? 400 : 200;
  return fuzzyContains(field.text, phrase) ? (isTitle ? 150 : 100) : 0;
}

function matchesForEntry(entry: NoteSearchCorpus, phrase: string, terms: readonly string[]): NoteSearchResult[] {
  return fieldsFor(entry).flatMap((field) => {
    const score = scoreField(field, phrase, terms);
    return score === 0 ? [] : [{
      note: entry.note,
      score,
      source: field.source,
      excerpt: excerptFor(field.text, phrase),
      resourceTitle: field.resourceTitle,
      insightSection: field.insightSection,
      knowledgeResultId: field.knowledgeResultId,
      conversationId: field.conversationId,
    }];
  }).sort((left, right) => right.score - left.score);
}

function sortResults(results: NoteSearchResult[]): NoteSearchResult[] {
  return results.sort((left, right) =>
    right.score - left.score ||
    Number(right.note.getIsPinned()) - Number(left.note.getIsPinned()) ||
    right.note.getUpdatedAt().localeCompare(left.note.getUpdatedAt()),
  );
}

export function noteSearchDestinationKey(result: NoteSearchResult): string {
  if (result.conversationId) return `conversation:${result.conversationId}`;
  if (result.knowledgeResultId) return `knowledge:${result.knowledgeResultId}`;
  if (result.source === "Structured Note") {
    return `structured:${result.note.getId()}:${result.insightSection ?? "summary"}`;
  }
  return `note:${result.note.getId()}`;
}

export function uniqueNoteSearchDestinations(results: readonly NoteSearchResult[]): NoteSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = noteSearchDestinationKey(result);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function searchNoteResourceCorpus(corpus: readonly NoteSearchCorpus[], query: string): NoteSearchResult[] {
  const phrase = normalize(query);
  if (!phrase) return [];
  const terms = termsFor(phrase);
  const matches = corpus.flatMap((entry) => matchesForEntry(entry, phrase, terms));
  const strongMatches = matches.filter((result) => result.score >= 200);
  return sortResults(strongMatches.length > 0 ? strongMatches : matches);
}

export function searchNoteCorpus(corpus: readonly NoteSearchCorpus[], query: string): NoteSearchResult[] {
  const phrase = normalize(query);
  if (!phrase) return [];
  const terms = termsFor(phrase);
  const matches = corpus.flatMap((entry) => matchesForEntry(entry, phrase, terms).slice(0, 1));
  const strongMatches = matches.filter((result) => result.score >= 200);
  return sortResults(strongMatches.length > 0 ? strongMatches : matches);
}
