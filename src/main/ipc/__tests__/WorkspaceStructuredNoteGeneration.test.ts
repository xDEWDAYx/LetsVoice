const mockState = {
  handle: jest.fn(),
  saveTranscriptionNote: jest.fn(),
  saveStructuredNoteDraft: jest.fn(),
};

jest.mock('electron', () => ({
  ipcMain: {
    handle: (...args: unknown[]) => mockState.handle(...args),
  },
}));

jest.mock('../../workspace/WorkspaceService', () => ({
  WorkspaceService: jest.fn().mockImplementation(() => ({
    saveTranscriptionNote: (...args: unknown[]) =>
      mockState.saveTranscriptionNote(...args),
  })),
}));

jest.mock('../../knowledge/KnowledgeGenerationService', () => ({
  knowledgeGenerationService: {
    saveStructuredNoteDraft: (...args: unknown[]) =>
      mockState.saveStructuredNoteDraft(...args),
  },
}));

type SaveHandler = (event: unknown, request: unknown) => unknown;

describe('Workspace 保存笔记后自动生成 Structured Note', () => {
  let saveHandler: SaveHandler;

  beforeAll(() => {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    require('../workspace-ipc');
    saveHandler = mockState.handle.mock.calls.find(
      ([channel]) => channel === 'Workspace:saveTranscriptionNote',
    )?.[1] as SaveHandler;
  });

  beforeEach(() => {
    mockState.saveTranscriptionNote.mockReset();
    mockState.saveStructuredNoteDraft.mockReset();
  });

  it('笔记落库后把已完成的 Structured Note 草稿绑定到 noteId', () => {
    const saved = { noteId: 42, workspaceId: 3, name: '会议' };
    const draft = {
      summary: '会议摘要',
      keyPoints: [],
      tasks: [],
      unassignedActionItems: [],
      calendarIntents: [],
      modelId: 'local-model',
      createdAt: '2026-08-22T10:00:00.000Z',
      updatedAt: '2026-08-22T10:00:00.000Z',
    };
    mockState.saveTranscriptionNote.mockReturnValue(saved);

    const result = saveHandler(null, {
      transcript: '会议内容',
      structuredNoteDraft: draft,
    });

    expect(result).toBe(saved);
    expect(mockState.saveStructuredNoteDraft).toHaveBeenCalledWith(42, draft);
  });

  it('普通手写笔记没有草稿时不写 Structured Note', () => {
    const saved = { noteId: 44, workspaceId: 3, name: '手写笔记' };
    mockState.saveTranscriptionNote.mockReturnValue(saved);

    expect(saveHandler(null, { transcript: '手写内容' })).toBe(saved);
    expect(mockState.saveStructuredNoteDraft).not.toHaveBeenCalled();
  });
});
