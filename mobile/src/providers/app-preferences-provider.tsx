import { createContext, type PropsWithChildren, useContext, useMemo, useSyncExternalStore } from "react";

import { appContainer } from "@/application";
import type { AppPreferencesSnapshot, TextSizePreference } from "@/services/app-preferences-service";

type AppPreferencesContextValue = AppPreferencesSnapshot & {
  setTextSize: (value: TextSizePreference) => Promise<void>;
  setAutoSpeakAnswers: (value: boolean) => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const service = appContainer.preferencesService;
  const snapshot = useSyncExternalStore(
    service.subscribe,
    service.getSnapshot,
    service.getSnapshot,
  );
  const value = useMemo<AppPreferencesContextValue>(() => ({
    ...snapshot,
    setTextSize: (next) => service.setTextSize(next),
    setAutoSpeakAnswers: (next) => service.setAutoSpeakAnswers(next),
    completeOnboarding: () => service.completeOnboarding(),
  }), [service, snapshot]);

  return (
    <AppPreferencesContext.Provider value={value}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences(): AppPreferencesContextValue {
  const value = useContext(AppPreferencesContext);
  if (value === null) {
    throw new Error("useAppPreferences must be used inside AppPreferencesProvider.");
  }
  return value;
}
