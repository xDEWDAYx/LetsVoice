import type { SemanticNoteResult } from '@shared/types/SemanticTypes';
import { Note } from '@shared/entities/Note';
import SemanticNoteService from '../semantic/SemanticNoteService';
import {
  AgentNoteSource,
  listScopedAgentNotes,
  previewNoteText,
  serializeAgentNote,
} from './AgentNoteToolSupport';
import { throwIfAgentAborted } from './AgentRunSupport';
import { AgentTool } from './AgentTypes';

const MAX_KEYWORD_NOTES = 100;
const MAX_RESULTS = 8;
const SEMANTIC_TOP_K = 8;

/**
 * RRF（Reciprocal Rank Fusion）常数。取值越大，越淡化排名靠前的优势。
 * 60 是检索领域的常用默认值。
 */
const RRF_K = 60;

type SemanticSearch = Pick<SemanticNoteService, 'search'>;

type FusedEntry = {
  id: number;
  score: number;
  matchedBy: Set<'keyword' | 'semantic'>;
  note?: Note;
  semantic?: SemanticNoteResult;
};

/**
 * 把一路检索结果按名次累加进融合表：名次越靠前得分越高，
 * 同时出现在两路里的笔记会自然拿到更高的总分。
 */
function fuse(
  table: Map<number, FusedEntry>,
  ids: number[],
  source: 'keyword' | 'semantic',
  attach: (entry: FusedEntry, id: number) => void,
): void {
  ids.forEach((id, rank) => {
    const existing = table.get(id);
    const entry: FusedEntry = existing ?? {
      id,
      score: 0,
      matchedBy: new Set(),
    };
    entry.score += 1 / (RRF_K + rank + 1);
    entry.matchedBy.add(source);
    attach(entry, id);
    if (!existing) table.set(id, entry);
  });
}

/**
 * 用户手动挂上的笔记：无论检索是否命中都带上并标成 linked。
 * 有关联笔记时，上游候选集和语义结果都会被限制在这些笔记内。
 */
function listLinkedNotes(
  notes: AgentNoteSource,
  linkedNoteIds: number[] | undefined,
): Record<string, unknown>[] {
  return (linkedNoteIds ?? [])
    .map((id) => notes.findById(id))
    .filter((note): note is Note => note !== null && note !== undefined)
    .map((note) => ({ ...serializeAgentNote(note), match: 'linked' }));
}

function serializeFused(entry: FusedEntry): Record<string, unknown> {
  const base = entry.note
    ? serializeAgentNote(entry.note)
    : {
        id: entry.id,
        workspaceId: entry.semantic?.workspaceId ?? null,
        name: entry.semantic?.name ?? `Note ${entry.id}`,
        transcriptPreview: previewNoteText(
          entry.semantic?.transcriptPreview ?? '',
        ),
      };

  return {
    ...base,
    // 让模型知道这条是怎么被找到的：两路都命中通常更可信。
    match: [...entry.matchedBy].sort().join('+'),
    score: Number(entry.score.toFixed(4)),
    ...(entry.semantic
      ? { similarity: Number(entry.semantic.score.toFixed(3)) }
      : {}),
  };
}

/** 挂上的笔记排在最前，其余结果去掉与之重复的条目。 */
function withLinkedFirst(
  linked: Record<string, unknown>[],
  found: Record<string, unknown>[],
): Record<string, unknown>[] {
  const linkedIds = new Set(linked.map((note) => note.id));
  return [...linked, ...found.filter((note) => !linkedIds.has(note.id))];
}

/**
 * 混合检索：关键词与向量语义两路都跑，再用 RRF 融合排序。
 * 两路都命中的笔记会排到前面；本地向量模型不可用时自动退化为纯关键词。
 */
export default function createAgentSearchNotesTool(
  notes: AgentNoteSource,
  semantic: SemanticSearch,
): AgentTool {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'search_notes',
        description:
          'Search every saved note the user has, across all workspaces. Omit query to list recent notes.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keywords or meaning.' },
          },
        },
      },
    },
    run: async (args, context, signal) => {
      const query = String(args.query || '')
        .trim()
        .slice(0, 200);
      const candidates = listScopedAgentNotes(notes, context).slice(
        0,
        MAX_KEYWORD_NOTES,
      );
      const linked = listLinkedNotes(notes, context.linkedNoteIds);
      if (!query) {
        return JSON.stringify({
          match: 'recent',
          notes: withLinkedFirst(
            linked,
            candidates.slice(0, MAX_RESULTS).map(serializeAgentNote),
          ),
        });
      }

      // 两路并行：关键词是同步的，语义检索失败不影响整体结果。
      const term = query.toLocaleLowerCase();
      const keywordMatches = candidates.filter((note) =>
        `${note.getName() || ''}\n${note.getTranscript()}`
          .toLocaleLowerCase()
          .includes(term),
      );

      // 向量检索要走本地嵌入模型，是这里唯一的长耗时环节。
      throwIfAgentAborted(signal);
      let semanticMatches: SemanticNoteResult[] = [];
      let semanticError: string | null = null;
      try {
        semanticMatches = await semantic.search(
          query,
          context.workspaceId,
          SEMANTIC_TOP_K,
        );
        // 手动关联存在时，即使语义索引返回全库结果，也不能越出用户范围。
        if ((context.linkedNoteIds ?? []).length > 0) {
          const scopedIds = new Set(candidates.map((note) => note.getId()));
          semanticMatches = semanticMatches.filter((result) =>
            scopedIds.has(result.id),
          );
        }
      } catch (error) {
        semanticError = error instanceof Error ? error.message : String(error);
      }
      throwIfAgentAborted(signal);

      const table = new Map<number, FusedEntry>();
      const noteById = new Map(keywordMatches.map((n) => [n.getId(), n]));
      const semanticById = new Map(semanticMatches.map((r) => [r.id, r]));

      fuse(
        table,
        keywordMatches.map((note) => note.getId()),
        'keyword',
        (entry, id) => {
          entry.note = noteById.get(id);
        },
      );
      fuse(
        table,
        semanticMatches.map((result) => result.id),
        'semantic',
        (entry, id) => {
          entry.semantic = semanticById.get(id);
          // 语义命中但不在关键词候选里时，补全笔记正文用于预览。
          if (!entry.note) entry.note = notes.findById(id) ?? undefined;
        },
      );

      const fused = [...table.values()]
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_RESULTS);

      if (fused.length === 0) {
        return JSON.stringify({
          match: linked.length > 0 ? 'linked' : 'none',
          notes: linked,
          hint: semanticError
            ? 'No keyword match. Semantic search is unavailable.'
            : 'No matching notes among the saved notes.',
          ...(semanticError ? { error: semanticError } : {}),
        });
      }

      return JSON.stringify({
        match: 'hybrid',
        notes: withLinkedFirst(linked, fused.map(serializeFused)),
        ...(semanticError ? { semanticUnavailable: semanticError } : {}),
      });
    },
  };
}
