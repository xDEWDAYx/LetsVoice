import { useTranslation } from 'react-i18next';
import { LANGUAGE_OPTIONS } from '../SettingsOptions';
import { SettingsPanelProps } from '../SettingsPanelTypes';

export default function LanguageSettingsPanel({
  settings,
  disabled,
  save,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <section className="settings-panel" aria-labelledby="language-title">
      <div className="settings-panel-heading">
        <span className="settings-panel-icon language-icon" aria-hidden="true">
          文
        </span>
        <div>
          <h2 id="language-title">{t('settings.language.title')}</h2>
          <p>{t('settings.language.desc')}</p>
        </div>
      </div>

      <div
        className="settings-options"
        role="radiogroup"
        aria-label={t('settings.language.title')}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <button
            aria-checked={settings.language === option.value}
            className={`settings-option language-${option.value}${
              settings.language === option.value ? ' is-selected' : ''
            }`}
            disabled={disabled}
            key={option.value}
            onClick={() => save({ ...settings, language: option.value })}
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
    </section>
  );
}
