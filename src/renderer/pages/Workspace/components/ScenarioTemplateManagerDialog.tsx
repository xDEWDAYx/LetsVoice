import {
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { KnowledgeTemplateDTO } from '@shared/types/WorkflowTypes';
import ScenarioTemplateForm from './ScenarioTemplateForm';

type Props = {
  onClose: () => void;
  onTemplatesChanged: () => Promise<void> | void;
};

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function ScenarioTemplateManagerDialog({
  onClose,
  onTemplatesChanged,
}: Props) {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith('zh') ? 'zh' : 'en';
  const dateLocale = language === 'zh' ? 'zh-CN' : 'en-US';
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [templates, setTemplates] = useState<KnowledgeTemplateDTO[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null,
  );
  const [editing, setEditing] = useState<KnowledgeTemplateDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busy = formSaving || deletingId !== null;

  const loadTemplates = useCallback(async (preferredId?: number) => {
    const list = (await window.electron.workflow.getKnowledgeTemplateList()) as
      | KnowledgeTemplateDTO[]
      | undefined;
    const next = Array.isArray(list) ? list : [];
    setTemplates(next);
    setSelectedTemplateId((current) => {
      const candidate = preferredId ?? current;
      return candidate && next.some((template) => template.id === candidate)
        ? candidate
        : (next[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.classList.add('workspace-template-manager-open');
    closeRef.current?.focus();
    loadTemplates()
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : t('workspace.scenario.managerLoadError'),
        );
      })
      .finally(() => setLoading(false));
    return () => {
      document.body.classList.remove('workspace-template-manager-open');
      previousFocus?.focus();
    };
  }, [loadTemplates, t]);

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [busy, onClose]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const openForm = (template: KnowledgeTemplateDTO | null) => {
    setEditing(template);
    setFormOpen(true);
    setConfirmDeleteId(null);
    setMessage('');
    setError('');
  };

  const closeForm = () => {
    if (formSaving) return;
    setEditing(null);
    setFormOpen(false);
  };

  const saveTemplate = async (name: string, prompt: string) => {
    const saved = editing
      ? ((await window.electron.workflow.updateKnowledgeTemplate(
          editing.id,
          name,
          prompt,
          language,
        )) as KnowledgeTemplateDTO)
      : ((await window.electron.workflow.createKnowledgeTemplate(
          name,
          prompt,
          language,
        )) as KnowledgeTemplateDTO);
    await loadTemplates(saved.id);
    await onTemplatesChanged();
    setEditing(null);
    setFormOpen(false);
    setMessage(t('workspace.scenario.managerSaved'));
    return saved;
  };

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ??
    templates[0] ??
    null;

  const deleteTemplate = async (template: KnowledgeTemplateDTO) => {
    if (deletingId !== null) return;
    setDeletingId(template.id);
    setError('');
    try {
      await window.electron.trash.moveTemplate(template.id);
      await loadTemplates();
      await onTemplatesChanged();
      setConfirmDeleteId(null);
      setMessage(t('workspace.scenario.managerDeleted'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDeletingId(null);
    }
  };

  let dialogTitle = t('workspace.scenario.managerTitle');
  if (formOpen) {
    dialogTitle = editing
      ? t('workspace.scenario.managerEditTitle')
      : t('workspace.scenario.managerCreateTitle');
  }

  let managerContent: ReactNode;
  if (formOpen) {
    managerContent = (
      <ScenarioTemplateForm
        key={editing?.id ?? 'new'}
        onCancel={closeForm}
        onSavingChange={setFormSaving}
        onSubmit={saveTemplate}
        template={editing}
      />
    );
  } else if (loading) {
    managerContent = (
      <p className="workspace-template-manager-empty" role="status">
        {t('workspace.scenario.managerLoading')}
      </p>
    );
  } else if (templates.length === 0) {
    managerContent = (
      <div className="workspace-template-manager-empty">
        <strong>{t('workspace.scenario.customEmptyTitle')}</strong>
        <span>{t('workspace.scenario.customEmpty')}</span>
        <button
          className="ws-btn ws-btn-primary"
          onClick={() => openForm(null)}
          type="button"
        >
          <Plus size={15} />
          {t('workspace.scenario.createCustom')}
        </button>
      </div>
    );
  } else {
    managerContent = (
      <div className="workspace-template-manager-layout">
        <aside
          aria-label={t('workspace.scenario.managerLibraryLabel')}
          className="workspace-template-library"
        >
          <div className="workspace-template-library-heading">
            <strong>{t('workspace.scenario.customGroup')}</strong>
            <span>
              {t('workspace.scenario.managerCount', {
                count: templates.length,
              })}
            </span>
          </div>
          <div className="workspace-template-library-list">
            {templates.map((template) => {
              const description =
                template.definition?.description ?? template.prompt;
              const selected = template.id === selectedTemplate?.id;
              return (
                <button
                  aria-pressed={selected}
                  className={selected ? 'is-selected' : ''}
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setConfirmDeleteId(null);
                    setMessage('');
                  }}
                  type="button"
                >
                  <span className="workspace-template-library-item-copy">
                    <strong>{template.name}</strong>
                    <span>{description}</span>
                  </span>
                  <ChevronRight aria-hidden="true" size={16} />
                </button>
              );
            })}
          </div>
        </aside>

        {selectedTemplate && (
          <section
            aria-labelledby="workspace-template-detail-title"
            className="workspace-template-detail"
          >
            <header className="workspace-template-detail-head">
              <div className="workspace-template-detail-status">
                <span className="workspace-template-source is-custom">
                  {t('workspace.scenario.custom')}
                </span>
                <span>
                  {selectedTemplate.definition
                    ? t('workflow.card.normalized')
                    : t('workflow.card.legacy')}
                </span>
              </div>
              <h3 id="workspace-template-detail-title">
                {selectedTemplate.name}
              </h3>
              <p>
                {selectedTemplate.definition?.description ??
                  selectedTemplate.prompt}
              </p>
              <time dateTime={selectedTemplate.updatedAt}>
                {t('workflow.card.updatedPrefix')}
                {new Date(selectedTemplate.updatedAt).toLocaleString(
                  dateLocale,
                )}
              </time>
            </header>

            {selectedTemplate.definition ? (
              <section className="workspace-template-detail-sections">
                <div className="workspace-template-detail-section-heading">
                  <h4>{t('workflow.card.sections')}</h4>
                  <span>
                    {t('workspace.scenario.managerSectionCount', {
                      count: selectedTemplate.definition.sections.length,
                    })}
                  </span>
                </div>
                <div className="workspace-template-detail-section-list">
                  {selectedTemplate.definition.sections.map((section) => (
                    <div key={section.key}>
                      <strong>{section.title}</strong>
                      <p>{section.instruction}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <p className="workspace-template-legacy-note">
                {t('workflow.card.legacyHint')}
              </p>
            )}

            <details className="workspace-template-original-request">
              <summary>{t('workflow.card.originalRequest')}</summary>
              <p>{selectedTemplate.prompt}</p>
            </details>

            <footer className="workspace-template-detail-actions">
              {confirmDeleteId === selectedTemplate.id ? (
                <div className="workspace-template-delete-confirm">
                  <span>
                    {t('workspace.scenario.managerDeleteConfirm', {
                      name: selectedTemplate.name,
                    })}
                  </span>
                  <button
                    className="ws-btn"
                    disabled={deletingId === selectedTemplate.id}
                    onClick={() => setConfirmDeleteId(null)}
                    type="button"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    className="ws-btn ws-btn-danger-solid"
                    disabled={deletingId === selectedTemplate.id}
                    onClick={async () => deleteTemplate(selectedTemplate)}
                    type="button"
                  >
                    {deletingId === selectedTemplate.id
                      ? t('workspace.scenario.managerDeleting')
                      : t('workspace.scenario.managerDeleteConfirmButton')}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="ws-btn ws-btn-primary"
                    onClick={() => openForm(selectedTemplate)}
                    type="button"
                  >
                    <Pencil size={14} />
                    {t('workflow.card.editBtn')}
                  </button>
                  <button
                    className="ws-btn ws-btn-danger"
                    onClick={() => {
                      setConfirmDeleteId(selectedTemplate.id);
                      setMessage('');
                    }}
                    type="button"
                  >
                    <Trash2 size={14} />
                    {t('workflow.card.deleteBtn')}
                  </button>
                </>
              )}
            </footer>
          </section>
        )}
      </div>
    );
  }

  return createPortal(
    <div className="workspace-modal-overlay workspace-template-manager-overlay">
      {/* The dialog container owns the Tab focus trap for keyboard users. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        aria-describedby="scenario-template-manager-description"
        aria-labelledby="scenario-template-manager-title"
        aria-modal="true"
        className="workspace-modal workspace-template-manager"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="workspace-modal-head workspace-template-manager-head">
          <div>
            <h2 id="scenario-template-manager-title">{dialogTitle}</h2>
            <p id="scenario-template-manager-description">
              {t('workspace.scenario.managerDescription')}
            </p>
          </div>
          <div className="workspace-template-manager-head-actions">
            {!formOpen && (
              <button
                className="ws-btn ws-btn-primary"
                onClick={() => openForm(null)}
                type="button"
              >
                <Plus size={15} />
                {t('workspace.scenario.createCustom')}
              </button>
            )}
            <button
              aria-label={t('workspace.scenario.managerClose')}
              className="ws-btn ws-btn-quiet workspace-template-manager-close"
              disabled={busy}
              onClick={onClose}
              ref={closeRef}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="workspace-modal-body workspace-template-manager-body">
          {error && (
            <p className="workspace-template-manager-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p
              aria-live="polite"
              className="workspace-template-manager-message"
              role="status"
            >
              {message}
            </p>
          )}
          {managerContent}
        </div>
      </div>
    </div>,
    document.body,
  );
}
