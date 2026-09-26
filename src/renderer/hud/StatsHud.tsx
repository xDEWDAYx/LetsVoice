import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import HudShell from './HudShell';
import useHudVisibility from './useHudVisibility';
import {
  formatHudNumber,
  HudMetric,
  metricsFromOverview,
  ringDashArray,
} from './HudMetrics';

const RING_RADIUS = 22;
const RING_SIZE = 56;

function MetricRing({ metric }: { metric: HudMetric }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={`hud-ring hud-ring-${metric.key}`}>
      <svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 56 56">
        <circle
          className="hud-ring-track"
          cx="28"
          cy="28"
          fill="none"
          r={RING_RADIUS}
          strokeWidth="5"
        />
        <circle
          className="hud-ring-fill"
          cx="28"
          cy="28"
          fill="none"
          r={RING_RADIUS}
          strokeDasharray={ringDashArray(metric.ratio, RING_RADIUS)}
          // 圆头在进度为 0 时也会画出一个小点，看着像「有一点点」；
          // 真为 0 时改成平头，环就是干干净净的空。
          strokeLinecap={metric.ratio > 0 ? 'round' : 'butt'}
          strokeWidth="5"
          // 从 12 点方向开始画，顺时针
          transform="rotate(-90 28 28)"
        />
      </svg>
      <strong>{formatHudNumber(metric.value, i18n.language)}</strong>
      <small>{t(metric.labelKey)}</small>
    </div>
  );
}

/**
 * 统计浮窗的内容：标题 + 四个环。
 *
 * 只负责画，数据从外面给。新手引导要在主界面上原样摆一个出来，
 * 拆开之后两边用的是同一段 JSX，改一处两处都跟着变。
 */
export function StatsHudView({
  metrics,
  failed = false,
}: {
  metrics: HudMetric[] | null;
  failed?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="hud-head">
        <span className="hud-title">{t('hud.stats.title')}</span>
      </div>
      {failed && <p className="hud-empty">{t('hud.error')}</p>}
      {!failed && (
        <div className="hud-rings">
          {(metrics ?? []).map((metric) => (
            <MetricRing key={metric.key} metric={metric} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * 统计浮窗：四个环，各自一项数据，看完自动淡出。
 *
 * 数据直接走已有的 dashboard IPC，统计口径和仪表板页面完全一致。
 */
export default function StatsHud() {
  const shownAt = useHudVisibility();
  const [metrics, setMetrics] = useState<HudMetric[] | null>(null);
  const [failed, setFailed] = useState(false);

  // 每次被叫出来都重新取一遍：浮窗常驻着，不重取就是上次的数字
  useEffect(() => {
    let cancelled = false;
    window.electron.dashboard
      .getDashboardOverview()
      .then((overview: any) => {
        if (cancelled) return null;
        setMetrics(metricsFromOverview(overview));
        return null;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shownAt]);

  return (
    <HudShell kind="stats" autoHideMs={4200} shownAt={shownAt}>
      <StatsHudView metrics={metrics} failed={failed} />
    </HudShell>
  );
}
