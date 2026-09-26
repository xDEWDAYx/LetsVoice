import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { findDuplicateActions } from '@shared/shortcuts/Accelerator';
import {
  BackgroundStatus,
  CloseAction,
  DEFAULT_BACKGROUND_SETTINGS,
  ShortcutAction,
  ShortcutState,
  SHORTCUT_ACTIONS,
} from '@shared/types/BackgroundTypes';
import { CLOSE_ACTION_OPTIONS } from '../SettingsOptions';
import { SettingsPanelProps } from '../SettingsPanelTypes';
import ShortcutRecorder from './ShortcutRecorder';

const SHORTCUT_LABEL_KEYS: Record<ShortcutAction, string> = {
  dashboardHud: 'settings.background.shortcut.dashboard',
  todoHud: 'settings.background.shortcut.todos',
  quickRecord: 'settings.background.shortcut.record.action',
};

const SHORTCUT_DESC_KEYS: Record<ShortcutAction, string> = {
  dashboardHud: 'settings.background.shortcut.dashboard.desc',
  todoHud: 'settings.background.shortcut.todos.desc',
  quickRecord: 'settings.background.shortcut.record.desc',
};

/** 后台常驻与全局快捷键。 */
export default function BackgroundSettingsPanel({
  settings,
  disabled,
  save,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const { background } = settings;
  const [status, setStatus] = useState<BackgroundStatus | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await window.electron.background?.getStatus?.();
      setStatus((next as BackgroundStatus) ?? null);
    } catch {
      setStatus(null);
    }
  }, []);

  // 每次保存后主进程会重装快捷键，状态要跟着刷新，否则「已占用」的提示是旧的
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus, background]);

  const duplicates = findDuplicateActions(background.shortcuts);

  const resolveState = (action: ShortcutAction): ShortcutState => {
    if (!background.trayEnabled) return 'inactive';
    if (duplicates.includes(action)) return 'conflict';
    return status?.shortcuts?.[action] ?? 'disabled';
  };

  const saveBackground = (patch: Partial<typeof background>) =>
    save({ ...settings, background: { ...background, ...patch } });

  return (
    <>
      {/* data-tour：引导分别指这上下两块（见 onboarding/OnboardingSteps.ts）。
          上面这块讲「关窗之后怎么办」，下面那块才是改快捷键的地方。 */}
      <section
        aria-labelledby="background-close-title"
        className="settings-panel"
        data-tour="settings-close-behavior"
      >
        <div className="settings-panel-heading">
          <span className="settings-panel-icon" aria-hidden="true">
            ⌂
          </span>
          <div>
            <h2 id="background-close-title">
              {t('settings.background.close.title')}
            </h2>
            <p>{t('settings.background.close.desc')}</p>
          </div>
        </div>

        <div
          className="settings-options"
          role="radiogroup"
          aria-label={t('settings.background.close.title')}
        >
          {CLOSE_ACTION_OPTIONS.map((option) => (
            <button
              aria-checked={background.closeAction === option.value}
              className={`settings-option${
                background.closeAction === option.value ? ' is-selected' : ''
              }`}
              disabled={disabled}
              key={option.value}
              onClick={() =>
                saveBackground({ closeAction: option.value as CloseAction })
              }
              role="radio"
              type="button"
            >
              <span className="settings-language-glyph" aria-hidden="true">
                {option.glyph}
              </span>
              <span>
                <strong>{t(option.labelKey)}</strong>
                <small>{t(option.descKey)}</small>
              </span>
              <span className="settings-check" aria-hidden="true">
                ✓
              </span>
            </button>
          ))}
        </div>

        <label className="settings-toggle-row" htmlFor="background-tray">
          <input
            checked={background.trayEnabled}
            disabled={disabled}
            id="background-tray"
            onChange={(event) =>
              saveBackground({ trayEnabled: event.target.checked })
            }
            type="checkbox"
          />
          <span>
            <strong>{t('settings.background.tray.title')}</strong>
            <small>{t('settings.background.tray.desc')}</small>
          </span>
        </label>
      </section>

      <section
        aria-labelledby="background-shortcut-title"
        className="settings-panel"
        data-tour="settings-shortcut-list"
      >
        <div className="settings-panel-heading">
          <span className="settings-panel-icon" aria-hidden="true">
            ⌘
          </span>
          <div>
            <h2 id="background-shortcut-title">
              {t('settings.background.shortcut.title')}
            </h2>
            <p>{t('settings.background.shortcut.desc')}</p>
          </div>
        </div>

        <div className="settings-shortcut-list">
          {SHORTCUT_ACTIONS.map((action) => (
            <ShortcutRecorder
              accelerator={background.shortcuts[action]}
              description={t(SHORTCUT_DESC_KEYS[action])}
              disabled={disabled}
              key={action}
              label={t(SHORTCUT_LABEL_KEYS[action])}
              onChange={(accelerator) =>
                saveBackground({
                  shortcuts: { ...background.shortcuts, [action]: accelerator },
                })
              }
              state={resolveState(action)}
            />
          ))}
        </div>

        <div className="settings-shortcut-footer">
          <button
            className="settings-shortcut-reset"
            disabled={disabled}
            onClick={() =>
              saveBackground({
                shortcuts: { ...DEFAULT_BACKGROUND_SETTINGS.shortcuts },
              })
            }
            type="button"
          >
            {t('settings.background.shortcut.reset')}
          </button>
          <p className="settings-resolved-theme">
            {t('settings.background.shortcut.hint')}
          </p>
        </div>
      </section>
    </>
  );
}
