import Storage from "expo-sqlite/kv-store";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Appearance,
  useColorScheme as useSystemColorScheme,
} from "react-native";

import { Colors } from "@/constants/theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";

const THEME_PREFERENCE_KEY = "settings.theme-preference";

type ThemeContextValue = {
  mode: ResolvedThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readInitialPreference(): ThemePreference {
  try {
    const stored = Storage.getItemSync(THEME_PREFERENCE_KEY);
    return isThemePreference(stored) ? stored : "light";
  } catch (error) {
    console.warn("[Theme] Unable to read the saved theme; using Light.", { error });
    return "light";
  }
}

function applyNativeAppearance(preference: ThemePreference): void {
  Appearance.setColorScheme(
    preference === "system" ? "unspecified" : preference,
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readInitialPreference,
  );
  const systemMode = useSystemColorScheme();
  const mode: ResolvedThemeMode =
    preference === "system"
      ? systemMode === "dark"
        ? "dark"
        : "light"
      : preference;

  useLayoutEffect(() => {
    applyNativeAppearance(preference);
  }, [preference]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    const previous = preference;
    applyNativeAppearance(next);
    setPreferenceState(next);
    try {
      await Storage.setItem(THEME_PREFERENCE_KEY, next);
    } catch (error) {
      applyNativeAppearance(previous);
      setPreferenceState(previous);
      throw new Error("Unable to save the appearance setting.", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }, [preference]);

  const value = useMemo(
    () => ({ mode, preference, setPreference }),
    [mode, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }
  return {
    ...value,
    ...Colors[value.mode],
  };
}
