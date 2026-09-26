import { useSyncExternalStore } from 'react';
import { OnboardingController } from './OnboardingController';

/** 引导是否正在进行。页面据此放宽自己的准入条件，让引导能走完全程。 */
export default function useOnboardingActive(): boolean {
  return useSyncExternalStore(
    OnboardingController.subscribeTourActive,
    OnboardingController.isTourActive,
    () => false,
  );
}
