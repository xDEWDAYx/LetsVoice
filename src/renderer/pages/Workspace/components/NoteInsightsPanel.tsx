/* eslint-disable no-void, no-use-before-define, react/no-array-index-key, one-var, jsx-a11y/label-has-associated-control */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Copy,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type {
  StructuredNote,
  NoteKnowledgeBundle,
  ScenarioTemplateOption,
  ScenarioTemplateSelection,
} from '@shared/types/KnowledgeGenerationTypes';
import ScenarioTemplateManagerDialog from './ScenarioTemplateManagerDialog';

const emptyBundle: NoteKnowledgeBundle = {
  structuredNote: null,
  scenario: null,
  structuredNoteState: { status: 'idle' },
  scenarioState: { status: 'idle' },
};
const busy = (s: string) => s === 'queued' || s === 'generating';
const selectionKey = (selection: ScenarioTemplateSelection) =>
  selection.source === 'builtin'
    ? `builtin:${selection.scenario}`
    : `custom:${selection.templateId}`;
const optionSelection = (
  option: ScenarioTemplateOption,
): ScenarioTemplateSelection =>
  option.source === 'builtin'
    ? { source: 'builtin', scenario: option.scenario! }
    : { source: 'custom', templateId: option.templateId! };
const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export default function NoteInsightsPanel({
  noteId,
  hasTranscript,
}: {
  noteId: number;
  hasTranscript: boolean;
}) {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith('zh') ? 'zh' : 'en';
  const dateLocale = language === 'zh' ? 'zh-CN' : 'en-US';
  const [data, setData] = useState<NoteKnowledgeBundle>(emptyBundle);
  const [templates, setTemplates] = useState<ScenarioTemplateOption[]>([]);
  const [selection, setSelection] = useState<ScenarioTemplateSelection>({
    source: 'builtin',
    scenario: 'general',
  });
  const [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [managingTemplates, setManagingTemplates] = useState(false);
  const [runningKind, setRunningKind] = useState<
    'structured-note' | 'scenario' | null
  >(null);
  const load = useCallback(async () => {
    try {
      setData(
        (await window.electron.knowledge.get(noteId)) as NoteKnowledgeBundle,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [noteId]);
  const loadTemplates = useCallback(async () => {
    try {
      const list = (await window.electron.workflow.getScenarioTemplateList(
        language,
      )) as ScenarioTemplateOption[] | undefined;
      const next = Array.isArray(list) ? list : [];
      setTemplates(next);
      setSelection((current) =>
        next.some((option) => option.key === selectionKey(current))
          ? current
          : { source: 'builtin', scenario: 'general' },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [language]);
  useEffect(() => {
    void load();
    void loadTemplates();
  }, [load, loadTemplates]);
  useEffect(() => {
    const listener = () => void load();
    window.addEventListener('knowledge-task-updated', listener);
    return () => window.removeEventListener('knowledge-task-updated', listener);
  }, [load]);
  useEffect(() => {
    if (
      !runningKind &&
      !busy(data.structuredNoteState.status) &&
      !busy(data.scenarioState.status)
    )
      return undefined;
    const timer = setInterval(() => void load(), 700);
    return () => clearInterval(timer);
  }, [
    data.structuredNoteState.status,
    data.scenarioState.status,
    load,
    runningKind,
  ]);
  const run = async (kind: 'structured-note' | 'scenario') => {
    setError('');
    setRunningKind(kind);
    try {
      if (kind === 'structured-note')
        await window.electron.knowledge.generateStructuredNote(noteId);
      else
        await window.electron.knowledge.generateScenario(
          noteId,
          selection,
          language,
        );
      setChoosing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      await load();
      setRunningKind(null);
    }
  };
  const copy = async () => {
    if (!data.structuredNote) return;
    const { html, text } = format(data.structuredNote, {
      title: t('workspace.structured.title'),
      summary: t('workspace.structured.summary'),
      keyPoints: t('workspace.structured.keyPoints'),
      tasks: t('workspace.structured.tasks'),
      reminders: t('workspace.structured.reminders'),
      calendar: t('workspace.structured.calendar'),
    });
    try {
      if (typeof ClipboardItem !== 'undefined')
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      else await navigator.clipboard.writeText(text);
    } catch {
      await navigator.clipboard.writeText(text);
    }
  };
  let scenarioGenerateLabel = t('workspace.scenario.generate', 'Generate');
  if (data.scenario) {
    scenarioGenerateLabel = t('workspace.scenario.regenerate', 'Regenerate');
  }
  if (runningKind === 'scenario') {
    scenarioGenerateLabel = t('workspace.scenario.generating', 'Generating…');
  }
  const builtInTemplates = templates.filter((x) => x.source === 'builtin');
  const customTemplates = templates.filter((x) => x.source === 'custom');
  const selectedKey = selectionKey(selection);
  const persistedTemplate = data.scenario
    ? templates.find((option) =>
        data.scenario?.templateSource === 'custom'
          ? option.source === 'custom' &&
            option.templateId === data.scenario.templateId
          : option.source === 'builtin' &&
            option.scenario === data.scenario?.scenario,
      )
    : null;
  const persistedTemplateSource =
    data.scenario?.templateSource || persistedTemplate?.source || 'builtin';
  const persistedTemplateName =
    (persistedTemplateSource === 'builtin' ? persistedTemplate?.name : null) ||
    data.scenario?.templateName ||
    persistedTemplate?.name ||
    data.scenario?.scenario ||
    '';
  const localizedScenarioSections =
    data.scenario?.sections.map((section) => ({
      ...section,
      title:
        persistedTemplateSource === 'builtin'
          ? (persistedTemplate?.sections.find(
              (definition) => definition.key === section.key,
            )?.title ?? section.title)
          : section.title,
    })) ?? [];
  const showingScenarioPicker = choosing || !data.scenario;
  return (
    <section className="workspace-insights-panel">
      <div className="workspace-insights-column">
        <header>
          <h3>
            <Sparkles size={17} /> {t('workspace.structured.title')}
          </h3>
          {data.structuredNote && (
            <button
              className="ws-btn ws-btn-quiet"
              onClick={() => void copy()}
              type="button"
            >
              <Copy size={14} /> {t('workspace.structured.copy')}
            </button>
          )}
        </header>
        {!hasTranscript && (
          <p className="workspace-insight-error">
            {t('workspace.knowledge.transcriptRequired')}
          </p>
        )}
        {data.structuredNoteState.status === 'failed' && (
          <p className="workspace-insight-error">
            {data.structuredNoteState.message}
          </p>
        )}
        {(runningKind === 'structured-note' ||
          busy(data.structuredNoteState.status)) && (
          <p
            aria-live="polite"
            className="workspace-generation-state"
            role="status"
          >
            <RefreshCw
              aria-hidden="true"
              className="workspace-generation-spinner"
              size={15}
            />
            {data.structuredNoteState.status === 'generating'
              ? t('workspace.structured.generatingLocal')
              : t('workspace.knowledge.waitingLocalAI')}
          </p>
        )}
        {!data.structuredNote ? (
          <button
            className="ws-btn ws-btn-primary"
            disabled={
              !hasTranscript ||
              runningKind !== null ||
              busy(data.structuredNoteState.status)
            }
            onClick={() => void run('structured-note')}
            type="button"
          >
            {runningKind === 'structured-note'
              ? t('workspace.structured.generating')
              : t('workspace.structured.generate')}
          </button>
        ) : (
          <>
            <StructuredNoteResult value={data.structuredNote} />
            <button
              className="ws-btn ws-btn-quiet"
              disabled={
                runningKind !== null || busy(data.structuredNoteState.status)
              }
              onClick={() => void run('structured-note')}
              type="button"
            >
              <RefreshCw
                className={
                  runningKind === 'structured-note'
                    ? 'workspace-generation-spinner'
                    : ''
                }
                size={14}
              />{' '}
              {runningKind === 'structured-note'
                ? t('workspace.structured.regenerating')
                : t('workspace.structured.regenerate')}
            </button>
          </>
        )}
      </div>
      <div className="workspace-insights-column">
        <header>
          <h3>{t('workspace.scenario.title')}</h3>
          {data.scenario && (
            <span
              className={`workspace-scenario-badge is-${persistedTemplateSource}`}
            >
              <span>
                {persistedTemplateSource === 'custom'
                  ? t('workspace.scenario.custom', 'Custom')
                  : t('workspace.scenario.builtin', 'Built-in')}
              </span>
              {persistedTemplateName}
            </span>
          )}
        </header>
        {data.scenarioState.status === 'failed' && (
          <p className="workspace-insight-error">
            {data.scenarioState.message}
          </p>
        )}
        {(runningKind === 'scenario' || busy(data.scenarioState.status)) && (
          <p
            aria-live="polite"
            className="workspace-generation-state"
            role="status"
          >
            <RefreshCw
              aria-hidden="true"
              className="workspace-generation-spinner"
              size={15}
            />
            {data.scenarioState.status === 'generating'
              ? t('workspace.scenario.generatingLocal')
              : t('workspace.knowledge.waitingLocalAI')}
          </p>
        )}
        {showingScenarioPicker && (
          <div className="workspace-scenario-picker">
            <div className="workspace-scenario-groups">
              <details className="workspace-scenario-group">
                <summary>
                  <span className="workspace-scenario-group-copy">
                    <strong>{t('workspace.scenario.builtinGroup')}</strong>
                    <span>{t('workspace.scenario.builtinHint')}</span>
                  </span>
                  <span className="workspace-scenario-group-meta">
                    <span className="workspace-template-source is-builtin">
                      {t('workspace.scenario.builtin')}
                    </span>
                    <span className="workspace-scenario-group-count">
                      {t('workspace.scenario.templateCount', {
                        count: builtInTemplates.length,
                      })}
                    </span>
                    <ChevronDown aria-hidden="true" size={17} />
                  </span>
                </summary>
                <div className="workspace-scenario-group-content">
                  <div className="workspace-scenario-options">
                    {builtInTemplates.map((option) => (
                      <TemplateOption
                        key={option.key}
                        option={option}
                        selected={selectedKey === option.key}
                        sourceLabel={t('workspace.scenario.builtin')}
                        onSelect={() => setSelection(optionSelection(option))}
                      />
                    ))}
                  </div>
                </div>
              </details>

              <details className="workspace-scenario-group">
                <summary>
                  <span className="workspace-scenario-group-copy">
                    <strong>{t('workspace.scenario.customGroup')}</strong>
                    <span>{t('workspace.scenario.customHint')}</span>
                  </span>
                  <span className="workspace-scenario-group-meta">
                    <span className="workspace-template-source is-custom">
                      {t('workspace.scenario.custom')}
                    </span>
                    <span className="workspace-scenario-group-count">
                      {t('workspace.scenario.templateCount', {
                        count: customTemplates.length,
                      })}
                    </span>
                    <ChevronDown aria-hidden="true" size={17} />
                  </span>
                </summary>
                <div className="workspace-scenario-group-content">
                  {customTemplates.length ? (
                    <div className="workspace-scenario-options">
                      {customTemplates.map((option) => (
                        <TemplateOption
                          key={option.key}
                          option={option}
                          selected={selectedKey === option.key}
                          sourceLabel={t('workspace.scenario.custom')}
                          onSelect={() => setSelection(optionSelection(option))}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="workspace-scenario-empty">
                      {t('workspace.scenario.customEmpty')}
                    </p>
                  )}
                </div>
              </details>
            </div>
            <div className="workspace-scenario-actions">
              <button
                className="ws-btn ws-btn-quiet"
                onClick={() => setManagingTemplates(true)}
                type="button"
              >
                <Settings2 size={14} />
                {t('workspace.scenario.manageCustom', 'Manage templates')}
              </button>
              {data.scenario && (
                <button
                  className="ws-btn"
                  disabled={runningKind !== null}
                  onClick={() => setChoosing(false)}
                  type="button"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              )}
              <button
                className="ws-btn ws-btn-primary"
                disabled={
                  !hasTranscript ||
                  runningKind !== null ||
                  busy(data.scenarioState.status)
                }
                onClick={() => void run('scenario')}
                type="button"
              >
                {scenarioGenerateLabel}
              </button>
            </div>
          </div>
        )}
        {!showingScenarioPicker && data.scenario && (
          <>
            <div className="workspace-scenario-result">
              {localizedScenarioSections
                .filter((s) => s.items.length)
                .map((s) => (
                  <section key={s.key}>
                    <h4>{s.title}</h4>
                    <ul>
                      {s.items.map((x, i) => (
                        <li key={`${s.key}-${i}`}>{x}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              {localizedScenarioSections.every((s) => !s.items.length) && (
                <p className="workspace-content-empty">
                  {t('workspace.scenario.noSupportedInformation')}
                </p>
              )}
              <small>
                {t('workspace.knowledge.generatedLocally')} ·{' '}
                {new Date(data.scenario.updatedAt).toLocaleString(dateLocale)}
              </small>
            </div>
            <button
              className="ws-btn ws-btn-quiet"
              disabled={runningKind !== null}
              onClick={() => setChoosing(true)}
              type="button"
            >
              {t('workspace.scenario.generateAgain', 'Generate Again')}
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="workspace-insight-error workspace-insight-wide">
          {error}
        </p>
      )}
      {managingTemplates && (
        <ScenarioTemplateManagerDialog
          onClose={() => setManagingTemplates(false)}
          onTemplatesChanged={loadTemplates}
        />
      )}
    </section>
  );
}
function TemplateOption({
  option,
  selected,
  sourceLabel,
  onSelect,
}: {
  option: ScenarioTemplateOption;
  selected: boolean;
  sourceLabel: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={selected ? 'selected' : ''}
      onClick={onSelect}
      type="button"
    >
      <span className={`workspace-template-source is-${option.source}`}>
        {sourceLabel}
      </span>
      <strong>{option.name}</strong>
      <span>{option.description}</span>
      <small>
        {option.sections.map((section) => section.title).join(' · ')}
      </small>
    </button>
  );
}
function StructuredNoteResult({ value }: { value: StructuredNote }) {
  const { i18n, t } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith('zh')
    ? 'zh-CN'
    : 'en-US';
  const reminders = value.calendarIntents.filter((x) => x.kind === 'reminder'),
    events = value.calendarIntents.filter((x) => x.kind === 'calendar');
  return (
    <div className="workspace-structured-note-result">
      <Block title={t('workspace.structured.summary')}>
        {value.summary || t('workspace.structured.noSummary')}
      </Block>
      <Block title={t('workspace.structured.keyPoints')}>
        <List
          emptyLabel={t('workspace.structured.noItems')}
          items={value.keyPoints}
        />
      </Block>
      <Block title={t('workspace.structured.tasks')}>
        {value.tasks.length
          ? value.tasks.map((task) => (
              <label className="workspace-task" key={task.id}>
                <input
                  checked={task.status === 'completed'}
                  onChange={async (e) => {
                    await window.electron.knowledge.toggleTask(
                      value.noteId,
                      task.id,
                      e.target.checked,
                    );
                    window.dispatchEvent(
                      new CustomEvent('knowledge-task-updated'),
                    );
                  }}
                  type="checkbox"
                />
                <span className={task.status === 'completed' ? 'done' : ''}>
                  <strong>{task.title}</strong>
                  {task.description && <span>{task.description}</span>}
                  {task.actionItems.length > 0 && (
                    <ol>
                      {task.actionItems.map((a) => (
                        <li key={a.id}>{a.title}</li>
                      ))}
                    </ol>
                  )}
                </span>
              </label>
            ))
          : t('workspace.structured.noTasks')}
      </Block>
      <Block title={t('workspace.structured.reminders')}>
        <List
          emptyLabel={t('workspace.structured.noItems')}
          items={reminders.map((x) => x.title)}
        />
      </Block>
      <Block title={t('workspace.structured.calendar')}>
        <List
          emptyLabel={t('workspace.structured.noItems')}
          items={events.map((x) => x.title)}
        />
      </Block>
      <small>
        {t('workspace.knowledge.generatedLocally')} ·{' '}
        {new Date(value.updatedAt).toLocaleString(dateLocale)}
      </small>
    </div>
  );
}
function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4>{title}</h4>
      {children}
    </section>
  );
}
function List({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (!items.length) return emptyLabel;
  return (
    <ul>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

type StructuredNoteCopyLabels = {
  title: string;
  summary: string;
  keyPoints: string;
  tasks: string;
  reminders: string;
  calendar: string;
};

function format(v: StructuredNote, labels: StructuredNoteCopyLabels) {
  const list = (a: string[]) => a.map((x) => `- ${x}`).join('\n');
  const text = `${labels.title}\n\n${labels.summary}\n${v.summary}\n\n${labels.keyPoints}\n${list(v.keyPoints)}\n\n${labels.tasks}\n${v.tasks.map((t) => `- [${t.status === 'completed' ? 'x' : ' '}] ${t.title}${t.actionItems.map((a) => `\n  - ${a.title}`).join('')}`).join('\n')}\n\n${labels.reminders}\n${list(v.calendarIntents.filter((x) => x.kind === 'reminder').map((x) => x.title))}\n\n${labels.calendar}\n${list(v.calendarIntents.filter((x) => x.kind === 'calendar').map((x) => x.title))}`;
  const html = `<article><h1>${escape(labels.title)}</h1><h2>${escape(labels.summary)}</h2><p>${escape(v.summary)}</p><h2>${escape(labels.keyPoints)}</h2><ul>${v.keyPoints.map((x) => `<li>${escape(x)}</li>`).join('')}</ul><h2>${escape(labels.tasks)}</h2><ul>${v.tasks.map((t) => `<li><strong>${escape(t.title)}</strong><ul>${t.actionItems.map((a) => `<li>${escape(a.title)}</li>`).join('')}</ul></li>`).join('')}</ul></article>`;
  return { html, text };
}
