import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelIcons } from './ModelIcons';
import './ModelSelect.css';

export type ModelOption = {
  id: string;
  name: string;
  /** 尺寸、语言等短元信息，只在下拉里展示。 */
  meta?: string;
  /** 三个字以内的短标签，用来快速判断模型取舍。 */
  tags?: string[];
  /** 长说明只作为悬停提示，避免页面出现大段文字。 */
  description?: string;
  downloaded: boolean;
  active: boolean;
  recommended?: boolean;
};

export type ModelOptionOperation = {
  busy: boolean;
  progress: { message: string; percent: number | null } | null;
  error: string;
};

export type ModelSelectProps = {
  label: string;
  options: ModelOption[];
  placeholder: string;
  /** 每个模型独立的下载、切换或删除状态。 */
  operations: Partial<Record<string, ModelOptionOperation>>;
  onSelect: (id: string) => void;
  /** 传 null 表示该模块没有对应操作，下拉里就不显示这个图标。 */
  onDownload: ((id: string) => void) | null;
  onDelete: ((id: string) => void) | null;
};

/**
 * 模型下拉选择框：选择、下载、删除都收在同一个下拉里，
 * 状态和操作一律用图标表达，推荐项只加一个短标签。
 */
export default function ModelSelect({
  label,
  options,
  placeholder,
  operations,
  onSelect,
  onDownload,
  onDelete,
}: ModelSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const activeOption = options.find((option) => option.active) ?? null;
  const isDisabled = options.length === 0;

  function handleRowClick(option: ModelOption) {
    if (operations[option.id]?.busy) return;
    if (option.downloaded) {
      if (!option.active) onSelect(option.id);
      setOpen(false);
      return;
    }
    onDownload?.(option.id);
  }

  return (
    <div className="model-select" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={`model-select-trigger${open ? ' is-open' : ''}`}
        disabled={isDisabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="model-select-value">
          {activeOption ? activeOption.name : placeholder}
        </span>
        {activeOption?.meta && (
          <span className="model-select-meta">{activeOption.meta}</span>
        )}
        <span className="model-select-chevron">{ModelIcons.chevron}</span>
      </button>

      {open && (
        <ul aria-label={label} className="model-select-list" role="listbox">
          {options.map((option) => {
            const operation = operations[option.id];
            const busy = Boolean(operation?.busy);
            let stateIcon = ModelIcons.cloud;
            if (option.active) stateIcon = ModelIcons.active;
            else if (option.downloaded) stateIcon = ModelIcons.check;
            if (busy) stateIcon = ModelIcons.spinner;

            return (
              <li
                aria-selected={option.active}
                className={`model-option${option.active ? ' is-active' : ''}`}
                key={option.id}
                role="option"
              >
                <button
                  className="model-option-main"
                  disabled={busy}
                  onClick={() => handleRowClick(option)}
                  title={option.description}
                  type="button"
                >
                  <span
                    className={`model-option-state${option.downloaded ? ' is-local' : ''}`}
                  >
                    {stateIcon}
                  </span>
                  <span className="model-option-body">
                    <span className="model-option-line">
                      <span className="model-option-name">{option.name}</span>
                      {option.meta && (
                        <span className="model-option-meta">{option.meta}</span>
                      )}
                    </span>
                    {(option.recommended || option.tags?.length) && (
                      <span className="model-option-tags">
                        {option.recommended && (
                          <span className="model-option-tag is-recommended">
                            {t('modelManager.tags.recommended')}
                          </span>
                        )}
                        {option.tags?.map((tag) => (
                          <span className="model-option-tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                    {operation?.progress && (
                      <span
                        className="model-option-progress"
                        title={operation.progress.message}
                      >
                        <span className="model-option-progress-line">
                          <span className="model-option-progress-message">
                            {operation.progress.message}
                          </span>
                          {operation.progress.percent !== null && (
                            <span className="model-option-progress-value">
                              {operation.progress.percent}%
                            </span>
                          )}
                        </span>
                        <span
                          aria-label={`${option.name} ${operation.progress.message}`}
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={
                            operation.progress.percent ?? undefined
                          }
                          className="model-option-progress-track"
                          role="progressbar"
                        >
                          <span
                            className="model-option-progress-bar"
                            style={{
                              width: `${operation.progress.percent ?? 15}%`,
                            }}
                          />
                        </span>
                      </span>
                    )}
                    {operation?.error && (
                      <span className="model-option-error" role="alert">
                        {operation.error}
                      </span>
                    )}
                  </span>
                </button>

                <span className="model-option-actions">
                  {!option.downloaded && onDownload && (
                    <button
                      aria-label={`${t('modelManager.action.download')} ${option.name}`}
                      className="model-icon-button"
                      disabled={busy}
                      onClick={() => onDownload(option.id)}
                      title={t('modelManager.action.download')}
                      type="button"
                    >
                      {ModelIcons.download}
                    </button>
                  )}
                  {option.downloaded && onDelete && (
                    <button
                      aria-label={`${t('modelManager.action.delete')} ${option.name}`}
                      className="model-icon-button is-danger"
                      disabled={busy || option.active}
                      onClick={() => onDelete(option.id)}
                      title={
                        option.active
                          ? t('modelManager.action.deleteActive')
                          : t('modelManager.action.delete')
                      }
                      type="button"
                    >
                      {ModelIcons.trash}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
