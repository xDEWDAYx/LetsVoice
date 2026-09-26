import { Note } from '@shared/entities/Note';
import type { SemanticNoteResult } from '@shared/types/SemanticTypes';
import createAgentSearchNotesTool from '../AgentSearchNotesTool';
import { AgentContext } from '../AgentTypes';

const CONTEXT: AgentContext = { workspaceId: 1 };

function makeNote(id: number, name: string, transcript: string): Note {
  const now = new Date();
  return new Note(id, 1, name, null, transcript, false, null, now, now);
}

function makeSemantic(id: number, score: number): SemanticNoteResult {
  return {
    id,
    workspaceId: 1,
    name: `note-${id}`,
    transcriptPreview: `preview-${id}`,
    score,
  };
}

function buildTool(notes: Note[], semanticResults: SemanticNoteResult[]) {
  const source = {
    findAll: () => notes,
    findAllByWorkspace: () => notes,
    findById: (id: number) => notes.find((n) => n.getId() === id) ?? null,
  };
  const semantic = { search: jest.fn().mockResolvedValue(semanticResults) };
  return { tool: createAgentSearchNotesTool(source, semantic), semantic };
}

async function runSearch(
  tool: ReturnType<typeof createAgentSearchNotesTool>,
  query: string,
) {
  return JSON.parse(await tool.run({ query }, CONTEXT));
}

describe('createAgentSearchNotesTool（混合检索）', () => {
  it('关键词命中时依然会跑语义检索，两路结果一起返回', async () => {
    const notes = [
      makeNote(1, '天气记录', '今天布里斯托的天气'),
      makeNote(2, '气温预报', '明天气温下降'),
    ];
    // 笔记 2 字面不含「天气」，只能靠语义召回
    const { tool, semantic } = buildTool(notes, [makeSemantic(2, 0.8)]);

    const result = await runSearch(tool, '天气');

    expect(semantic.search).toHaveBeenCalled();
    expect(result.match).toBe('hybrid');
    expect(result.notes.map((n: { id: number }) => n.id).sort()).toEqual([
      1, 2,
    ]);
  });

  it('两路都命中的笔记排在只命中一路的前面', async () => {
    const notes = [
      makeNote(1, '只有关键词', '包含天气两个字'),
      makeNote(2, '两路都命中', '天气很好'),
    ];
    // 语义只召回笔记 2 → 笔记 2 同时被两路命中
    const { tool } = buildTool(notes, [makeSemantic(2, 0.9)]);

    const result = await runSearch(tool, '天气');

    expect(result.notes[0].id).toBe(2);
    expect(result.notes[0].match).toBe('keyword+semantic');
    expect(result.notes[1].match).toBe('keyword');
  });

  it('语义检索不可用时退化为纯关键词，不抛错', async () => {
    const notes = [makeNote(1, '天气记录', '今天的天气')];
    const source = {
      findAll: () => notes,
      findAllByWorkspace: () => notes,
      findById: (id: number) => notes.find((n) => n.getId() === id) ?? null,
    };
    const semantic = {
      search: jest.fn().mockRejectedValue(new Error('ollama down')),
    };
    const tool = createAgentSearchNotesTool(source, semantic);

    const result = JSON.parse(await tool.run({ query: '天气' }, CONTEXT));

    expect(result.match).toBe('hybrid');
    expect(result.notes).toHaveLength(1);
    expect(result.semanticUnavailable).toBe('ollama down');
  });

  it('两路都没结果时返回 none', async () => {
    const notes = [makeNote(1, '无关', '完全无关的内容')];
    const { tool } = buildTool(notes, []);

    const result = await runSearch(tool, '天气');

    expect(result.match).toBe('none');
    expect(result.notes).toEqual([]);
  });

  it('有关联笔记时过滤掉语义检索返回的范围外结果', async () => {
    const notes = [
      makeNote(1, '已关联笔记', '站会内容'),
      makeNote(2, '范围外笔记', '银行内容'),
    ];
    const { tool } = buildTool(notes, [makeSemantic(2, 0.99)]);

    const result = JSON.parse(
      await tool.run(
        { query: '银行' },
        { workspaceId: null, linkedNoteIds: [1] },
      ),
    );

    expect(result.notes.map((note: { id: number }) => note.id)).toEqual([1]);
  });
});
