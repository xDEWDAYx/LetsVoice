import type { OnboardingStep } from './OnboardingSteps';

/**
 * Resolve routes whose id only exists in user data. A missing or unreadable
 * workspace is not an onboarding error: returning null tells the tour to skip
 * the optional detail step and continue on the workspace home page.
 */
export default async function resolveOnboardingRoute(
  step: OnboardingStep,
): Promise<string | null> {
  if (step.dynamicRoute !== 'firstWorkspace') return step.route;

  try {
    const [workspace] = await window.electron.workspace.getList(1);
    return workspace ? `/Workspace/${workspace.id}` : null;
  } catch {
    return null;
  }
}
