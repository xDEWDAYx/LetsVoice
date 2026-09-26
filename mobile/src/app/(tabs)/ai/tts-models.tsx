import { UiAlert as Alert } from "@/localization/ui-alert";
import { UiText as Text } from "@/components/ui-text";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { TtsModelCard, TtsModelCardStatus } from "@/components/tts-model-card";
import { OnboardingModelBackButton } from "@/components/onboarding-model-back-button";
import { Colors, Spacing } from "@/constants/theme";
import { TtsModel } from "@/domain/tts-model/tts-model";
import { useTheme } from "@/hooks/use-theme";
import { useUiCopyTranslation } from "@/hooks/use-ui-copy-translation";
import { TtsModelDownloadProgress } from "@/services/tts-model-service";

type ListState = { status: "loading" } | { status: "error"; message: string } |
  { status: "success"; installedById: Map<string, TtsModel> };
type RowState = { isBusy: boolean; isDownloading: boolean; progress: TtsModelDownloadProgress | null; error: string | null };
const emptyRowState: RowState = { isBusy: false, isDownloading: false, progress: null, error: null };

export default function TtsModelsScreen() {
  const colors = Colors[useTheme().mode];
  const tr = useUiCopyTranslation();
  const insets = useSafeAreaInsets();
  const { ttsModelService } = appContainer;
  const catalog = ttsModelService.getCatalog();
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const setRowState = (id: string, patch: Partial<RowState>) => setRowStates((previous) => ({
    ...previous, [id]: { ...emptyRowState, ...previous[id], ...patch },
  }));
  const loadInstalled = async () => {
    try {
      const installed = await ttsModelService.getInstalledModels();
      setState({ status: "success", installedById: new Map(installed.map((model) => [model.getId(), model])) });
    } catch { setState({ status: "error", message: "Unable to load TTS models." }); }
  };

  useEffect(() => { void loadInstalled(); }, []);
  useEffect(() => {
    const unsubscribers = catalog.map((entry) => {
      const progress = ttsModelService.getDownloadState(entry.id);
      const promise = ttsModelService.getDownloadPromise(entry.id);
      if (!promise) return () => undefined;
      setRowState(entry.id, { isBusy: true, isDownloading: true, progress, error: null });
      const unsubscribe = ttsModelService.subscribeToDownload(entry.id, (next) => setRowState(entry.id, { progress: next }));
      void promise.then(() => { setRowState(entry.id, { isBusy: false, isDownloading: false, progress: null }); void loadInstalled(); },
        (error: unknown) => setRowState(entry.id, { isBusy: false, isDownloading: false, progress: null,
          error: error instanceof Error ? error.message : "Download failed." }));
      return unsubscribe;
    });
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [catalog, ttsModelService]);

  const download = async (id: string) => {
    setRowState(id, { isBusy: true, isDownloading: true, error: null, progress: null });
    let active = true;
    try {
      await ttsModelService.downloadModel(id, (progress) => { if (active) setRowState(id, { progress }); });
      active = false; setRowState(id, { isBusy: false, isDownloading: false, progress: null }); await loadInstalled();
    } catch (error) { active = false; setRowState(id, { isBusy: false, isDownloading: false, progress: null,
      error: error instanceof Error ? error.message : "Download failed." }); }
  };
  const handleUse = async (id: string) => {
    setRowState(id, { isBusy: true, error: null });
    try { await ttsModelService.setActiveModel(id); setRowState(id, { isBusy: false }); await loadInstalled(); }
    catch (error) { setRowState(id, { isBusy: false, error: error instanceof Error ? error.message : "Unable to use this model." }); }
  };
  const uninstall = async (id: string) => {
    setRowState(id, { isBusy: true, error: null });
    try { await ttsModelService.uninstallModel(id); setRowState(id, { isBusy: false }); await loadInstalled(); }
    catch (error) { setRowState(id, { isBusy: false, error: error instanceof Error ? error.message : "Unable to remove this model." }); }
  };
  const confirmUninstall = (id: string, name: string) => Alert.alert("Uninstall model", `Remove "${name}" from this device?`, [
    { text: "Cancel", style: "cancel" }, { text: "Uninstall", style: "destructive", onPress: () => void uninstall(id) },
  ]);

  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <Stack.Screen options={{ title: tr("Text-to-Speech Models") }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxl + insets.bottom }]}>
      <OnboardingModelBackButton />
      <View style={styles.heading}><Text style={[styles.subtitle, { color: colors.textMuted }]}>Download voices for private speech synthesis with sherpa-onnx on this device.</Text></View>
      {state.status === "error" && <Text style={[styles.error, { color: colors.danger }]}>{state.message}</Text>}
      <View style={styles.list}>{catalog.map((entry) => {
        const installed = state.status === "success" ? state.installedById.get(entry.id) ?? null : null;
        const row = rowStates[entry.id] ?? emptyRowState;
        const status: TtsModelCardStatus = row.isDownloading ? "downloading" : installed ? installed.getIsActive() ? "active" : "installed" : "not-installed";
        return <TtsModelCard key={entry.id} name={entry.name} description={tr(entry.description)} languages={entry.languages.map(tr)}
          speakers={tr(entry.speakers)} sizeBytes={installed?.getSizeBytes() ?? entry.sizeBytes} status={status} progress={row.progress}
          isBusy={row.isBusy} errorMessage={row.error} onDownload={() => void download(entry.id)} onUse={() => void handleUse(entry.id)}
          onUninstall={() => confirmUninstall(entry.id, entry.name)} />;
      })}</View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { gap: Spacing.xl, padding: Spacing.lg },
  heading: { gap: Spacing.xs }, kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 34, fontWeight: "800" }, subtitle: { fontSize: 15, lineHeight: 22 }, error: { fontSize: 14 }, list: { gap: Spacing.md } });
