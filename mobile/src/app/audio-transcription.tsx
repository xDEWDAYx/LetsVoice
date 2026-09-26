import { UiTextInput as TextInput } from "@/components/ui-text-input";
import { UiText as Text } from "@/components/ui-text";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { ModalCloseButton } from "@/components/modal-close-button";
import { SafeAreaModal } from "@/components/safe-area-modal";
import { TranscriptionLanguageSelector } from "@/components/transcription-language-selector";
import { Colors, Radius, Spacing } from "@/constants/theme";
import type { Workspace } from "@/domain/workspace/workspace";
import type { SttModelEngine } from "@/domain/stt-model/stt-model";
import { validateImportedAudio } from "@/domain/audio-import/audio-import";
import { useTheme } from "@/hooks/use-theme";
import { formatBytes } from "@/utils/format-bytes";
import { InferenceCancelledError } from "@/services/local-llm-coordinator";
import {
  readTranscriptionLanguage,
  saveTranscriptionLanguage,
  type TranscriptionLanguage,
} from "@/services/transcription-language";

type Status = "empty" | "selected" | "preparing" | "transcribing" | "complete";
type SelectedAudio = { uri: string; name: string; size: number };

export default function AudioTranscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const {
    noteService,
    transcriptionService,
    workspaceService,
    sttModelService,
  } = appContainer;
  const selectedRef = useRef<SelectedAudio | null>(null);
  const saveDraftSourceUriRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<SelectedAudio | null>(null);
  const [status, setStatus] = useState<Status>("empty");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [noteName, setNoteName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [language, setLanguage] = useState<TranscriptionLanguage>(
    readTranscriptionLanguage,
  );
  const [activeEngine, setActiveEngine] = useState<SttModelEngine | null>(null);

  useEffect(() => () => {
    if (selectedRef.current !== null) {
      console.info("[AudioImport] Screen closed; cleaning selected cache file", {
        fileName: selectedRef.current.name,
      });
      transcriptionService.deleteTemporaryImport(selectedRef.current.uri);
    }
  }, [transcriptionService]);

  useEffect(() => {
    let cancelled = false;
    void sttModelService.getActiveModel().then(
      (model) => {
        if (!cancelled) setActiveEngine(model?.getEngine() ?? null);
      },
      () => undefined,
    );
    void transcriptionService.ensureReady().catch(() => undefined);
    return () => { cancelled = true; };
  }, [sttModelService, transcriptionService]);

  const replaceSelection = (audio: SelectedAudio | null) => {
    if (selectedRef.current !== null && selectedRef.current.uri !== audio?.uri) {
      console.info("[AudioImport] Cleaning previous selected cache file", {
        fileName: selectedRef.current.name,
      });
      transcriptionService.deleteTemporaryImport(selectedRef.current.uri);
    }
    if (selectedRef.current?.uri !== audio?.uri) {
      saveDraftSourceUriRef.current = null;
      setNoteName("");
      setSelectedWorkspaceId("");
    }
    selectedRef.current = audio;
    setSelected(audio);
  };

  const chooseAudio = async () => {
    setError(null);
    console.info("[AudioImport] Opening system audio picker");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        console.info("[AudioImport] Audio picker canceled");
        return;
      }
      const asset = result.assets[0];
      const selectedFile = new File(asset.uri);
      const sizeBytes = asset.size ?? selectedFile.size;
      console.info("[AudioImport] Audio selected", {
        fileName: asset.name,
        sizeBytes,
        mimeType: asset.mimeType ?? null,
      });
      const validationError = validateImportedAudio(
        asset.name,
        sizeBytes,
        asset.mimeType,
      );
      if (validationError !== null) {
        transcriptionService.deleteTemporaryImport(asset.uri);
        setError(validationError);
        return;
      }
      replaceSelection({ uri: asset.uri, name: asset.name, size: sizeBytes });
      setTranscript("");
      setStatus("selected");
    } catch (caught) {
      console.error("[AudioImport] Audio file selection failed", { error: caught });
      setError("That audio file could not be opened. Please choose another file.");
    }
  };

  const startTranscription = async () => {
    if (selected === null) return;
    const requestId = `audio-import-${Date.now()}`;
    const startedAt = Date.now();
    let phase: "preparing" | "transcribing" = "preparing";
    setError(null);
    setTranscript("");
    setStatus("preparing");
    console.info("[AudioImport] Transcription requested", {
      requestId,
      fileName: selected.name,
      sizeBytes: selected.size,
    });
    try {
      const text = await transcriptionService.transcribeFile(selected.uri, {
        onPrepared: () => {
          phase = "transcribing";
          setStatus("transcribing");
          console.info("[AudioImport] Audio prepared; transcription UI active", {
            requestId,
            durationMs: Date.now() - startedAt,
          });
        },
      }, requestId, {
        language: activeEngine === "parakeet" ? "en" : language,
      });
      if (text.length === 0) {
        throw new Error("The model did not detect any speech in this audio.");
      }
      setTranscript(text);
      setStatus("complete");
      console.info("[AudioImport] Transcription displayed", {
        requestId,
        totalDurationMs: Date.now() - startedAt,
        transcriptLength: text.length,
      });
    } catch (caught) {
      if (caught instanceof InferenceCancelledError) {
        setStatus("selected");
        return;
      }
      console.error("[AudioImport] Imported audio transcription failed", {
        requestId,
        phase,
        durationMs: Date.now() - startedAt,
        error: caught,
      });
      const detail = caught instanceof Error ? caught.message : "";
      if (detail.includes("active speech recognition model")) {
        setError("No speech recognition model is active. Activate a model in AI first.");
      } else if (detail.includes("missing")) {
        setError("The active speech recognition model is unavailable. Please download or activate it again.");
      } else if (
        detail.includes("two hours") ||
        detail.includes("2 GB") ||
        detail.includes("free storage") ||
        detail.includes("Not enough free storage")
      ) {
        setError(detail);
      } else if (phase === "preparing") {
        setError("This audio could not be prepared. The file may be damaged or use an unsupported codec.");
      } else {
        setError("Transcription failed. Please try again or choose another audio file.");
      }
      setStatus("selected");
    }
  };

  const prepareSave = async () => {
    setError(null);
    console.info("[AudioImport] Loading workspaces for save");
    try {
      const defaultWorkspace = await workspaceService.getOrCreateDefaultWorkspace();
      const allWorkspaces = await workspaceService.getWorkspaces();
      setWorkspaces(allWorkspaces);
      if (saveDraftSourceUriRef.current !== selected?.uri) {
        setSelectedWorkspaceId(defaultWorkspace.getId());
        setNoteName(selected?.name.replace(/\.[^.]+$/, "") ?? "");
        saveDraftSourceUriRef.current = selected?.uri ?? null;
      } else if (!allWorkspaces.some((workspace) => workspace.getId() === selectedWorkspaceId)) {
        setSelectedWorkspaceId(defaultWorkspace.getId());
      }
      setShowSave(true);
      console.info("[AudioImport] Save sheet ready", {
        workspaceCount: allWorkspaces.length,
        defaultWorkspaceId: defaultWorkspace.getId(),
      });
    } catch (caught) {
      console.error("Loading workspaces for imported transcript failed", caught);
      setError("Your workspaces could not be loaded.");
    }
  };

  const save = async () => {
    if (selected === null) return;
    setIsSaving(true);
    setError(null);
    let audioRelativePath: string | null = null;
    const saveStartedAt = Date.now();
    console.info("[AudioImport] Saving transcript as note", {
      fileName: selected.name,
      workspaceId: selectedWorkspaceId,
      transcriptLength: transcript.length,
    });
    try {
      audioRelativePath = transcriptionService.preserveImportedAudio(selected.uri, selected.name);
      const note = await noteService.createNote(
        selectedWorkspaceId,
        noteName,
        transcript,
        audioRelativePath,
      );
      replaceSelection(null);
      setShowSave(false);
      console.info("[AudioImport] Note saved", {
        noteId: note.getId(),
        durationMs: Date.now() - saveStartedAt,
        audioRelativePath,
      });
      router.replace({
        pathname: "/notes/[noteId]",
        params: { noteId: note.getId(), section: "insights", autoGenerate: "1" },
      });
    } catch (caught) {
      if (audioRelativePath !== null) transcriptionService.deleteRecording(audioRelativePath);
      console.error("Saving imported transcript as note failed", caught);
      setError("The note could not be saved. Your transcript is still here.");
    } finally {
      setIsSaving(false);
    }
  };

  const discard = () => {
    console.info("[AudioImport] Imported transcript discarded", {
      fileName: selected?.name ?? null,
      transcriptLength: transcript.length,
    });
    replaceSelection(null);
    setTranscript("");
    setError(null);
    setStatus("empty");
  };

  const busy = status === "preparing" || status === "transcribing";
  const changeLanguage = (next: TranscriptionLanguage) => {
    setLanguage(next);
    void saveTranscriptionLanguage(next).catch(() => {
      setError("Unable to save the speech language setting.");
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Transcribe audio file" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxl + insets.bottom }]}
      >
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Choose an audio file from anywhere on your device. It never leaves this device.</Text>
        </View>

        <View
          style={[
            styles.languageCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <TranscriptionLanguageSelector
            value={activeEngine === "parakeet" ? "en" : language}
            disabled={busy}
            englishOnly={activeEngine === "parakeet"}
            onChange={changeLanguage}
          />
        </View>

        {selected === null ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Choose an audio file</Text>
            <Text style={{ color: colors.textMuted, lineHeight: 22 }}>WAV, MP3, M4A, AAC, or FLAC; up to two hours and 2 GB.</Text>
            <AppButton label="Choose audio" onPress={() => void chooseAudio()} />
          </View>
        ) : (
          <>
            <View style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.fileDetails}>
                <Text selectable numberOfLines={2} style={[styles.fileName, { color: colors.text }]}>{selected.name}</Text>
                <Text selectable style={{ color: colors.textMuted }}>{formatBytes(selected.size)}</Text>
              </View>
              {status !== "complete" && (
                <View style={styles.actions}>
                  <AppButton label={busy ? "Cancel transcription" : "Start transcription"} onPress={() => busy ? void transcriptionService.cancelFileTranscription() : void startTranscription()} />
                  <AppButton label="Choose another audio" variant="secondary" disabled={busy} onPress={() => void chooseAudio()} />
                </View>
              )}
            </View>

            {(busy || status === "complete") && (
              <View style={[styles.transcript, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View accessibilityLiveRegion="polite" style={styles.statusRow}>
                  {busy && (
                    <ActivityIndicator
                      accessibilityLabel={status === "preparing" ? "Preparing audio" : "Transcribing"}
                      color={colors.accent}
                      size="large"
                    />
                  )}
                  <Text style={[styles.status, { color: busy ? colors.accent : colors.textMuted }]}>
                    {status === "preparing" ? "Preparing audio" : status === "transcribing" ? "Transcribing" : "Transcription complete"}
                  </Text>
                </View>
                <Text selectable style={[styles.body, { color: transcript ? colors.text : colors.textMuted }]}>
                  {transcript || (status === "preparing" ? "Converting audio locally when needed…" : "The full transcript will appear here.")}
                </Text>
              </View>
            )}

            {status === "complete" && (
              <View style={styles.actions}>
                <AppButton label="Save as note" onPress={() => void prepareSave()} />
                <AppButton label="Discard" variant="secondary" onPress={discard} />
              </View>
            )}
          </>
        )}
        {error !== null && <Text selectable style={{ color: colors.danger }}>{error}</Text>}
      </ScrollView>

      <SafeAreaModal dismissDisabled={isSaving} visible={showSave} onRequestClose={() => setShowSave(false)}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Save transcription</Text>
          <ModalCloseButton
            disabled={isSaving}
            onPress={() => setShowSave(false)}
            tintColor={colors.textMuted}
          />
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>Note name</Text>
        <TextInput value={noteName} onChangeText={setNoteName} placeholder="e.g. Interview recording" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.textMuted }]}>Workspace</Text>
        <View style={styles.workspaceList}>
          {workspaces.map((workspace) => {
            const active = workspace.getId() === selectedWorkspaceId;
            return <Pressable key={workspace.getId()} onPress={() => setSelectedWorkspaceId(workspace.getId())} style={[styles.workspace, { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.background }]}><Text style={{ color: colors.text, fontWeight: active ? "800" : "500" }}>{workspace.getName()}</Text></Pressable>;
          })}
        </View>
        {error !== null && <Text selectable style={{ color: colors.danger }}>{error}</Text>}
        {isSaving && <View style={styles.savingStatus}><ActivityIndicator color={colors.accent} /><Text style={[styles.status, { color: colors.textMuted }]}>Saving the original Note first…</Text></View>}
        <AppButton label={isSaving ? "Saving…" : "Save note"} disabled={isSaving || noteName.trim().length === 0} onPress={() => void save()} />
      </SafeAreaModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.xl, padding: Spacing.lg },
  header: { gap: Spacing.sm },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 36, fontWeight: "800", lineHeight: 42 },
  subtitle: { fontSize: 16, lineHeight: 24 },
  languageCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md },
  emptyCard: { borderRadius: Radius.md, borderWidth: 1, gap: Spacing.md, padding: Spacing.lg },
  cardTitle: { fontSize: 20, fontWeight: "800" },
  fileCard: { borderRadius: Radius.md, borderWidth: 1, gap: Spacing.lg, padding: Spacing.lg },
  fileDetails: { gap: Spacing.xs },
  fileName: { fontSize: 18, fontWeight: "800" },
  transcript: { borderRadius: Radius.md, borderWidth: 1, gap: Spacing.md, minHeight: 260, padding: Spacing.lg },
  statusRow: { alignItems: "center", flexDirection: "row", gap: Spacing.md, minHeight: 40 },
  status: { fontSize: 14, fontWeight: "800" },
  body: { fontSize: 18, lineHeight: 29 },
  actions: { gap: Spacing.sm },
  modalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  modalTitle: { fontSize: 24, fontWeight: "800" },
  label: { fontSize: 14, fontWeight: "700" },
  input: { borderRadius: Radius.sm, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: Spacing.md },
  workspaceList: { gap: Spacing.sm },
  workspace: { borderRadius: Radius.sm, borderWidth: 1, padding: Spacing.md },
  savingStatus: { alignItems: "center", flexDirection: "row", gap: Spacing.sm },
});
