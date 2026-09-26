import { useTranslation } from 'react-i18next';
import { THEME_OPTIONS } from '../SettingsOptions';
import { SettingsPanelProps } from '../SettingsPanelTypes';

type ThemeSettingsPanelProps = SettingsPanelProps & {
  resolvedTheme: 'light' | 'dark';
};

export default function ThemeSettingsPanel({
  settings,
  disabled,
  save,
  resolvedTheme,
}: ThemeSettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <section className="settings-panel" aria-labelledby="theme-title">
      <div className="settings-panel-heading">
        <span className="settings-panel-icon theme-icon" aria-hidden="true">
          ◐
        </span>
        <div>
          <h2 id="theme-title">{t('settings.theme.title')}</h2>
          <p>{t('settings.theme.desc')}</p>
        </div>
      </div>

      <div
        className="settings-options theme-options"
        role="radiogroup"
        aria-label={t('settings.theme.title')}
      >
        {THEME_OPTIONS.map((option) => (
          <button
            aria-checked={settings.theme === option.value}
            className={`settings-option theme-${option.value}${
              settings.theme === option.value ? ' is-selected' : ''
            }`}
            disabled={disabled}
            key={option.value}
            onClick={() => save({ ...settings, theme: option.value })}
            role="radio"
            type="button"
          >
            <span className="settings-theme-preview" aria-hidden="true">
              <i />
              <i />
              <i />
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

      <p className="settings-resolved-theme">
        {t('settings.theme.resolved')}
        {resolvedTheme === 'dark'
          ? t('settings.theme.resolved.dark')
          : t('settings.theme.resolved.light')}
      </p>
    </section>
  );
}
