const ONBOARDING_STORAGE_KEY = 'speakspace:onboarding:v1';
export const ONBOARDING_OPEN_EVENT = 'speakspace:open-onboarding';
const ONBOARDING_ACTIVE_EVENT = 'speakspace:onboarding-active';

/**
 * 引导是否正在进行。放在模块级而不是 React context：
 * 订阅它的页面（对话工作台）和引导组件分处两棵子树，
 * 用事件广播比把 Provider 提到 App 顶层再层层传下去简单得多。
 */
let tourActive = false;

/** 新手指南状态保存在当前设备；升级步骤版本时可更换 storage key。 */
export class OnboardingController {
  public static shouldOpen(): boolean {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'completed';
  }

  public static isTourActive(): boolean {
    return tourActive;
  }

  public static setTourActive(active: boolean): void {
    if (tourActive === active) return;
    tourActive = active;
    window.dispatchEvent(new Event(ONBOARDING_ACTIVE_EVENT));
  }

  public static subscribeTourActive(listener: () => void): () => void {
    window.addEventListener(ONBOARDING_ACTIVE_EVENT, listener);
    return () => window.removeEventListener(ONBOARDING_ACTIVE_EVENT, listener);
  }

  public static complete(): void {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'completed');
  }

  public static open(): void {
    window.dispatchEvent(new Event(ONBOARDING_OPEN_EVENT));
  }
}
