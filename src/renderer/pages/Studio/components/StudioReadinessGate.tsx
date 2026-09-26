import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { StudioReadiness } from '../useStudioReadiness';

const COMPONENT_LABELS: Record<string, string> = {
  stt: 'studio.readiness.component.stt',
  tts: 'studio.readiness.component.tts',
  llm: 'studio.readiness.component.llm',
  embedding: 'studio.readiness.component.embedding',
  runtime: 'studio.readiness.component.runtime',
};

/**
 * 组件没配齐时挡在对话工作台前面的页面。
 * 逐项列出缺什么、为什么缺，并直接给出去模型管理的入口，
 * 避免用户一路用下去才在某个功能上撞见静默失败。
 */
export default function StudioReadinessGate({
  readiness,
}: {
  readiness: StudioReadiness;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (readiness.loading) {
    return (
      <section className="studio-gate">
        <div className="studio-gate-loading" role="status">
          <span className="app-spinner" aria-hidden="true" />
          <span>{t('studio.readiness.checking')}</span>
          <small>{t('studio.readiness.checkingHint')}</small>
        </div>
      </section>
    );
  }

  const missingCount = readiness.components.filter(
    (item) => !item.ready,
  ).length;

  return (
    <section className="studio-gate">
      <div className="studio-gate-card">
        <span className="studio-gate-eyebrow">
          {t('studio.readiness.eyebrow')}
        </span>
        <h1>{t('studio.readiness.title')}</h1>
        <p>
          {readiness.error
            ? t('studio.readiness.checkFailed')
            : t('studio.readiness.desc', { count: missingCount })}
        </p>

        {readiness.error && (
          <p className="studio-gate-error" role="alert">
            {readiness.error}
          </p>
        )}

        <ul className="studio-gate-list">
          {readiness.components.map((item) => (
            <li
              key={item.id}
              className={item.ready ? 'is-ready' : 'is-missing'}
            >
              <span className="studio-gate-mark" aria-hidden="true">
                {item.ready ? '✓' : '!'}
              </span>
              <span>
                <strong>{t(COMPONENT_LABELS[item.id] ?? item.id)}</strong>
                <small>
                  {item.ready
                    ? t('studio.readiness.stateReady')
                    : t(item.reasonKey)}
                </small>
              </span>
            </li>
          ))}
        </ul>

        <div className="studio-gate-actions">
          <button type="button" onClick={() => navigate('/ModelManagement')}>
            {t('studio.readiness.goToModels')}
          </button>
          <button
            type="button"
            className="studio-gate-secondary"
            onClick={readiness.refresh}
          >
            {t('studio.readiness.recheck')}
          </button>
        </div>
      </div>
    </section>
  );
}
