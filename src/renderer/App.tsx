import { HashRouter } from 'react-router-dom';
import './App.css';
import './settings/AppSettings.css';
import AppRoute from './AppRoute';
import { AppSettingsProvider } from './settings/AppSettingsProvider';
import OnboardingGuide from './onboarding/OnboardingGuide';
import AmbientBackground from './components/AmbientBackground';
import useBackgroundRequests from './background/useBackgroundRequests';
import CloseConfirmDialog from './background/CloseConfirmDialog';
import DailyReminderController from './reminders/DailyReminderController';

/** 托盘 / 全局快捷键的动作在这里落地；必须在 Router 内部才能跳转。 */
function BackgroundRequestBridge() {
  useBackgroundRequests();
  return null;
}

/** 浮窗窗口走 #/hud/xxx：那里不需要环境光、引导层，也不该有主界面的背景。 */
function isHudWindow(): boolean {
  return window.location.hash.startsWith('#/hud/');
}

export default function App() {
  if (isHudWindow()) {
    return (
      <AppSettingsProvider>
        <HashRouter>
          <AppRoute />
        </HashRouter>
      </AppSettingsProvider>
    );
  }

  return (
    <AppSettingsProvider>
      {/* 环境光铺在最底层，外壳（.main-layout）压在它上面 */}
      <AmbientBackground />
      <HashRouter>
        <BackgroundRequestBridge />
        <AppRoute />
        <DailyReminderController />
        <OnboardingGuide />
      </HashRouter>
      {/* 关窗询问：任何页面下都可能触发，挂在最外层 */}
      <CloseConfirmDialog />
    </AppSettingsProvider>
  );
}
