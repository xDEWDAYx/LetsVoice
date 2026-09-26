import { Note } from '@shared/entities/Note';
import createAgentReadNoteTool from '../AgentReadNoteTool';
import createAgentSearchNotesTool from '../AgentSearchNotesTool';
import normalizeAgentRequest from '../AgentInput';
import { AgentContext } from '../AgentTypes';

function makeNote(id: number, workspaceId: number | null): Note {
  const now = new Date();
  return new Note(
    id,
    workspaceId,
    `note-${id}`,
    null,
    'body',
    false,
    null,
    now,
    now,
  );
}

describe('不限定工作区（workspaceId 为 null）时的行为', () => {
  it('normalizeAgentRequest 接受空工作区而不再报错', () => {
    const request = normalizeAgentRequest({ instruction: '找一下天气' });
    expect(request.workspaceId).toBeNull();
  });

  it('仍然拒绝非法的工作区 ID', () => {
    expect(() =>
      normalizeAgentRequest({ instruction: '找一下', workspaceId: -3 }),
    ).toThrow();
  });

  it('read_note 在不限定工作区时可以读取任意工作区的笔记', async () => {
    const notes = [makeNote(7, 42)];
    const tool = createAgentReadNoteTool({
      findAll: () => notes,
      findAllByWorkspace: () => notes,
      findById: (id: number) => notes.find((n) => n.getId() === id) ?? null,
    });

    const context: AgentContext = { workspaceId: null };
    const result = JSON.parse(await tool.run({ note_id: 7 }, context));

    expect(result.id).toBe(7);
    expect(result.workspaceId).toBe(42);
  });

  it('有关联笔记时拒绝读取范围外的笔记', async () => {
    const notes = [makeNote(7, 42), makeNote(9, 77)];
    const tool = createAgentReadNoteTool({
      findAll: () => notes,
      findAllByWorkspace: () => notes,
      findById: (id: number) => notes.find((n) => n.getId() === id) ?? null,
    });

    await expect(
      tool.run({ note_id: 9 }, { workspaceId: null, linkedNoteIds: [7] }),
    ).rejects.toThrow('当前笔记范围');
  });

  it('挂上的笔记成为检索范围，不返回其他笔记', async () => {
    const notes = [
      makeNote(1, 42), // 关键词命中
      makeNote(9, 77), // 另一个工作区里被手动挂上的笔记
    ];
    const source = {
      findAll: () => notes,
      findAllByWorkspace: () => [],
      findById: (id: number) => notes.find((n) => n.getId() === id) ?? null,
    };
    const tool = createAgentSearchNotesTool(source, {
      search: jest.fn().mockResolvedValue([]),
    });

    const result = JSON.parse(
      await tool.run(
        { query: 'body' },
        { workspaceId: null, linkedNoteIds: [9] },
      ),
    );

    expect(result.notes.map((note: { id: number }) => note.id)).toEqual([9]);
    expect(result.notes[0].match).toBe('linked');
  });

  it('挂上的笔记不会因为检索没命中就丢失', async () => {
    const notes = [makeNote(9, 77)];
    const source = {
      findAll: () => notes,
      findAllByWorkspace: () => [],
      findById: (id: number) => notes.find((n) => n.getId() === id) ?? null,
    };
    const tool = createAgentSearchNotesTool(source, {
      search: jest.fn().mockResolvedValue([]),
    });

    const result = JSON.parse(
      await tool.run(
        { query: '完全对不上的词' },
        { workspaceId: null, linkedNoteIds: [9] },
      ),
    );

    expect(result.match).toBe('linked');
    expect(result.notes.map((note: { id: number }) => note.id)).toEqual([9]);
  });

  it('normalizeAgentRequest 会清洗挂载的笔记 ID', () => {
    const request = normalizeAgentRequest({
      instruction: '找一下',
      linkedNoteIds: [3, 3, -1, 'x', 7],
    });

    expect(request.linkedNoteIds).toEqual([3, 7]);
  });

  it('限定了工作区时仍然拒绝跨区读取', async () => {
    const notes = [makeNote(7, 42)];
    const tool = createAgentReadNoteTool({
      findAll: () => notes,
      findAllByWorkspace: () => notes,
      findById: (id: number) => notes.find((n) => n.getId() === id) ?? null,
    });

    await expect(
      tool.run({ note_id: 7 }, { workspaceId: 1 }),
    ).rejects.toThrow();
  });
});
