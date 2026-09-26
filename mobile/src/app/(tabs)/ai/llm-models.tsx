import { UiAlert as Alert } from "@/localization/ui-alert";
import { UiText as Text } from "@/components/ui-text";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { LlmModelCard, LlmModelCardStatus } from "@/components/llm-model-card";
import { OnboardingModelBackButton } from "@/components/onboarding-model-back-button";
import { Colors, Spacing } from "@/constants/theme";
import { LlmModel } from "@/domain/llm-model/llm-model";
import { useTheme } from "@/hooks/use-theme";
import { useUiCopyTranslation } from "@/hooks/use-ui-copy-translation";
import { LlmModelDownloadProgress } from "@/services/llm-model-service";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; installedById: Map<string, LlmModel> };

type RowState = {
  isBusy: boolean;
  isDownloading: boolean;
  progress: LlmModelDownloadProgress | null;
  error: string | null;
};

const emptyRowState: RowState = {
  isBusy: false,
  isDownloading: false,
  progress: null,
  error: null,
};

export default function LlmModelsScreen() {
  const theme = useTheme();
  const tr = useUiCopyTranslation();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const { llmModelService } = appContainer;
  const catalog = llmModelService.getCatalog();
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
      const installed = await llmModelService.getInstalledModels();
      setState({
        status: "success",
        installedById: new Map(installed.map((model) => [model.getId(), model])),
      });
    } catch {
      setState({ status: "error", message: "Unable to load LLM models." });
    }
  };

  useEffect(() => { void loadInstalledModels(); }, []);

  useEffect(() => {
    const unsubscribers = catalog.map((entry) => {
      const downloadState = llmModelService.getDownloadState(entry.id);
      const downloadPromise = llmModelService.getDownloadPromise(entry.id);
      if (downloadState === null || downloadPromise === null) return () => undefined;

      setRowState(entry.id, {
        isBusy: true,
        isDownloading: true,
        progress: downloadState.progress,
        error: null,
      });
      const unsubscribe = llmModelService.subscribeToDownload(
        entry.id,
        (progress) => setRowState(entry.id, { progress }),
      );
      void downloadPromise.then(
        () => {
          setRowState(entry.id, { isBusy: false, isDownloading: false, progress: null });
          void loadInstalledModels();
        },
        (error: unknown) => setRowState(entry.id, {
          isBusy: false,
          isDownloading: false,
          progress: null,
          error: error instanceof Error ? error.message : "Download failed.",
        }),
      );
      return unsubscribe;
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [catalog, llmModelService]);

  const handleDownload = async (id: string) => {
    setRowState(id, { isBusy: true, isDownloading: true, error: null, progress: null });
    let active = true;
    try {
      await llmModelService.downloadModel(id, (progress) => {
        if (active) setRowState(id, { progress });
      });
      active = false;
      setRowState(id, { isBusy: false, isDownloading: false, progress: null });
      await loadInstalledModels();
    } catch (error) {
      active = false;
      setRowState(id, {
        isBusy: false,
        isDownloading: false,
        progress: null,
        error: error instanceof Error ? error.message : "Download failed.",
      });
    }
  };

  const handleUse = async (id: string) => {
    setRowState(id, { isBusy: true, error: null });
    try {
      await llmModelService.setActiveModel(id);
      setRowState(id, { isBusy: false });
      await loadInstalledModels();
    } catch (error) {
      setRowState(id, {
        isBusy: false,
        error: error instanceof Error ? error.message : "Unable to use this model.",
      });
    }
  };

  const uninstall = async (id: string) => {
    setRowState(id, { isBusy: true, error: null });
    try {
      await llmModelService.uninstallModel(id);
      setRowState(id, { isBusy: false });
      await loadInstalledModels();
    } catch (error) {
      setRowState(id, {
        isBusy: false,
        error: error instanceof Error ? error.message : "Unable to remove this model.",
      });
    }
  };

  const handleUninstall = (id: string, name: string) => {
    Alert.alert("Uninstall model", `Remove "${name}" from this device?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Uninstall", style: "destructive", onPress: () => void uninstall(id) },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: tr("Large Language Models") }} />
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
            Qwen2.5 1.5B is recommended for Chinese Insights, Knowledge, and Ask AI. Models and inference stay on this device.
          </Text>
        </View>
        {state.status === "error" && (
          <Text style={[styles.error, { color: colors.danger }]}>{state.message}</Text>
        )}
        <View style={styles.list}>
          {catalog.map((entry) => {
            const installed = state.status === "success"
              ? (state.installedById.get(entry.id) ?? null)
              : null;
            const row = rowStates[entry.id] ?? emptyRowState;
            const status: LlmModelCardStatus = row.isDownloading
              ? "downloading"
              : installed
                ? installed.getIsActive() ? "active" : "installed"
                : "not-installed";
            return (
              <LlmModelCard
                key={entry.id}
                name={entry.name}
                description={tr(entry.description)}
                recommendedForChinese={entry.recommendedForChinese === true}
                format={entry.format}
                quantization={entry.quantization}
                sizeBytes={installed?.getSizeBytes() ?? entry.sizeBytes}
                status={status}
                progress={row.progress}
                isBusy={row.isBusy}
                errorMessage={row.error}
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
