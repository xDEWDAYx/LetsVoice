import { useTranslation } from 'react-i18next';
import { OnboardingController } from '../../../onboarding/OnboardingController';

export default function OnboardingSettingsPanel() {
  const { t } = useTranslation();
  return (
    <section className="settings-panel" aria-labelledby="guide-title">
      <div className="settings-panel-heading">
        <span className="settings-panel-icon guide-icon" aria-hidden="true">
          ?
        </span>
        <div>
          <h2 id="guide-title">{t('settings.guide.title')}</h2>
          <p>{t('settings.guide.desc')}</p>
        </div>
      </div>
      <button
        className="settings-guide-button"
        onClick={() => OnboardingController.open()}
        type="button"
      >
        {t('settings.guide.restart')}
      </button>
    </section>
  );
}
