import { ReactNode } from 'react';

/** 统一的 24×24 线性图标外壳，沿用侧边栏的图标风格。 */
function IconShell({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={16}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={16}
    >
      {children}
    </svg>
  );
}

/** 页面用到的全部行内图标。 */
export const ModelIcons: Record<string, ReactNode> = {
  stt: (
    <IconShell>
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </IconShell>
  ),
  tts: (
    <IconShell>
      <path d="M11 5 6 9H3v6h3l5 4Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </IconShell>
  ),
  embedding: (
    <IconShell>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="17" r="2.5" />
      <path d="M8.2 8.4 10.6 15M15.8 8.4 13.4 15M8.5 7h7" />
    </IconShell>
  ),
  llm: (
    <IconShell>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      <path d="M8 9h8M8 13h5" />
    </IconShell>
  ),
  chevron: (
    <IconShell>
      <path d="m6 9 6 6 6-6" />
    </IconShell>
  ),
  download: (
    <IconShell>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </IconShell>
  ),
  trash: (
    <IconShell>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
      <path d="M10 11v6M14 11v6" />
    </IconShell>
  ),
  check: (
    <IconShell>
      <path d="m5 13 4 4L19 7" />
    </IconShell>
  ),
  active: (
    <IconShell>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
    </IconShell>
  ),
  cloud: (
    <IconShell>
      <path d="M7 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 9.6 3.7 3.7 0 0 1 16.5 18Z" />
    </IconShell>
  ),
  play: (
    <IconShell>
      <path d="M8 5.5 18 12 8 18.5Z" />
    </IconShell>
  ),
  stop: (
    <IconShell>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </IconShell>
  ),
  warning: (
    <IconShell>
      <path d="M12 4.5 21 19H3Z" />
      <path d="M12 10v4M12 16.5v.5" />
    </IconShell>
  ),
  media: (
    <IconShell>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M8 5v4M16 5v4" />
      <path d="m11 13 3 2-3 2Z" />
    </IconShell>
  ),
  refresh: (
    <IconShell>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </IconShell>
  ),
  spinner: (
    <span className="model-spinner">
      <IconShell>
        <path d="M12 3a9 9 0 1 0 9 9" />
      </IconShell>
    </span>
  ),
};

export default ModelIcons;
