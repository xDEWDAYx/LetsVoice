import { createHash } from 'crypto';
import { Note } from '@shared/entities/Note';
import type { SemanticNoteResult } from '@shared/types/SemanticTypes';
import NoteEmbeddingRepository from '../database/repositories/NoteEmbeddingRepository';
import { NoteRepository } from '../database/repositories/NoteRepository';
import { rankBySimilarity } from './EmbeddingMath';
import OllamaEmbeddingService from './OllamaEmbeddingService';
import {
  buildSemanticPreview,
  composeSemanticNoteText,
  matchesSemanticTerms,
  normalizeSemanticQuery,
  normalizeSemanticTopK,
  normalizeSemanticWorkspaceId,
  semanticEmbeddingText,
} from './SemanticNoteInput';
import SemanticNoteContentRepository from './SemanticNoteContentRepository';

const MAX_INDEXED_NOTES = 200;
const EMBED_BATCH_SIZE = 16;

type Embedder = Pick<OllamaEmbeddingService, 'modelName' | 'embedMany'>;
type ContentProvider = Pick<SemanticNoteContentRepository, 'findAllByNote'>;
type IndexedNote = {
  note: Note;
  embedding: number[];
  searchableText: string;
};

/** 为当前笔记集合增量建立索引，并按余弦相似度返回本地结果。 */
export default class SemanticNoteService {
  private readonly notes: NoteRepository;

  private readonly embeddings: NoteEmbeddingRepository;

  private readonly embedder: Embedder;

  private readonly content: ContentProvider;

  public constructor(
    notes = new NoteRepository(),
    embeddings = new NoteEmbeddingRepository(),
    embedder: Embedder = new OllamaEmbeddingService(),
    content: ContentProvider = new SemanticNoteContentRepository(),
  ) {
    this.notes = notes;
    this.embeddings = embeddings;
    this.embedder = embedder;
    this.content = content;
  }

  public async search(
    rawQuery: unknown,
    rawWorkspaceId: unknown = null,
    rawTopK: unknown = 5,
  ): Promise<SemanticNoteResult[]> {
    const query = normalizeSemanticQuery(rawQuery);
    const workspaceId = normalizeSemanticWorkspaceId(rawWorkspaceId);
    const topK = normalizeSemanticTopK(rawTopK);
    const notes = (
      workspaceId === null
        ? this.notes.findAll()
        : this.notes.findAllByWorkspace(workspaceId)
    ).slice(0, MAX_INDEXED_NOTES);
    if (notes.length === 0) return [];

    const indexed = await this.ensureIndexed(notes);
    const [queryVector] = await this.embedder.embedMany([query]);
    const exactMatches = indexed
      .filter((item) => matchesSemanticTerms(item.searchableText, query))
      .map((item) => ({ ...item, score: 1 }));
    const exactIds = new Set(exactMatches.map((item) => item.note.getId()));
    const semanticMatches = rankBySimilarity(queryVector, indexed, topK).filter(
      (item) => !exactIds.has(item.note.getId()),
    );

    return [...exactMatches, ...semanticMatches].slice(0, topK).map((item) => ({
      id: item.note.getId(),
      workspaceId: item.note.getWorkspaceId(),
      name: item.note.getName() ?? '未命名笔记',
      transcriptPreview: buildSemanticPreview(item.searchableText, query),
      score: item.score,
    }));
  }

  private async ensureIndexed(notes: Note[]): Promise<IndexedNote[]> {
    const indexed: IndexedNote[] = [];
    const pending: Array<{
      note: Note;
      searchableText: string;
      embeddingText: string;
      hash: string;
    }> = [];
    notes.forEach((note) => {
      const searchableText = composeSemanticNoteText(
        note,
        this.content.findAllByNote(note.getId()),
      );
      const hash = createHash('sha256').update(searchableText).digest('hex');
      const stored = this.embeddings.find(
        note.getId(),
        this.embedder.modelName,
      );
      if (stored?.contentHash === hash) {
        indexed.push({
          note,
          embedding: stored.embedding,
          searchableText,
        });
      } else {
        pending.push({
          note,
          searchableText,
          embeddingText: semanticEmbeddingText(searchableText),
          hash,
        });
      }
    });

    for (let offset = 0; offset < pending.length; offset += EMBED_BATCH_SIZE) {
      const batch = pending.slice(offset, offset + EMBED_BATCH_SIZE);
      // 批次之间顺序执行，避免同时占满本地模型内存。
      // eslint-disable-next-line no-await-in-loop
      const vectors = await this.embedder.embedMany(
        batch.map((item) => item.embeddingText),
      );
      batch.forEach((item, index) => {
        const embedding = vectors[index];
        this.embeddings.upsert(
          item.note.getId(),
          this.embedder.modelName,
          embedding,
          item.hash,
        );
        indexed.push({
          note: item.note,
          embedding,
          searchableText: item.searchableText,
        });
      });
    }
    return indexed;
  }
}
