import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TrashListResult } from '@shared/types/TrashTypes';
import { ONBOARDING_STEPS } from '../../../onboarding/OnboardingSteps';
import TrashSettingsPanel from './TrashSettingsPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en', resolvedLanguage: 'en' },
    t: (key: string) => key,
  }),
}));

const result: TrashListResult = {
  items: [
    {
      itemType: 'note',
      id: 10,
      name: 'Client note',
      trashedAt: '2026-08-19T10:00:00.000Z',
      originalWorkspaceId: 1,
      originalWorkspaceName: 'Calls',
      preview: 'Call transcript',
    },
    {
      itemType: 'workspace',
      id: 20,
      name: 'Archived project',
      trashedAt: '2026-08-19T09:00:00.000Z',
      noteCount: 3,
      matchedContainedNote: false,
    },
    {
      itemType: 'template',
      id: 30,
      name: 'Decision review',
      trashedAt: '2026-08-19T08:00:00.000Z',
      preview: 'Extract decisions and risks',
      outputCount: 2,
    },
  ],
  page: 1,
  pageSize: 30,
  total: 3,
};

const trashApi = {
  list: jest.fn(),
  count: jest.fn(),
  restore: jest.fn(),
  permanentlyDelete: jest.fn(),
};

function renderPanel(onCountChange = jest.fn()) {
  return {
    onCountChange,
    ...render(
      <MemoryRouter>
        <TrashSettingsPanel onCountChange={onCountChange} />
      </MemoryRouter>,
    ),
  };
}

describe('TrashSettingsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trashApi.list.mockResolvedValue(result);
    trashApi.count.mockResolvedValue(1);
    trashApi.restore.mockResolvedValue({
      itemType: 'note',
      id: 10,
      name: 'Client note',
      workspaceId: 1,
      noteCount: 0,
    });
    trashApi.permanentlyDelete.mockResolvedValue({
      itemType: 'workspace',
      id: 20,
      name: 'Archived project',
      workspaceId: 20,
      noteCount: 3,
    });
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { trash: trashApi },
    });
  });

  it('restores an item immediately and refreshes the count', async () => {
    const { onCountChange } = renderPanel();
    const noteRow = (await screen.findByText('Client note')).closest('article');
    expect(noteRow).not.toBeNull();

    fireEvent.click(
      within(noteRow as HTMLElement).getByRole('button', {
        name: 'trash.action.restore',
      }),
    );

    await waitFor(() =>
      expect(trashApi.restore).toHaveBeenCalledWith({
        id: 10,
        itemType: 'note',
      }),
    );
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(1));
  });

  it('keeps a successful restore successful when only the badge refresh fails', async () => {
    trashApi.count.mockRejectedValue(new Error('count unavailable'));
    renderPanel();
    const noteRow = (await screen.findByText('Client note')).closest('article');

    fireEvent.click(
      within(noteRow as HTMLElement).getByRole('button', {
        name: 'trash.action.restore',
      }),
    );

    expect(await screen.findByText('trash.notice.itemRestored')).toBeVisible();
    await waitFor(() => expect(trashApi.count).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('requires confirmation before permanently deleting a workspace', async () => {
    renderPanel();
    const workspaceRow = (await screen.findByText('Archived project')).closest(
      'article',
    );
    expect(workspaceRow).not.toBeNull();

    fireEvent.click(
      within(workspaceRow as HTMLElement).getByRole('button', {
        name: 'trash.action.permanentlyDelete',
      }),
    );

    expect(trashApi.permanentlyDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('trash.confirm.workspace')).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'trash.action.permanentlyDelete',
      }),
    );

    await waitFor(() =>
      expect(trashApi.permanentlyDelete).toHaveBeenCalledWith({
        id: 20,
        itemType: 'workspace',
      }),
    );
  });

  it('shows templates in the same Trash and warns about saved outputs', async () => {
    trashApi.permanentlyDelete.mockResolvedValue({
      itemType: 'template',
      id: 30,
      name: 'Decision review',
      workspaceId: null,
      noteCount: 0,
    });
    renderPanel();
    const templateRow = (await screen.findByText('Decision review')).closest(
      'article',
    );

    fireEvent.click(
      within(templateRow as HTMLElement).getByRole('button', {
        name: 'trash.action.permanentlyDelete',
      }),
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('trash.confirm.template')).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'trash.action.permanentlyDelete',
      }),
    );
    await waitFor(() =>
      expect(trashApi.permanentlyDelete).toHaveBeenCalledWith({
        id: 30,
        itemType: 'template',
      }),
    );
  });

  it('carries the onboarding anchor the tour points at', async () => {
    // 引导讲回收站时打光在这块面板上（见 onboarding/OnboardingSteps.ts）。
    // 锚点被顺手删掉不会报错，引导只会退化成一张飘在屏幕中央的卡片。
    const target = ONBOARDING_STEPS.find((step) => step.id === 'trash')
      ?.target as string;
    const { container } = renderPanel();
    await waitFor(() => expect(trashApi.list).toHaveBeenCalled());

    expect(container.querySelector(target)).not.toBeNull();
  });
});
