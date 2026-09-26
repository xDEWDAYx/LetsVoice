import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './DailyReminderModal.css';

export type DailyReminderTodo = {
  id: number;
  title: string;
  noteTitle?: string;
  isCompleted: boolean;
};

type DailyReminderModalProps = {
  todos: DailyReminderTodo[];
  onClose(): void;
  onOpenDashboard(): void;
};

export default function DailyReminderModal({
  todos,
  onClose,
  onOpenDashboard,
}: DailyReminderModalProps) {
  const { t } = useTranslation();
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    primaryButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const pendingCount = todos.filter((todo) => !todo.isCompleted).length;

  return (
    <div
      className="daily-reminder-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="daily-reminder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-reminder-title"
        aria-describedby="daily-reminder-description"
      >
        <header className="daily-reminder-header">
          <div className="daily-reminder-heading">
            <span className="daily-reminder-icon" aria-hidden="true">
              📅
            </span>
            <div>
              <span className="daily-reminder-eyebrow">
                {t('dashboard.dailyReminder.eyebrow')}
              </span>
              <h2 id="daily-reminder-title">
                {t('dashboard.dailyReminder.title', { count: todos.length })}
              </h2>
            </div>
          </div>
          <button
            className="daily-reminder-close"
            type="button"
            onClick={onClose}
            aria-label={t('dashboard.dailyReminder.close')}
          >
            ×
          </button>
        </header>

        <p id="daily-reminder-description" className="daily-reminder-summary">
          {t('dashboard.dailyReminder.description', { count: pendingCount })}
        </p>

        <ul className="daily-reminder-list">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={`daily-reminder-item ${
                todo.isCompleted ? 'is-completed' : 'is-pending'
              }`}
            >
              <span className="daily-reminder-state" aria-hidden="true">
                {todo.isCompleted ? '✓' : '!'}
              </span>
              <div className="daily-reminder-item-copy">
                <strong>{todo.title}</strong>
                {todo.noteTitle && (
                  <span>
                    {t('dashboard.dailyReminder.source', {
                      title: todo.noteTitle,
                    })}
                  </span>
                )}
              </div>
              <span className="daily-reminder-status">
                {t(
                  todo.isCompleted
                    ? 'dashboard.dailyReminder.completed'
                    : 'dashboard.dailyReminder.pending',
                )}
              </span>
            </li>
          ))}
        </ul>

        <footer className="daily-reminder-actions">
          <button
            className="daily-reminder-button is-secondary"
            type="button"
            onClick={onClose}
          >
            {t('dashboard.dailyReminder.dismiss')}
          </button>
          <button
            ref={primaryButtonRef}
            className="daily-reminder-button is-primary"
            type="button"
            onClick={onOpenDashboard}
          >
            {t('dashboard.dailyReminder.openDashboard')}
          </button>
        </footer>
      </section>
    </div>
  );
}
