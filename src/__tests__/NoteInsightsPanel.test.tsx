import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  NoteKnowledgeBundle,
  ScenarioTemplateOption,
} from '@shared/types/KnowledgeGenerationTypes';
import type { KnowledgeTemplateDTO } from '@shared/types/WorkflowTypes';
import NoteInsightsPanel from '../renderer/pages/Workspace/components/NoteInsightsPanel';

const mockTranslatedLabels: Record<string, string> = {
  'workspace.scenario.builtin': 'Built-in',
  'workspace.scenario.custom': 'Custom',
  'workspace.scenario.builtinGroup': 'Built-in templates',
  'workspace.scenario.builtinHint': 'Maintained templates.',
  'workspace.scenario.customGroup': 'Your templates',
  'workspace.scenario.customHint': 'Your reusable templates.',
  'workspace.scenario.managerTitle': 'Manage custom templates',
  'workspace.scenario.managerDescription': 'Manage without leaving this note.',
  'workspace.scenario.managerClose': 'Close template manager',
  'workspace.scenario.managerLoading': 'Loading your templates…',
  'workflow.card.updatedPrefix': 'Updated at ',
  'workflow.card.normalized': 'AI-normalized structure',
  'workflow.card.legacy': 'Legacy template',
  'workflow.card.editBtn': 'Edit',
  'workflow.card.deleteBtn': 'Delete',
  'workflow.form.nameLabel': 'Template Name',
  'workflow.form.promptLabel': 'Requirements',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en' },
    t: (key: string, fallback?: string) =>
      typeof fallback === 'string'
        ? fallback
        : (mockTranslatedLabels[key] ?? key),
  }),
}));

const bundle: NoteKnowledgeBundle = {
  structuredNote: null,
  scenario: null,
  structuredNoteState: { status: 'idle' },
  scenarioState: { status: 'idle' },
};

const options: ScenarioTemplateOption[] = [
  {
    key: 'builtin:general',
    source: 'builtin',
    scenario: 'general',
    templateId: null,
    name: 'General',
    description: 'General supporting knowledge.',
    sections: [
      {
        key: 'context',
        title: 'Context',
        instruction: 'Keep explicit context only.',
      },
      {
        key: 'details',
        title: 'Details',
        instruction: 'Keep concrete supporting details only.',
      },
    ],
    isNormalized: true,
    updatedAt: null,
  },
  {
    key: 'custom:9',
    source: 'custom',
    scenario: null,
    templateId: 9,
    name: 'Customer Research',
    description: 'Customer pains and direct evidence.',
    sections: [
      {
        key: 'painPoints',
        title: 'Pain Points',
        instruction: 'Keep explicit pain points only.',
      },
      {
        key: 'quotes',
        title: 'Quotes',
        instruction: 'Keep attributed quotes only.',
      },
    ],
    isNormalized: true,
    updatedAt: '2026-08-23T10:00:00.000Z',
  },
];
const customTemplate: KnowledgeTemplateDTO = {
  id: 9,
  name: 'Customer Research',
  prompt: 'Keep pains and attributed quotes.',
  definition: {
    description: 'Customer pains and direct evidence.',
    sections: options[1].sections,
  },
  normalizedAt: '2026-08-23T10:00:00.000Z',
  createdAt: '2026-08-23T10:00:00.000Z',
  updatedAt: '2026-08-23T10:00:00.000Z',
};
const defaultElectron = window.electron;

describe('NoteInsightsPanel scenario templates', () => {
  afterEach(() => {
    Object.defineProperty(window, 'electron', {
      configurable: true,
      writable: true,
      value: defaultElectron,
    });
  });

  it('shows built-in and custom templates together and sends the custom identity', async () => {
    const generate = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'electron', {
      configurable: true,
      writable: true,
      value: {
        knowledge: {
          get: jest.fn().mockResolvedValue(bundle),
          generateScenario: generate,
          generateStructuredNote: jest.fn(),
          toggleTask: jest.fn(),
        },
        workflow: {
          getScenarioTemplateList: jest.fn().mockResolvedValue(options),
          getKnowledgeTemplateList: jest
            .fn()
            .mockResolvedValue([customTemplate]),
          createKnowledgeTemplate: jest.fn(),
        },
      } as unknown as typeof window.electron,
    });

    render(
      <MemoryRouter>
        <NoteInsightsPanel hasTranscript noteId={42} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Built-in templates')).toBeInTheDocument();
    expect(screen.getByText('Your templates')).toBeInTheDocument();
    expect(screen.queryByText('Generate Knowledge')).not.toBeInTheDocument();
    const builtInGroup = screen
      .getByText('Built-in templates')
      .closest('details');
    const customGroup = screen.getByText('Your templates').closest('details');
    expect(builtInGroup).not.toHaveAttribute('open');
    expect(customGroup).not.toHaveAttribute('open');
    expect(
      screen.queryByRole('button', { name: 'Create custom' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Your templates').closest('summary')!);
    expect(customGroup).toHaveAttribute('open');
    fireEvent.click(
      (await screen.findByText('Customer Research')).closest('button')!,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() =>
      expect(generate).toHaveBeenCalledWith(
        42,
        {
          source: 'custom',
          templateId: 9,
        },
        'en',
      ),
    );
  });

  it('opens template management as a dialog on the current page', async () => {
    let resolveManagedTemplates: (
      value: KnowledgeTemplateDTO[],
    ) => void = () => {};
    const managedTemplates = new Promise<KnowledgeTemplateDTO[]>((resolve) => {
      resolveManagedTemplates = resolve;
    });
    Object.defineProperty(window, 'electron', {
      configurable: true,
      writable: true,
      value: {
        knowledge: {
          get: jest.fn().mockResolvedValue(bundle),
          generateScenario: jest.fn(),
          generateStructuredNote: jest.fn(),
          toggleTask: jest.fn(),
        },
        workflow: {
          getScenarioTemplateList: jest.fn().mockResolvedValue(options),
          getKnowledgeTemplateList: jest.fn().mockReturnValue(managedTemplates),
          createKnowledgeTemplate: jest.fn(),
          updateKnowledgeTemplate: jest.fn(),
          deleteKnowledgeTemplate: jest.fn(),
        },
      } as unknown as typeof window.electron,
    });

    render(
      <MemoryRouter>
        <NoteInsightsPanel hasTranscript noteId={42} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Built-in templates')).toBeInTheDocument();
    const manageButton = screen.getByRole('button', {
      name: 'Manage templates',
    });
    expect(
      screen.queryByRole('link', { name: 'Manage templates' }),
    ).not.toBeInTheDocument();
    fireEvent.click(manageButton);

    const dialog = await screen.findByRole('dialog');
    expect(document.body).toHaveClass('workspace-template-manager-open');
    expect(
      dialog.closest('.workspace-template-manager-overlay')?.parentElement,
    ).toBe(document.body);
    expect(
      within(dialog).getByText('Manage custom templates'),
    ).toBeInTheDocument();
    await act(async () => {
      resolveManagedTemplates([customTemplate]);
      await managedTemplates;
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });
    expect(
      await within(dialog).findByRole('heading', {
        name: 'Customer Research',
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(dialog).queryByText('Loading your templates…'),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    expect(
      within(dialog).getByDisplayValue('Customer Research'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByDisplayValue('Keep pains and attributed quotes.'),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Close template manager',
      }),
    );
    await waitFor(() =>
      expect(document.body).not.toHaveClass('workspace-template-manager-open'),
    );
  });
});
