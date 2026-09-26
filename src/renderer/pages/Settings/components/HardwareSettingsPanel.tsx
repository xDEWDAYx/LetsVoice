import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type {
  ModelRecommendationResult,
  SystemProfile,
} from '@shared/types/ModelRecommendationTypes';

/** 主进程返回的档位是中文枚举，这里映射成翻译键和 CSS 用的英文类名。 */
const LEVELS: Record<
  SystemProfile['level'],
  { labelKey: string; slug: string }
> = {
  入门: { labelKey: 'settings.hardware.level.entry', slug: 'entry' },
  均衡: { labelKey: 'settings.hardware.level.balanced', slug: 'balanced' },
  高性能: { labelKey: 'settings.hardware.level.high', slug: 'high' },
};

/** 展示本机 CPU、内存、显卡和存储，供用户判断该选哪一档模型。 */
export default function HardwareSettingsPanel() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<SystemProfile | null>(null);
  const [recommendation, setRecommendation] =
    useState<ModelRecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // forceRefresh 只在用户点「重新检测」时为 true：首次挂载走主进程缓存，
  // 否则每次打开设置页都要重跑一遍好几秒的显卡探测。
  const detect = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError('');
      try {
        // 手动刷新先使主进程的显卡缓存失效。推荐接口随后复用这次
        // 探测结果，不会再启动一组 nvidia-smi / WMI 子进程。
        if (forceRefresh) {
          const refreshed =
            (await window.electron.recommendation.getSystemProfile(true)) as
              | SystemProfile
              | undefined;
          if (refreshed) setProfile(refreshed);
        }

        const [sttModels, llmModels] = await Promise.all([
          window.electron.modelManagement.getModelList('stt'),
          window.electron.modelManagement.getModelList('llm'),
        ]);
        const next = (await window.electron.recommendation.getModels(
          sttModels,
          llmModels,
        )) as ModelRecommendationResult | undefined;

        if (!next) throw new Error(t('settings.hardware.recommendation.error'));
        setProfile(next.profile);
        setRecommendation(next);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : t('settings.hardware.error'),
        );
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    detect();
  }, [detect]);

  const unknown = t('settings.hardware.unknown');

  // 有几块显卡就列几行；一块都没探测到时保留一行提示未检测到。
  const gpuRows =
    profile && profile.gpus.length > 0
      ? profile.gpus.map((gpu, index) => ({
          key: `gpu-${index}`,
          glyph: '◈',
          label:
            index === 0
              ? t('settings.hardware.gpu')
              : `${t('settings.hardware.gpu')} ${index + 1}`,
          value: gpu.name,
          detail: [
            gpu.vramGb ? `${gpu.vramGb} GB` : '',
            gpu.virtual ? t('settings.hardware.gpu.virtual') : '',
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      : [
          {
            key: 'gpu-0',
            glyph: '◈',
            label: t('settings.hardware.gpu'),
            value: unknown,
            detail: '',
          },
        ];

  const cudaRow = {
    key: 'cuda',
    glyph: '⚡',
    label: t('settings.hardware.cuda'),
    value: profile?.cuda.available
      ? `CUDA ${profile.cuda.version ?? ''}`.trim()
      : t('settings.hardware.cuda.unavailable'),
    detail:
      profile?.cuda.available && profile.cuda.driverVersion
        ? `${t('settings.hardware.driver')} ${profile.cuda.driverVersion}`
        : '',
  };

  const rows = [
    {
      key: 'cpu',
      glyph: '⌘',
      label: t('settings.hardware.cpu'),
      value: profile?.cpuModel ?? unknown,
      detail: profile
        ? t('settings.hardware.cores', { count: profile.logicalCores })
        : '',
    },
    {
      key: 'memory',
      glyph: '▤',
      label: t('settings.hardware.memory'),
      value: profile ? `${profile.totalMemoryGb} GB` : unknown,
      detail: profile
        ? `${profile.availableMemoryGb} GB ${t('settings.hardware.free')}`
        : '',
    },
    ...gpuRows,
    cudaRow,
    {
      key: 'storage',
      glyph: '⬒',
      label: t('settings.hardware.storage'),
      value: profile?.storage ? `${profile.storage.totalGb} GB` : unknown,
      detail: profile?.storage
        ? `${profile.storage.freeGb} GB ${t('settings.hardware.free')}`
        : '',
    },
    {
      key: 'system',
      glyph: '❖',
      label: t('settings.hardware.system'),
      value: profile ? `${profile.platform} · ${profile.arch}` : unknown,
      detail: '',
    },
  ];

  return (
    <section className="settings-panel" aria-labelledby="hardware-title">
      <div className="settings-panel-heading">
        <span className="settings-panel-icon hardware-icon" aria-hidden="true">
          ▣
        </span>
        <div>
          <h2 id="hardware-title">{t('settings.hardware.title')}</h2>
          <p>{t('settings.hardware.desc')}</p>
        </div>
        <button
          className="settings-hardware-refresh"
          disabled={loading}
          // 必须包一层：onClick={detect} 会把 click 事件当成第一个参数传进去，
          // 那是个真值，等于每次都强制重新探测。
          onClick={() => detect(true)}
          type="button"
        >
          {t('settings.hardware.refresh')}
        </button>
      </div>

      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}

      <dl className="settings-hardware-grid">
        {rows.map((row) => (
          <div className="settings-hardware-item" key={row.key}>
            <dt>
              <span className="settings-hardware-glyph" aria-hidden="true">
                {row.glyph}
              </span>
              {row.label}
            </dt>
            <dd>
              <strong title={row.value}>{row.value}</strong>
              {row.detail && <small>{row.detail}</small>}
            </dd>
          </div>
        ))}
      </dl>

      {profile && (
        <p className="settings-hardware-level">
          {t('settings.hardware.level')}
          <span
            className={`settings-hardware-badge is-${LEVELS[profile.level].slug}`}
          >
            {t(LEVELS[profile.level].labelKey)}
          </span>
          {profile.storage && (
            <small title={profile.storage.root}>
              {t('settings.hardware.root')}
            </small>
          )}
        </p>
      )}

      <p className="settings-hardware-hint">{t('settings.hardware.hint')}</p>

      <div
        className="settings-model-recommendations"
        aria-labelledby="hardware-recommendation-title"
      >
        <div className="settings-model-recommendation-heading">
          <div>
            <h3 id="hardware-recommendation-title">
              {t('settings.hardware.recommendation.title')}
            </h3>
            <p>{t('settings.hardware.recommendation.desc')}</p>
          </div>
          <Link className="settings-model-manage-link" to="/ModelManagement">
            {t('settings.hardware.recommendation.manage')}
          </Link>
        </div>

        <div
          aria-busy={loading}
          aria-live="polite"
          className="settings-model-recommendation-grid"
        >
          {loading && !recommendation ? (
            <p className="settings-model-recommendation-status">
              <span aria-hidden="true" className="settings-loading-spinner" />
              {t('settings.hardware.recommendation.loading')}
            </p>
          ) : (
            recommendation &&
            (['stt', 'llm'] as const).map((modelType) => {
              const model = recommendation[modelType];
              return (
                <article
                  className="settings-model-recommendation-card"
                  key={modelType}
                >
                  <span>
                    {t(`settings.hardware.recommendation.${modelType}`)}
                  </span>
                  <strong>
                    {model?.name ??
                      t('settings.hardware.recommendation.unavailable')}
                  </strong>
                  <p>
                    {model
                      ? t(
                          `settings.hardware.recommendation.${modelType}.reason`,
                          {
                            memory: recommendation.profile.totalMemoryGb,
                            cores: recommendation.profile.logicalCores,
                          },
                        )
                      : t('settings.hardware.recommendation.unavailable.desc')}
                  </p>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
