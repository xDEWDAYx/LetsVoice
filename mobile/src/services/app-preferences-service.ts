import Storage from "expo-sqlite/kv-store";

export const TEXT_SIZE_PREFERENCES = ["small", "default", "large"] as const;
export type TextSizePreference = (typeof TEXT_SIZE_PREFERENCES)[number];

export type AppPreferencesSnapshot = {
  textSize: TextSizePreference;
  notificationsEnabled: boolean;
  autoSpeakAnswers: boolean;
  hasCompletedOnboarding: boolean;
};

const STORAGE_KEYS = {
  textSize: "settings.text-size",
  notificationsEnabled: "settings.task-reminder-notifications",
  autoSpeakAnswers: "settings.auto-speak-answers",
  hasCompletedOnboarding: "settings.has-completed-onboarding",
} as const;

const DEFAULTS: AppPreferencesSnapshot = {
  textSize: "default",
  notificationsEnabled: false,
  autoSpeakAnswers: false,
  hasCompletedOnboarding: false,
};

function readBoolean(key: string, fallback: boolean): boolean {
  const value = Storage.getItemSync(key);
  return value === null ? fallback : value === "true";
}

function readSnapshot(): AppPreferencesSnapshot {
  try {
    const storedTextSize = Storage.getItemSync(STORAGE_KEYS.textSize);
    const textSize = TEXT_SIZE_PREFERENCES.includes(storedTextSize as TextSizePreference)
      ? storedTextSize as TextSizePreference
      : DEFAULTS.textSize;
    return {
      textSize,
      notificationsEnabled: readBoolean(
        STORAGE_KEYS.notificationsEnabled,
        DEFAULTS.notificationsEnabled,
      ),
      autoSpeakAnswers: readBoolean(
        STORAGE_KEYS.autoSpeakAnswers,
        DEFAULTS.autoSpeakAnswers,
      ),
      hasCompletedOnboarding: readBoolean(
        STORAGE_KEYS.hasCompletedOnboarding,
        DEFAULTS.hasCompletedOnboarding,
      ),
    };
  } catch (error) {
    console.warn("[Preferences] Unable to read saved settings; using safe defaults.", { error });
    return DEFAULTS;
  }
}

export class AppPreferencesService {
  private snapshot = readSnapshot();
  private readonly listeners = new Set<() => void>();

  public getSnapshot = (): AppPreferencesSnapshot => this.snapshot;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public async setTextSize(textSize: TextSizePreference): Promise<void> {
    if (!TEXT_SIZE_PREFERENCES.includes(textSize)) return;
    await Storage.setItem(STORAGE_KEYS.textSize, textSize);
    this.update({ textSize });
  }

  public async setNotificationsEnabled(notificationsEnabled: boolean): Promise<void> {
    await Storage.setItem(
      STORAGE_KEYS.notificationsEnabled,
      String(notificationsEnabled),
    );
    this.update({ notificationsEnabled });
  }

  public async setAutoSpeakAnswers(autoSpeakAnswers: boolean): Promise<void> {
    await Storage.setItem(STORAGE_KEYS.autoSpeakAnswers, String(autoSpeakAnswers));
    this.update({ autoSpeakAnswers });
  }

  public async completeOnboarding(): Promise<void> {
    await Storage.setItem(STORAGE_KEYS.hasCompletedOnboarding, "true");
    this.update({ hasCompletedOnboarding: true });
  }

  private update(change: Partial<AppPreferencesSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach((listener) => listener());
  }
}

export function textSizeScale(preference: TextSizePreference): number {
  if (preference === "small") return 0.9;
  if (preference === "large") return 1.15;
  return 1;
}
