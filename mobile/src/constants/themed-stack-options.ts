import type { NativeStackNavigationOptions } from "expo-router";
import { DynamicColorIOS, Platform } from "react-native";

import { Colors } from "@/constants/theme";
import type { ResolvedThemeMode } from "@/providers/theme-provider";

export function createThemedStackScreenOptions(
  mode: ResolvedThemeMode,
  controlsStatusBar = false,
): NativeStackNavigationOptions {
  const colors = Colors[mode];
  const nativeColors = Platform.OS === "ios"
    ? {
        accent: DynamicColorIOS({
          light: Colors.light.accent,
          dark: Colors.dark.accent,
        }),
        background: DynamicColorIOS({
          light: Colors.light.background,
          dark: Colors.dark.background,
        }),
        text: DynamicColorIOS({
          light: Colors.light.text,
          dark: Colors.dark.text,
        }),
      }
    : colors;

  const screenOptions: NativeStackNavigationOptions = {
    contentStyle: { backgroundColor: colors.background },
    headerBackButtonDisplayMode: "minimal",
    headerShadowVisible: false,
    headerStyle: { backgroundColor: nativeColors.background },
    headerTintColor: nativeColors.accent,
    headerTitleStyle: { color: nativeColors.text },
  };

  if (controlsStatusBar) {
    screenOptions.statusBarStyle = mode === "dark" ? "light" : "dark";
  }

  return screenOptions;
}
