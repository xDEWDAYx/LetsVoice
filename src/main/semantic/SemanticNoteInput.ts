import { Note } from '@shared/entities/Note';

const MAX_EMBED_CHARACTERS = 4_000;
const MAX_PREVIEW_CHARACTERS = 180;

export function composeSemanticNoteText(
  note: Note,
  relatedContent: readonly string[] = [],
): string {
  return [note.getName() ?? '', ...relatedContent, note.getTranscript()]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n');
}

export function semanticEmbeddingText(searchableText: string): string {
  return searchableText.slice(0, MAX_EMBED_CHARACTERS);
}

export function matchesSemanticTerms(text: string, query: string): boolean {
  const normalized = text.toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => normalized.includes(term));
}

export function buildSemanticPreview(text: string, query: string): string {
  const normalized = text.toLocaleLowerCase();
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const firstMatch = terms.reduce((earliest, term) => {
    const index = normalized.indexOf(term);
    if (index < 0) return earliest;
    return earliest < 0 ? index : Math.min(earliest, index);
  }, -1);
  const start = firstMatch < 0 ? 0 : Math.max(0, firstMatch - 45);
  const end = Math.min(text.length, start + MAX_PREVIEW_CHARACTERS);
  const compact = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${compact}${end < text.length ? '…' : ''}`;
}

export function normalizeSemanticQuery(value: unknown): string {
  const query = typeof value === 'string' ? value.trim() : '';
  if (!query) throw new Error('语义搜索内容不能为空');
  return query.slice(0, 500);
}

export function normalizeSemanticWorkspaceId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('无效的工作空间 ID');
  return id;
}

export function normalizeSemanticTopK(value: unknown): number {
  const topK = Number(value);
  return Number.isInteger(topK) ? Math.min(20, Math.max(1, topK)) : 5;
}
