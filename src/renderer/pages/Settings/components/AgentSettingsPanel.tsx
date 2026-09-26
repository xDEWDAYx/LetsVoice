import { useTranslation } from 'react-i18next';
import { AGENT_AUTO_SPEAK_OPTIONS } from '../SettingsOptions';
import { SettingsPanelProps } from '../SettingsPanelTypes';

/** 智能助理设置：目前只有「答完是否自动朗读」这一项。 */
export default function AgentSettingsPanel({
  settings,
  disabled,
  save,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="agent-speak-title"
      className="settings-panel"
      data-tour="settings-agent-panel"
    >
      <div className="settings-panel-heading">
        <span className="settings-panel-icon" aria-hidden="true">
          ♪
        </span>
        <div>
          <h2 id="agent-speak-title">{t('settings.agent.autoSpeak.title')}</h2>
          <p>{t('settings.agent.autoSpeak.desc')}</p>
        </div>
      </div>

      <div
        className="settings-options"
        role="radiogroup"
        aria-label={t('settings.agent.autoSpeak.title')}
      >
        {AGENT_AUTO_SPEAK_OPTIONS.map((option) => (
          <button
            aria-checked={settings.agentAutoSpeak === option.value}
            className={`settings-option${
              settings.agentAutoSpeak === option.value ? ' is-selected' : ''
            }`}
            disabled={disabled}
            key={String(option.value)}
            onClick={() => save({ ...settings, agentAutoSpeak: option.value })}
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

      <p className="settings-resolved-theme">
        {t('settings.agent.autoSpeak.hint')}
      </p>
    </section>
  );
}
