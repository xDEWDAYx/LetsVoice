import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import AskAINotePreview from '../renderer/pages/AskAI/components/AskAINotePreview';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const item = {
  id: 'item-1',
  title: '发送会议纪要',
  description: null,
  status: 'pending' as const,
  startsAt: null,
  dueAt: null,
  completedAt: null,
  sourceNoteId: 7,
  externalSystem: null,
  externalId: null,
  metadata: {},
};

describe('Ask AI note preview', () => {
  it('loads and displays the saved Structured Note', async () => {
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        knowledge: {
          get: jest.fn().mockResolvedValue({
            structuredNote: {
              noteId: 7,
              summary: '讨论了下次站会安排。',
              keyPoints: ['站会可能晚点开始'],
              tasks: [{ ...item, actionItems: [] }],
              unassignedActionItems: [
                { ...item, id: 'action-1', title: '确认时间' },
              ],
              calendarIntents: [
                {
                  ...item,
                  id: 'calendar-1',
                  title: '下次站会',
                  kind: 'calendar',
                },
              ],
              modelId: 'local-model',
              createdAt: '2026-08-22T20:00:00.000Z',
              updatedAt: '2026-08-22T20:00:00.000Z',
            },
            scenario: null,
            structuredNoteState: { status: 'completed' },
            scenarioState: { status: 'idle' },
          }),
        },
      },
      writable: true,
    });

    render(
      <AskAINotePreview
        note={{
          id: 7,
          workspaceId: 1,
          name: 'Next Standup',
          transcript: '明天的 Stand Up 可能会晚点。',
          transcriptPreview: '明天的 Stand Up…',
          updatedAt: '2026-08-22T20:00:00.000Z',
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('讨论了下次站会安排。')).toBeInTheDocument(),
    );
    expect(screen.getByText('站会可能晚点开始')).toBeInTheDocument();
    expect(screen.getByText('发送会议纪要')).toBeInTheDocument();
    expect(screen.getByText('确认时间')).toBeInTheDocument();
    expect(screen.getByText('下次站会')).toBeInTheDocument();
    expect(
      screen.queryByText('askAI.preview.structuredNoteTitle'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('askAI.preview.noStructuredNote'),
    ).not.toBeInTheDocument();
  });
});
