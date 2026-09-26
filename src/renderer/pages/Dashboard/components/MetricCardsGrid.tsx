import React from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardStatistics } from '../models/DashboardStatistics';

interface MetricCardsGridProps {
  stats: DashboardStatistics;
  isPinnedFilterActive: boolean;
  onTogglePinnedFilter: () => void;
  isTodoFilterActive: boolean;
  onToggleTodoFilter: () => void;
}

export const MetricCardsGrid: React.FC<MetricCardsGridProps> = ({
  stats,
  isPinnedFilterActive,
  onTogglePinnedFilter,
  isTodoFilterActive,
  onToggleTodoFilter,
}) => {
  const { t } = useTranslation();

  return (
    <section className="metric-cards-grid">
      {/* 🔵 Card 1: Total Notes */}
      <div className="metric-card card-blue">
        <div className="card-icon-wrapper icon-blue">📄</div>
        <div className="card-content">
          <div className="card-value">{stats.getTotalNotesCount()}</div>
          <div className="card-label">{t('dashboard.metric.totalNotes')}</div>
          <div className="card-trend trend-positive">
            {t('dashboard.metric.weeklyDelta', {
              delta: stats.getRecentNotesCount(),
            })}
          </div>
        </div>
      </div>

      {/* 🟢 Card 2: Pinned Notes (Interactive Filter Shortcut) */}
      <button
        type="button"
        aria-pressed={isPinnedFilterActive}
        className={`btn-plain metric-card card-green interactive-card ${isPinnedFilterActive ? 'active-filter' : ''}`}
        onClick={onTogglePinnedFilter}
        title={t('dashboard.metric.pinnedFilter.tooltip')}
      >
        <div className="card-icon-wrapper icon-green">📌</div>
        <div className="card-content">
          <div className="card-value">{stats.getPinnedNotesCount()}</div>
          <div className="card-label">{t('dashboard.metric.pinnedNotes')}</div>
          <div className="card-trend trend-neutral">
            {isPinnedFilterActive
              ? t('dashboard.metric.pinnedFilter.active')
              : t('dashboard.metric.pinnedFilter.hint')}
          </div>
        </div>
      </button>

      {/* 🟣 Card 3: Transcribed Total Words (Static Display) */}
      <div className="metric-card card-brass static-card">
        <div className="card-icon-wrapper icon-brass">📝</div>
        <div className="card-content">
          <div className="card-value">
            {stats.getTotalTranscribedWordCount().toLocaleString()}
          </div>
          <div className="card-label">
            {t('dashboard.metric.transcribedWords')}
          </div>
          <div className="card-trend trend-positive">
            {t('dashboard.metric.weeklyDelta', {
              delta: stats.getRecentTranscribedWordCount().toLocaleString(),
            })}
          </div>
        </div>
      </div>

      {/* 🟠 Card 4: Pending ToDos (Interactive Filter Shortcut) */}
      <button
        type="button"
        aria-pressed={isTodoFilterActive}
        className={`btn-plain metric-card card-orange interactive-card ${isTodoFilterActive ? 'active-filter-orange' : ''}`}
        onClick={onToggleTodoFilter}
        title={t('dashboard.metric.todoFilter.tooltip')}
      >
        <div className="card-icon-wrapper icon-orange">📅</div>
        <div className="card-content">
          <div className="card-value">{stats.getPendingTodosCount()}</div>
          <div className="card-label">{t('dashboard.metric.pendingTodos')}</div>
          <div className="card-trend trend-warning">
            {isTodoFilterActive
              ? t('dashboard.metric.todoFilter.active')
              : t('dashboard.metric.todoFilter.hint')}
          </div>
        </div>
      </button>
    </section>
  );
};
