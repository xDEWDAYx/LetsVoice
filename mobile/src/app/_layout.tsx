import { Stack, usePathname } from "expo-router";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { AppState } from "react-native";

import { FloatingAskAiButton } from "@/components/floating-ask-ai-button";
import { appContainer } from "@/application";
import { Colors } from "@/constants/theme";
import { createThemedStackScreenOptions } from "@/constants/themed-stack-options";
import { databaseConfig, initializeDatabase } from "@/database";
import { useTheme } from "@/hooks/use-theme";
import { ThemeProvider as AppThemeProvider } from "@/providers/theme-provider";
import { TrashUndoProvider } from "@/providers/trash-undo-provider";
import {
  AppPreferencesProvider,
  useAppPreferences,
} from "@/providers/app-preferences-provider";
import { NotificationCoordinator } from "@/components/notification-coordinator";
import { OnboardingGuard } from "@/components/onboarding-guard";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AppPreferencesProvider>
        <ThemedRootLayout />
      </AppPreferencesProvider>
    </AppThemeProvider>
  );
}

function ThemedRootLayout() {
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const pathname = usePathname();
  const { hasCompletedOnboarding } = useAppPreferences();
  const stackScreenOptions = useMemo(
    () => createThemedStackScreenOptions(theme.mode),
    [theme.mode],
  );
  const navigationTheme = useMemo(() => {
    const baseTheme = theme.mode === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: colors.background,
        border: colors.border,
        card: colors.background,
        notification: colors.danger,
        primary: colors.accent,
        text: colors.text,
      },
    };
  }, [colors, theme.mode]);

  useEffect(() => {
    appContainer.speechPlaybackService.initialize();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        appContainer.speechPlaybackService.stopForBackground();
        void appContainer.llmInferenceService.stopGeneration();
        void appContainer.coreNoteInsightService.stopAllGenerations();
        void appContainer.knowledgeService.stopAllGenerations();
      }
    });
    void SplashScreen.hideAsync();
    return () => subscription.remove();
  }, []);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <SQLiteProvider
        databaseName={databaseConfig.databaseName}
        onInit={initializeDatabase}
      >
        <TrashUndoProvider>
          <OnboardingGuard />
          <NotificationCoordinator />
          <StatusBar
            animated
            style={theme.mode === "dark" ? "light" : "dark"}
          />
          <Stack
            screenOptions={stackScreenOptions}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="ask-ai" options={{ title: "Ask AI" }} />
            <Stack.Screen name="transcription" options={{ title: "Transcription" }} />
            <Stack.Screen name="audio-transcription" options={{ title: "Transcribe audio file" }} />
            <Stack.Screen name="getting-started" options={{ headerShown: false }} />
          </Stack>
          {hasCompletedOnboarding && pathname !== "/getting-started" && (
            <FloatingAskAiButton />
          )}
        </TrashUndoProvider>
      </SQLiteProvider>
    </NavigationThemeProvider>
  );
}
