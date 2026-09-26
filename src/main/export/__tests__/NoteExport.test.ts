import { Packer } from 'docx';
import type { NoteExportData } from '../NoteExportData';
import { normalizeExportRequest } from '../ExportService';
import {
  buildNoteExportLayout,
  getNoteExportPlainText,
} from '../NoteExportContent';
import { buildNoteExportHtml } from '../NoteExportHtml';
import { buildNoteExportWordDocument } from '../NoteExportWord';

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  dialog: { showSaveDialog: jest.fn() },
  app: {
    getLocale: () => 'zh-CN',
    getPath: () => 'unused',
  },
}));

const now = '2026-08-23T01:00:00.000Z';
const baseItem = {
  description: null,
  status: 'pending' as const,
  startsAt: null,
  dueAt: null,
  completedAt: null,
  sourceNoteId: 10,
  externalSystem: null,
  externalId: null,
  metadata: {},
};

function createCompleteNote(): NoteExportData {
  return {
    noteId: 10,
    workspaceId: 1,
    workspaceName: '会议',
    title: 'export-title-token',
    transcript: 'transcript-token',
    typeCategory: 'meeting-token',
    audioRelativePath: 'recordings/audio-token.webm',
    isPinned: true,
    createdAt: now,
    updatedAt: now,
    structuredNote: {
      noteId: 10,
      summary: 'summary-token',
      keyPoints: ['key-point-token'],
      tasks: [
        {
          ...baseItem,
          id: 'task',
          title: 'task-token',
          actionItems: [{ ...baseItem, id: 'action', title: 'action-token' }],
        },
      ],
      unassignedActionItems: [
        { ...baseItem, id: 'unassigned', title: 'unassigned-token' },
      ],
      calendarIntents: [
        {
          ...baseItem,
          id: 'reminder',
          title: 'reminder-token',
          kind: 'reminder',
          endsAt: null,
          remindAt: null,
          allDay: false,
          timezone: 'Europe/London',
        },
        {
          ...baseItem,
          id: 'calendar',
          title: 'calendar-token',
          kind: 'calendar',
          endsAt: null,
          remindAt: null,
          allDay: false,
          timezone: 'Europe/London',
        },
      ],
      modelId: 'structured-model-token',
      createdAt: now,
      updatedAt: now,
    },
    scenarioKnowledge: {
      noteId: 10,
      scenario: null,
      templateId: 7,
      templateName: 'scenario-template-token',
      templateSource: 'custom',
      sections: [
        {
          key: 'agenda',
          title: 'scenario-heading-token',
          items: ['scenario-item-token'],
        },
      ],
      modelId: 'scenario-model-token',
      createdAt: now,
      updatedAt: now,
    },
    subnotes: [
      {
        id: 1,
        contentType: 'note',
        content: 'subnote-token',
        createdAt: now,
      },
    ],
    knowledgeOutputs: [
      {
        id: 1,
        templateName: 'legacy-template-token',
        contentType: 'markdown',
        content: 'legacy-output-token',
        createdAt: now,
        updatedAt: now,
      },
    ],
    todos: [
      {
        id: 1,
        title: 'todo-token',
        dateString: 'tomorrow-token',
        isCompleted: false,
        isPinned: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    conversations: [
      {
        id: 1,
        name: 'conversation-token',
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: 1,
            role: 'assistant',
            content: 'message-token',
            createdAt: now,
          },
        ],
      },
    ],
  };
}

describe('完整笔记导出', () => {
  it('只接受有效的笔记、工作空间与格式', () => {
    expect(
      normalizeExportRequest({ workspaceId: 1, noteId: 10, format: 'word' }),
    ).toEqual({ workspaceId: 1, noteId: 10, format: 'word' });
    expect(() =>
      normalizeExportRequest({ workspaceId: 1, noteId: 0, format: 'pdf' }),
    ).toThrow('Invalid note ID');
    expect(() =>
      normalizeExportRequest({ workspaceId: 1, noteId: 10, format: 'txt' }),
    ).toThrow('Unsupported export format');
  });

  it('把每类笔记内容交给 Word 与 PDF 共用的完整档案版式', async () => {
    const layout = buildNoteExportLayout(
      createCompleteNote(),
      'zh',
      new Date('2026-08-23T02:00:00.000Z'),
    );
    const plainText = getNoteExportPlainText(layout);
    const html = buildNoteExportHtml(layout);
    const requiredTokens = [
      'export-title-token',
      'transcript-token',
      'meeting-token',
      'audio-token.webm',
      'summary-token',
      'key-point-token',
      'task-token',
      'action-token',
      'unassigned-token',
      'reminder-token',
      'calendar-token',
      'scenario-template-token',
      'scenario-heading-token',
      'scenario-item-token',
      'todo-token',
      'subnote-token',
      'legacy-template-token',
      'legacy-output-token',
      'conversation-token',
      'message-token',
    ];

    requiredTokens.forEach((token) => {
      expect(plainText).toContain(token);
      expect(html).toContain(token);
    });

    const wordBuffer = await Packer.toBuffer(
      buildNoteExportWordDocument(layout),
    );
    expect(wordBuffer.byteLength).toBeGreaterThan(5_000);
  });
});
