import React, { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RoutePath } from '../router/RouteManager';
import SoundWave from '../components/SoundWave';

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const ICONS = {
  transcription: (
    <svg {...svgProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  ),
  agent: (
    <svg {...svgProps}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
    </svg>
  ),
  workspace: (
    <svg {...svgProps}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  ),
  modelManagement: (
    <svg {...svgProps}>
      <path d="M12 2 21 7v10l-9 5-9-5V7Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
  settings: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
  dashBoard: (
    <svg {...svgProps}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { to: '/', end: true, key: 'transcription' },
  { to: RoutePath.Dashboard, key: 'dashBoard' },
  { to: '/Workspace', key: 'workspace' },
  { to: '/ModelManagement', key: 'modelManagement' },
  { to: '/Settings', key: 'settings' },
];

function ToggleIcon() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

/**
 * 量出当前选中项在导航里的位置，交给那块会滑动的高亮背景。
 *
 * 不用「第几项 × 固定行高」来算：行高会随「设置 → 输出文字字号」
 * 变，也会随 i18n 文案换行变，算出来必错位。直接读实际 DOM 尺寸，
 * 再用 ResizeObserver 跟住后续变化。
 */
function useActiveNavIndicator(pathname) {
  const trackRef = useRef(null);
  const [indicator, setIndicator] = useState({ y: 0, h: 0, ready: false });

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    const measure = () => {
      const active = track.querySelector('a.active');
      if (!active) {
        setIndicator((prev) => ({ ...prev, ready: false }));
        return;
      }
      setIndicator({
        y: active.offsetTop,
        h: active.offsetHeight,
        ready: true,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [pathname]);

  return { trackRef, indicator };
}

export default function Sidebar({ collapsed, onToggle }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { trackRef, indicator } = useActiveNavIndicator(pathname);

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-brand">
        <h2 className="sidebar-wordmark">
          <span className="sidebar-brand-mark">
            <SoundWave bars={4} size={14} />
          </span>
          <span className="sidebar-wordmark-text">SpeakSpace Local</span>
        </h2>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <ToggleIcon />
        </button>
      </div>

      {/* data-tour 是手把手引导的锚点（见 onboarding/OnboardingSteps.ts）。
          用属性而不是类名：类名随时会因为改样式被换掉，属性一眼就能看出
          「这里被引导引用了」。 */}
      <nav aria-label={t('sidebar.nav')} data-tour="sidebar-nav">
        <div className="sidebar-nav-track" ref={trackRef}>
          <span
            className={`sidebar-nav-indicator${indicator.ready ? ' is-ready' : ''}`}
            style={{
              '--nav-y': `${indicator.y}px`,
              '--nav-h': `${indicator.h}px`,
            }}
            aria-hidden="true"
          />
          <ul>
            {NAV_ITEMS.map((item) => {
              const label = t(`sidebar.${item.key}`);
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={label}
                    aria-label={label}
                  >
                    <span className="nav-icon">{ICONS[item.key]}</span>
                    <span className="nav-label">{label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </aside>
  );
}
