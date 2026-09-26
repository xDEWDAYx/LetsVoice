import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './CopyButton.css';

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function CopyIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

/** 可复用复制按钮：复制成功后短暂显示对勾。 */
export default function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 卸载时清掉计时器，避免在已卸载的组件上更新状态。
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 复制失败时保持原状，不打断阅读。
    }
  };

  // 外层 span 不只是包装：页面级的 `.studio-page button` 选择器优先级高于
  // 单个 `.copy-button`，会把内边距强行撑大导致图标被挤没，这里靠两级类名压过它。
  return (
    <span className="copy-control">
      <button
        type="button"
        className={`copy-button${copied ? ' is-copied' : ''}`}
        disabled={!text.trim()}
        onClick={copy}
        aria-label={
          copied ? t('components.copy.copied') : t('components.copy.copy')
        }
        title={copied ? t('components.copy.copied') : t('components.copy.copy')}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </span>
  );
}
