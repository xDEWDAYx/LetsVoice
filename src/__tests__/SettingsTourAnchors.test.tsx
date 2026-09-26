import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { DEFAULT_BACKGROUND_SETTINGS } from '@shared/types/BackgroundTypes';
import AgentSettingsPanel from '../renderer/pages/Settings/components/AgentSettingsPanel';
import BackgroundSettingsPanel from '../renderer/pages/Settings/components/BackgroundSettingsPanel';
import { AppSettings } from '../renderer/settings/SettingsController';
import { ONBOARDING_STEPS } from '../renderer/onboarding/OnboardingSteps';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'zh' }, t: (key: string) => key }),
}));

const settings: AppSettings = {
  fontSize: 'medium',
  theme: 'dark',
  language: 'zh',
  agentAutoSpeak: false,
  background: DEFAULT_BACKGROUND_SETTINGS,
};

const props = {
  settings,
  disabled: false,
  save: jest.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  (window as any).electron = {
    background: { getStatus: jest.fn().mockResolvedValue({ shortcuts: {} }) },
  };
});

/**
 * 引导指的是面板里的控件，靠 data-tour 认人。这些锚点谁都可能在改版时顺手
 * 删掉，而删掉之后引导不会报错，只会在那一步干等 2.6 秒然后退化成一张飘在
 * 屏幕中央的卡片——最难发现的那种坏法。这里两头对一遍。
 */
describe('设置面板上的引导锚点', () => {
  const targetOf = (id: string) =>
    ONBOARDING_STEPS.find((step) => step.id === id)?.target as string;

  it('后台面板上下两块被同一个合并步骤覆盖', async () => {
    const { container } = render(
      <div className="settings-content">
        <BackgroundSettingsPanel {...props} />
      </div>,
    );
    // 面板一挂载就去问一次快捷键状态，等它回来再断言，免得 act 报警
    await waitFor(() =>
      expect((window as any).electron.background.getStatus).toHaveBeenCalled(),
    );

    const combinedBlock = container.querySelector(targetOf('background'));

    expect(combinedBlock).not.toBeNull();
    // 上面那块讲关窗行为，下面那块是三个快捷键录制框
    expect(combinedBlock!.querySelector('#background-tray')).not.toBeNull();
    expect(
      combinedBlock!.querySelectorAll('.settings-shortcut-list > *').length,
    ).toBe(3);
  });

  it('设置总览一步同时覆盖导航和智能助理面板', () => {
    const { container } = render(
      <div className="settings-layout">
        <nav className="settings-nav" />
        <AgentSettingsPanel {...props} />
      </div>,
    );

    const combinedBlock = container.querySelector(targetOf('settings'));
    expect(combinedBlock).not.toBeNull();
    expect(combinedBlock!.querySelector('.settings-nav')).not.toBeNull();
    expect(
      combinedBlock!.querySelector('[data-tour="settings-agent-panel"]'),
    ).not.toBeNull();
  });
});
