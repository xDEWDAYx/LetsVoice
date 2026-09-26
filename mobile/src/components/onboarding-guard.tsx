import { type Href, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";

import { useAppPreferences } from "@/providers/app-preferences-provider";

const ONBOARDING_ALLOWED_PATHS = new Set([
  "/getting-started",
  "/ai/stt-models",
  "/ai/llm-models",
  "/ai/tts-models",
]);

export function OnboardingGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasCompletedOnboarding } = useAppPreferences();

  useEffect(() => {
    if (!hasCompletedOnboarding && !ONBOARDING_ALLOWED_PATHS.has(pathname)) {
      router.replace("/getting-started" as Href);
    }
  }, [hasCompletedOnboarding, pathname, router]);

  return null;
}
