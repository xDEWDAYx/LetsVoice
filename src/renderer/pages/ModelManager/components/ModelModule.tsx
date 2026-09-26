import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelIcons } from './ModelIcons';
import './ModelModule.css';

/** 模块底部展示的运行时依赖，安装与卸载都在这一行完成。 */
export type RuntimeInfo = {
  key: string;
  name: string;
  present: boolean;
  /** 悬停说明：来源、版本或为什么不能卸载。 */
  hint: string;
  onInstall: (() => void) | null;
  onUninstall: (() => void) | null;
};

export type ModelModuleProps = {
  /** 模块图标键名，取自 ModelIcons。 */
  icon: string;
  /** 模块短名，如 STT；完整说明放在 title 提示里。 */
  name: string;
  hint: string;
  ready: boolean;
  readyHint: string;
  children: ReactNode;
  /** 传 null 表示该模块当前没有额外的图标操作。 */
  actions: ReactNode | null;
  runtimes: RuntimeInfo[];
  busy: boolean;
  progress: { message: string; percent: number | null } | null | undefined;
  error: string | undefined;
};

/** 单个能力模块的外壳：图标 + 短名 + 状态点 + 选择区 + 图标操作。 */
export default function ModelModule({
  icon,
  name,
  hint,
  ready,
  readyHint,
  children,
  actions,
  runtimes,
  busy,
  progress,
  error,
}: ModelModuleProps) {
  const { t } = useTranslation();
  return (
    <section className="model-module">
      <header className="model-module-head">
        <span className="model-module-icon" aria-hidden="true" title={hint}>
          {ModelIcons[icon]}
        </span>

        <span className="model-module-name" title={hint}>
          {name}
          <span
            className={`model-module-dot${ready ? ' is-ready' : ''}`}
            role="img"
            aria-label={readyHint}
            title={readyHint}
          />
        </span>

        {actions && <div className="model-module-actions">{actions}</div>}
      </header>

      <div className="model-module-control">{children}</div>

      {runtimes.length > 0 && (
        <div className="model-module-runtimes">
          <span className="model-module-runtime-label">
            {t('modelManager.runtime')}
          </span>
          {runtimes.map((runtime) => (
            <span
              className="runtime-chip"
              key={runtime.key}
              title={runtime.hint}
            >
              <span
                className={`runtime-chip-dot${runtime.present ? ' is-ready' : ''}`}
              />
              <span className="runtime-chip-name">{runtime.name}</span>
              {!runtime.present && runtime.onInstall && (
                <button
                  aria-label={`${t('modelManager.action.install')} ${runtime.name}`}
                  className="model-icon-button is-compact"
                  disabled={busy}
                  onClick={runtime.onInstall}
                  title={`${t('modelManager.action.install')} ${runtime.name}`}
                  type="button"
                >
                  {ModelIcons.download}
                </button>
              )}
              {runtime.present && runtime.onUninstall && (
                <button
                  aria-label={`卸载 ${runtime.name}`}
                  className="model-icon-button is-compact is-danger"
                  disabled={busy}
                  onClick={runtime.onUninstall}
                  title={`卸载 ${runtime.name}`}
                  type="button"
                >
                  {ModelIcons.trash}
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {progress && (
        <div className="model-module-progress" title={progress.message}>
          <div
            className="model-module-progress-bar"
            style={{ width: `${progress.percent ?? 15}%` }}
          />
          {progress.percent !== null && (
            <span className="model-module-progress-value">
              {progress.percent}%
            </span>
          )}
        </div>
      )}

      {error && (
        <p className="model-module-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
