import { UiAlert as Alert } from "@/localization/ui-alert";
import { UiText as Text } from "@/components/ui-text";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { SttModelCard, SttModelCardStatus } from "@/components/stt-model-card";
import { OnboardingModelBackButton } from "@/components/onboarding-model-back-button";
import { Colors, Spacing } from "@/constants/theme";
import { SttModel } from "@/domain/stt-model/stt-model";
import { useTheme } from "@/hooks/use-theme";
import { useUiCopyTranslation } from "@/hooks/use-ui-copy-translation";
import { SttModelDownloadProgress } from "@/services/stt-model-service";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; installedById: Map<string, SttModel> };

type RowState = {
  isBusy: boolean;
  isDownloading: boolean;
  progress: SttModelDownloadProgress | null;
  error: string | null;
};

const emptyRowState: RowState = {
  isBusy: false,
  isDownloading: false,
  progress: null,
  error: null,
};

export default function SttModelsScreen() {
  const theme = useTheme();
  const tr = useUiCopyTranslation();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const { sttModelService } = appContainer;
  const catalog = sttModelService.getCatalog();
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  const setRowState = (id: string, patch: Partial<RowState>) => {
    setRowStates((previous) => ({
      ...previous,
      [id]: { ...emptyRowState, ...previous[id], ...patch },
    }));
  };

  const loadInstalledModels = async () => {
    try {
      const installed = await sttModelService.getInstalledModels();
      setState({
        status: "success",
        installedById: new Map(
          installed.map((model) => [model.getId(), model]),
        ),
      });
    } catch {
      setState({ status: "error", message: "Unable to load STT models." });
    }
  };

  useEffect(() => {
    void loadInstalledModels();
  }, []);

  useEffect(() => {
    const unsubscribeCallbacks = catalog.map((entry) => {
      const downloadState = sttModelService.getDownloadState(entry.id);
      const downloadPromise = sttModelService.getDownloadPromise(entry.id);

      if (downloadState === null || downloadPromise === null) {
        return () => undefined;
      }

      setRowState(entry.id, {
        isBusy: true,
        isDownloading: true,
        progress: downloadState.progress,
        error: null,
      });

      const unsubscribe = sttModelService.subscribeToDownload(
        entry.id,
        (progress) => setRowState(entry.id, { progress }),
      );

      void downloadPromise.then(
        () => {
          setRowState(entry.id, {
            isBusy: false,
            isDownloading: false,
            progress: null,
          });
          void loadInstalledModels();
        },
        (error: unknown) => {
          setRowState(entry.id, {
            isBusy: false,
            isDownloading: false,
            progress: null,
            error: error instanceof Error ? error.message : "Download failed.",
          });
        },
      );

      return unsubscribe;
    });

    return () => unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
  }, [catalog, sttModelService]);

  const handleDownload = async (catalogId: string) => {
    setRowState(catalogId, {
      isBusy: true,
      isDownloading: true,
      error: null,
      progress: null,
    });
    // Ignore progress events that arrive after this attempt has settled.
    let isAttemptActive = true;

    try {
      await sttModelService.downloadModel(catalogId, (progress) => {
        if (isAttemptActive) {
          setRowState(catalogId, { progress });
        }
      });
      isAttemptActive = false;
      setRowState(catalogId, {
        isBusy: false,
        isDownloading: false,
        progress: null,
      });
      await loadInstalledModels();
    } catch (error) {
      isAttemptActive = false;
      setRowState(catalogId, {
        isBusy: false,
        isDownloading: false,
        progress: null,
        error: error instanceof Error ? error.message : "Download failed.",
      });
    }
  };

  const handleUse = async (catalogId: string) => {
    setRowState(catalogId, { isBusy: true, error: null });

    try {
      await sttModelService.setActiveModel(catalogId);
      setRowState(catalogId, { isBusy: false });
      await loadInstalledModels();
    } catch (error) {
      setRowState(catalogId, {
        isBusy: false,
        error:
          error instanceof Error ? error.message : "Unable to use this model.",
      });
    }
  };

  const uninstall = async (catalogId: string) => {
    setRowState(catalogId, { isBusy: true, error: null });

    try {
      await sttModelService.uninstallModel(catalogId);
      setRowState(catalogId, { isBusy: false });
      await loadInstalledModels();
    } catch (error) {
      setRowState(catalogId, {
        isBusy: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove this model.",
      });
    }
  };

  const handleUninstall = (catalogId: string, name: string) => {
    Alert.alert("Uninstall model", `Remove "${name}" from this device?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Uninstall",
        style: "destructive",
        onPress: () => void uninstall(catalogId),
      },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: tr("Speech-to-Text Models") }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Spacing.xxl + insets.bottom },
        ]}
      >
        <OnboardingModelBackButton />
        <View style={styles.heading}>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            For Chinese speech, install and activate Whisper Small Multilingual. Parakeet models support English only. All transcription stays on this device.
          </Text>
        </View>

        {state.status === "error" && (
          <Text style={[styles.error, { color: colors.danger }]}>
            {state.message}
          </Text>
        )}

        <View style={styles.list}>
          {catalog.map((entry) => {
            const installed =
              state.status === "success"
                ? (state.installedById.get(entry.id) ?? null)
                : null;
            const rowState = rowStates[entry.id] ?? emptyRowState;
            const status: SttModelCardStatus = rowState.isDownloading
              ? "downloading"
              : installed
                ? installed.getIsActive()
                  ? "active"
                  : "installed"
                : "not-installed";

            return (
              <SttModelCard
                key={entry.id}
                name={entry.name}
                description={tr(entry.description)}
                languageLabel={entry.languageLabel}
                recommendedForChinese={entry.recommendedForChinese === true}
                format={entry.format}
                quantization={entry.quantization}
                sizeBytes={installed?.getSizeBytes() ?? entry.sizeBytes}
                status={status}
                progress={rowState.progress}
                isBusy={rowState.isBusy}
                errorMessage={rowState.error}
                onDownload={() => void handleDownload(entry.id)}
                onUse={() => void handleUse(entry.id)}
                onUninstall={() => handleUninstall(entry.id, entry.name)}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.xl, padding: Spacing.lg },
  heading: { gap: Spacing.xs },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 34, fontWeight: "800" },
  subtitle: { fontSize: 15, lineHeight: 22 },
  error: { fontSize: 14 },
  list: { gap: Spacing.md },
});
