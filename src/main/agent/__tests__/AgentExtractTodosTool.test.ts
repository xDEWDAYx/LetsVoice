import { Note } from '@shared/entities/Note';
import createAgentExtractTodosTool from '../AgentExtractTodosTool';
import { AgentContext } from '../AgentTypes';

const GLOBAL_CONTEXT: AgentContext = { workspaceId: null };

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

function buildTool(
  extracted = true,
  saved = [{ title: '交周报', dateString: '2026-08-20' }],
) {
  const notes = [makeNote(7, 42)];
  const source = {
    findAll: () => notes,
    findAllByWorkspace: () => notes,
    findById: (id: number) => notes.find((n) => n.getId() === id) ?? null,
  };
  const extractor = {
    extractTodosForNote: jest.fn().mockResolvedValue(extracted),
  };
  const todos = {
    getTodosByNoteId: jest.fn().mockReturnValue(
      saved.map((todo, index) => ({
        id: index + 1,
        noteId: 7,
        title: todo.title,
        dateString: todo.dateString,
        isCompleted: false,
      })),
    ),
  };
  return {
    tool: createAgentExtractTodosTool(source, extractor, todos),
    extractor,
    todos,
  };
}

describe('createAgentExtractTodosTool', () => {
  it('跑一次提取并把落库后的待办读回来', async () => {
    const { tool, extractor } = buildTool();

    const result = JSON.parse(await tool.run({ note_id: 7 }, GLOBAL_CONTEXT));

    expect(extractor.extractTodosForNote).toHaveBeenCalledWith(7);
    expect(result.extracted).toBe(true);
    expect(result.todos).toEqual([
      { title: '交周报', dueDate: '2026-08-20', completed: false },
    ]);
  });

  it('提取失败时仍返回库里已有的待办，并带上提示', async () => {
    const { tool } = buildTool(false);

    const result = JSON.parse(await tool.run({ note_id: 7 }, GLOBAL_CONTEXT));

    expect(result.extracted).toBe(false);
    expect(result.hint).toContain('Extraction failed');
    expect(result.todos).toHaveLength(1);
  });

  it('拒绝无效的笔记 ID', async () => {
    const { tool, extractor } = buildTool();

    await expect(tool.run({ note_id: 0 }, GLOBAL_CONTEXT)).rejects.toThrow();
    expect(extractor.extractTodosForNote).not.toHaveBeenCalled();
  });

  it('限定了工作区时拒绝跨区提取', async () => {
    const { tool, extractor } = buildTool();

    await expect(
      tool.run({ note_id: 7 }, { workspaceId: 1 }),
    ).rejects.toThrow();
    expect(extractor.extractTodosForNote).not.toHaveBeenCalled();
  });

  it('有关联笔记时拒绝给范围外的笔记提取待办', async () => {
    const { tool, extractor } = buildTool();

    await expect(
      tool.run({ note_id: 7 }, { workspaceId: null, linkedNoteIds: [9] }),
    ).rejects.toThrow('当前笔记范围');
    expect(extractor.extractTodosForNote).not.toHaveBeenCalled();
  });
});
