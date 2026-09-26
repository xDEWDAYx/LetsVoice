import { UiAlert as Alert } from "@/localization/ui-alert";
import { UiTextInput as TextInput } from "@/components/ui-text-input";
import { UiText as Text } from "@/components/ui-text";
import { requestRecordingPermissionsAsync } from "expo-audio";
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from "expo-keep-awake";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addAudioInterruptionListener } from "../../modules/audio-session-events";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { ModalCloseButton } from "@/components/modal-close-button";
import { SafeAreaModal } from "@/components/safe-area-modal";
import { TranscriptionLanguageSelector } from "@/components/transcription-language-selector";
import { Backgrounds, Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import type { SttModelEngine } from "@/domain/stt-model/stt-model";
import type { Workspace } from "@/domain/workspace/workspace";
import { useTheme } from "@/hooks/use-theme";
import { createDefaultNoteTitle } from "@/services/note-title";
import {
  readTranscriptionLanguage,
  saveTranscriptionLanguage,
  type TranscriptionLanguage,
} from "@/services/transcription-language";

type SessionStatus = "idle" | "starting" | "recording" | "paused" | "finishing";
type FinishedSession = { transcript: string; audioRelativePath: string };
const LIVE_TRANSCRIPTION_KEEP_AWAKE_TAG = "letsvoice-live-transcription";

export default function TranscriptionScreen() {
  const router = useRouter();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const {
    noteService,
    noteTitleGenerationService,
    sttModelService,
    transcriptionService,
    workspaceService,
  } = appContainer;
  const [status, setStatus] = useState<SessionStatus>("idle");
  const statusRef = useRef<SessionStatus>("idle");
  const noteNameEditedRef = useRef(false);
  const noteTitleRequestRef = useRef(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<FinishedSession | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [noteName, setNoteName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingNoteTitle, setIsGeneratingNoteTitle] = useState(false);
  const [isCompletingPausedTranscript, setIsCompletingPausedTranscript] = useState(false);
  const [language, setLanguage] = useState<TranscriptionLanguage>(readTranscriptionLanguage);
  const [activeEngine, setActiveEngine] = useState<SttModelEngine | null>(null);

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

  useEffect(() => {
    const pauseForSystem = (message: string) => {
      if (statusRef.current !== "recording") return;

      statusRef.current = "paused";
      setStatus("paused");
      setIsCompletingPausedTranscript(true);
      void deactivateKeepAwake(LIVE_TRANSCRIPTION_KEEP_AWAKE_TAG).catch(
        () => undefined,
      );
      void transcriptionService.pause().then(
        () => {
          setIsCompletingPausedTranscript(false);
          setError(message);
        },
        () => {
          setIsCompletingPausedTranscript(false);
          setError(
            "LetsVoice could not fully pause the recording. Return to the app and finish or discard it.",
          );
        },
      );
    };

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" || statusRef.current !== "recording") return;
      pauseForSystem(
        "Recording paused because LetsVoice left the foreground or the device was locked. Tap Resume when you are ready.",
      );
    });
    const interruptionSubscription = addAudioInterruptionListener((event) => {
      if (event.type === "began") {
        pauseForSystem(
          "Recording paused because another app or system feature interrupted the microphone. Tap Resume when you are ready.",
        );
      }
    });

    return () => {
      subscription.remove();
      interruptionSubscription.remove();
    };
  }, [transcriptionService]);

  useEffect(() => () => {
    statusRef.current = "idle";
    noteTitleRequestRef.current += 1;
    void deactivateKeepAwake(LIVE_TRANSCRIPTION_KEEP_AWAKE_TAG).catch(
      () => undefined,
    );
    void transcriptionService.discard();
  }, [transcriptionService]);

  const start = async () => {
    Keyboard.dismiss();
    statusRef.current = "starting";
    setStatus("starting");
    setError(null);
    setTranscript("");
    noteNameEditedRef.current = false;
    noteTitleRequestRef.current += 1;
    setNoteName("");
    setIsGeneratingNoteTitle(false);
    setIsCompletingPausedTranscript(false);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Microphone permission is required.");
      await transcriptionService.start(
        {
          onText: setTranscript,
          onError: setError,
          onDurationWarning: () => {
            Alert.alert(
              "Five minutes remaining",
              "Live transcription will finish automatically at the two-hour limit.",
            );
          },
          onDurationLimitReached: () => {
            void finish();
          },
        },
        { language: activeEngine === "parakeet" ? "en" : language },
      );
      statusRef.current = "recording";
      setStatus("recording");
      void activateKeepAwakeAsync(LIVE_TRANSCRIPTION_KEEP_AWAKE_TAG).catch(
        () => undefined,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start transcription.");
      statusRef.current = "idle";
      setStatus("idle");
    }
  };

  const changeLanguage = (next: TranscriptionLanguage) => {
    setLanguage(next);
    void saveTranscriptionLanguage(next).catch(() => {
      setError("Unable to save the speech language setting.");
    });
  };

  const togglePause = async () => {
    try {
      if (status === "recording") {
        statusRef.current = "paused";
        setStatus("paused");
        setIsCompletingPausedTranscript(true);
        void deactivateKeepAwake(LIVE_TRANSCRIPTION_KEEP_AWAKE_TAG).catch(
          () => undefined,
        );
        try {
          await transcriptionService.pause();
        } finally {
          setIsCompletingPausedTranscript(false);
        }
      } else if (status === "paused" && !isCompletingPausedTranscript) {
        await transcriptionService.resume();
        statusRef.current = "recording";
        setStatus("recording");
        setError(null);
        void activateKeepAwakeAsync(LIVE_TRANSCRIPTION_KEEP_AWAKE_TAG).catch(
          () => undefined,
        );
      }
    } catch {
      setError("Unable to change recording state.");
    }
  };

  const discardFinishedSession = (session: FinishedSession) => {
    noteTitleRequestRef.current += 1;
    noteNameEditedRef.current = false;
    transcriptionService.deleteRecording(session.audioRelativePath);
    setFinished(null);
    setTranscript("");
    setNoteName("");
    setIsGeneratingNoteTitle(false);
    setWorkspaceQuery("");
    setError(null);
  };

  const confirmDiscardFinishedSession = () => {
    if (finished === null || isSaving) return;
    Keyboard.dismiss();
    Alert.alert(
      "Discard recording?",
      "This permanently deletes the finished recording and transcript.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => discardFinishedSession(finished),
        },
      ],
    );
  };

  const finish = async () => {
    statusRef.current = "finishing";
    setStatus("finishing");
    setIsCompletingPausedTranscript(false);
    setError(null);
    void deactivateKeepAwake(LIVE_TRANSCRIPTION_KEEP_AWAKE_TAG).catch(
      () => undefined,
    );
    try {
      const result = await transcriptionService.finish();
      setTranscript(result.transcript);
      statusRef.current = "idle";
      setStatus("idle");
      if (result.transcript.trim().length === 0) {
        Alert.alert(
          "No speech detected",
          "LetsVoice cannot create a note because no speech was transcribed. Discard the empty recording and try again.",
          [
            {
              text: "Discard recording",
              style: "destructive",
              onPress: () => discardFinishedSession(result),
            },
          ],
          { cancelable: false },
        );
        return;
      }
      void prepareSave(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to finish transcription.");
      const recoveryStatus: SessionStatus = transcriptionService.hasActiveSession()
        ? "paused"
        : "idle";
      statusRef.current = recoveryStatus;
      setStatus(recoveryStatus);
    }
  };

  const prepareSave = async (result: FinishedSession) => {
    try {
      const defaultWorkspace = await workspaceService.getOrCreateDefaultWorkspace();
      const all = await workspaceService.getWorkspaces();
      const titleRequestId = noteTitleRequestRef.current + 1;
      noteTitleRequestRef.current = titleRequestId;
      noteNameEditedRef.current = false;
      setWorkspaces(all);
      setSelectedWorkspaceId(defaultWorkspace.getId());
      setWorkspaceQuery("");
      setNoteName(createDefaultNoteTitle());
      setIsGeneratingNoteTitle(true);
      setFinished(result);
      void noteTitleGenerationService.generate(result.transcript).then((title) => {
        if (titleRequestId !== noteTitleRequestRef.current) return;
        if (title && !noteNameEditedRef.current) setNoteName(title);
      }).finally(() => {
        if (titleRequestId === noteTitleRequestRef.current) {
          setIsGeneratingNoteTitle(false);
        }
      });
    } catch {
      setError("Unable to load workspaces.");
    }
  };

  const updateNoteName = (value: string) => {
    noteNameEditedRef.current = true;
    setNoteName(value);
  };

  const save = async () => {
    if (finished === null) return;
    setIsSaving(true);
    setError(null);
    try {
      const note = await noteService.createNote(
        selectedWorkspaceId,
        noteName,
        finished.transcript,
        finished.audioRelativePath,
      );
      noteTitleRequestRef.current += 1;
      setIsGeneratingNoteTitle(false);
      setFinished(null);
      router.replace({
        pathname: "/notes/[noteId]",
        params: { noteId: note.getId(), section: "insights", autoGenerate: "1" },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save note.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredWorkspaces = useMemo(() => {
    const query = workspaceQuery.normalize("NFKC").toLocaleLowerCase().trim();
    if (!query) return workspaces;
    return workspaces.filter((workspace) =>
      workspace.getName().normalize("NFKC").toLocaleLowerCase().includes(query),
    );
  }, [workspaceQuery, workspaces]);
  const selectedWorkspaceVisible = filteredWorkspaces.some(
    (workspace) => workspace.getId() === selectedWorkspaceId,
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, experimental_backgroundImage: Backgrounds[theme.mode] }]}>
      <Stack.Screen options={{ title: "Live transcription" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Spacing.xxl + insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Audio and transcription stay on this device.</Text>
        </View>
        <View style={[styles.languageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TranscriptionLanguageSelector
            value={activeEngine === "parakeet" ? "en" : language}
            disabled={status !== "idle"}
            englishOnly={activeEngine === "parakeet"}
            onChange={changeLanguage}
          />
        </View>
        <View style={[styles.sessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.transcript}>
            <Text style={[styles.status, { color: status === "recording" || isCompletingPausedTranscript ? colors.accent : colors.textMuted }]}>
              {status === "recording" ? "●  Recording" : status === "paused" ? (isCompletingPausedTranscript ? "Paused • Completing transcript…" : "Paused • Transcript up to date") : status === "starting" ? "Loading model…" : status === "finishing" ? "Finishing…" : "Ready to record"}
            </Text>
            <Text selectable style={[styles.body, { color: transcript ? colors.text : colors.textMuted }]}>
              {transcript || "Your live transcript will appear here."}
            </Text>
            {error && <Text selectable style={{ color: colors.danger }}>{error}</Text>}
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.controls}>
          {status === "idle" && <View style={styles.idleControl}>
            <Pressable accessibilityRole="button" accessibilityLabel="Start recording" onPress={() => void start()} style={({ pressed }) => [styles.recordButton, { backgroundColor: colors.accent }, pressed && styles.controlPressed]}>
              <View style={[styles.recordButtonInner, { backgroundColor: colors.surface }]} />
            </Pressable>
            <View style={styles.controlCopy}>
              <Text style={[styles.controlTitle, { color: colors.text }]}>Start recording</Text>
              <Text style={[styles.controlHint, { color: colors.textMuted }]}>Tap the button to begin live transcription</Text>
            </View>
          </View>}
          {(status === "starting" || status === "finishing") && <View style={styles.busyControl}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.controlHint, { color: colors.textMuted }]}>{status === "starting" ? "Preparing the speech model…" : "Finishing your transcript…"}</Text>
          </View>}
          {(status === "recording" || status === "paused") && (
            <View style={styles.activeControls}>
              <Pressable accessibilityRole="button" accessibilityLabel={status === "paused" ? "Resume recording" : "Pause recording"} accessibilityState={{ disabled: isCompletingPausedTranscript }} disabled={isCompletingPausedTranscript} onPress={() => void togglePause()} style={({ pressed }) => [styles.pauseButton, { backgroundColor: colors.accentSoft, borderColor: colors.border }, isCompletingPausedTranscript && styles.controlDisabled, pressed && styles.controlPressed]}>
                {isCompletingPausedTranscript ? <ActivityIndicator color={colors.accent} /> : <Text style={[styles.pauseIcon, { color: colors.accent }]}>{status === "paused" ? "▶" : "Ⅱ"}</Text>}
              </Pressable>
              <View style={styles.activeCopy}>
                <Text style={[styles.controlTitle, { color: colors.text }]}>{status === "paused" ? "Recording paused" : "Recording in progress"}</Text>
                <Text style={[styles.controlHint, { color: colors.textMuted }]}>{status === "paused" ? (isCompletingPausedTranscript ? "Finishing text from audio already captured" : "Resume when you are ready") : "Your words appear above as you speak"}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: isCompletingPausedTranscript }} disabled={isCompletingPausedTranscript} onPress={() => void finish()} style={({ pressed }) => [styles.finishButton, { borderColor: colors.accent }, isCompletingPausedTranscript && styles.controlDisabled, pressed && styles.controlPressed]}>
                <Text style={[styles.finishLabel, { color: colors.accent }]}>Finish</Text>
              </Pressable>
            </View>
          )}
          </View>
        </View>
      </ScrollView>

      <SafeAreaModal
        androidPresentation="center"
        dismissDisabled={isSaving}
        visible={finished !== null}
        onRequestClose={confirmDiscardFinishedSession}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Save transcription</Text>
          <ModalCloseButton
            disabled={isSaving}
            label="Close save transcription"
            onPress={confirmDiscardFinishedSession}
            tintColor={colors.textMuted}
          />
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>Note name</Text>
        <TextInput accessibilityLabel="Note name" value={noteName} onChangeText={updateNoteName} placeholder="e.g. Weekly planning" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        {isGeneratingNoteTitle && (
          <View accessibilityLiveRegion="polite" style={styles.titleGenerationStatus}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={[styles.controlHint, { color: colors.textMuted }]}>Generating a title locally…</Text>
          </View>
        )}
        <Text style={[styles.label, { color: colors.textMuted }]}>Workspace</Text>
        <TextInput
          accessibilityLabel="Search workspaces"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setWorkspaceQuery}
          onSubmitEditing={Keyboard.dismiss}
          placeholder="Search workspaces"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          value={workspaceQuery}
        />
        <ScrollView
          accessibilityLabel="Workspace choices"
          contentContainerStyle={styles.workspaceList}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          style={styles.workspaceListScroll}
        >
          {filteredWorkspaces.length === 0 ? (
            <View style={[styles.workspaceEmpty, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.workspaceEmptyText, { color: colors.textMuted }]}>No workspaces match “{workspaceQuery.trim()}”.</Text>
            </View>
          ) : filteredWorkspaces.map((workspace) => {
              const selected = workspace.getId() === selectedWorkspaceId;
              return (
                <Pressable
                  accessibilityLabel={`Choose ${workspace.getName()} workspace`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={workspace.getId()}
                  onPress={() => setSelectedWorkspaceId(workspace.getId())}
                  style={({ pressed }) => [
                    styles.workspace,
                    { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.background },
                    pressed && styles.controlPressed,
                  ]}
                >
                  <Text numberOfLines={2} style={[styles.workspaceName, { color: colors.text, fontWeight: selected ? "800" : "500" }]}>{workspace.getName()}</Text>
                  <Text accessibilityElementsHidden style={[styles.workspaceSelection, { color: selected ? colors.accent : colors.textMuted }]}>{selected ? "✓" : ""}</Text>
                </Pressable>
              );
            })}
        </ScrollView>
        {workspaceQuery.trim() && !selectedWorkspaceVisible && filteredWorkspaces.length > 0 && (
          <Text style={[styles.workspaceSelectionHint, { color: colors.textMuted }]}>Choose a workspace from these results before saving.</Text>
        )}
        {error && <Text selectable style={{ color: colors.danger }}>{error}</Text>}
        {isSaving && <View style={styles.savingStatus}><ActivityIndicator color={colors.accent} /><Text style={[styles.controlHint, { color: colors.textMuted }]}>Saving the original Note first…</Text></View>}
        <AppButton label={isSaving ? "Saving…" : "Save note"} disabled={isSaving || noteName.trim().length === 0 || !selectedWorkspaceVisible} onPress={() => void save()} />
      </SafeAreaModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.lg, padding: Spacing.lg },
  header: { gap: Spacing.sm },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 32, fontWeight: "800", lineHeight: 38 },
  subtitle: { fontSize: 16, lineHeight: 24 },
  languageCard: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md },
  sessionCard: { borderCurve: "continuous", borderRadius: Radius.lg, borderWidth: 1, boxShadow: Shadows.raised, overflow: "hidden" },
  transcript: { gap: Spacing.md, minHeight: 300, padding: Spacing.lg },
  status: { fontSize: 14, fontWeight: "800" },
  body: { fontSize: 18, lineHeight: 29 },
  divider: { height: StyleSheet.hairlineWidth },
  controls: { minHeight: 124, padding: Spacing.md },
  idleControl: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  recordButton: { alignItems: "center", borderRadius: 42, height: 84, justifyContent: "center", width: 84 },
  recordButtonInner: { borderRadius: 17, height: 34, width: 34 },
  controlCopy: { flex: 1, gap: Spacing.xs },
  controlTitle: { fontSize: 18, fontWeight: "800" },
  controlHint: { fontSize: 13, lineHeight: 19 },
  busyControl: { alignItems: "center", flex: 1, gap: Spacing.sm, justifyContent: "center" },
  activeControls: { alignItems: "center", flex: 1, flexDirection: "row", gap: Spacing.sm },
  pauseButton: { alignItems: "center", borderRadius: 30, borderWidth: 1, height: 60, justifyContent: "center", width: 60 },
  pauseIcon: { fontSize: 22, fontWeight: "900" },
  activeCopy: { flex: 1, gap: 2, minWidth: 0 },
  finishButton: { alignItems: "center", borderRadius: Radius.md, borderWidth: 1, justifyContent: "center", minHeight: 46, paddingHorizontal: Spacing.md },
  finishLabel: { fontSize: 14, fontWeight: "800" },
  controlPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  controlDisabled: { opacity: 0.5 },
  modalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  modalTitle: { fontSize: 24, fontWeight: "800" },
  label: { fontSize: 14, fontWeight: "700" },
  input: { borderRadius: Radius.sm, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: Spacing.md },
  titleGenerationStatus: { alignItems: "center", flexDirection: "row", gap: Spacing.sm },
  workspaceListScroll: { maxHeight: 260 },
  workspaceList: { gap: Spacing.sm, paddingVertical: 1 },
  workspace: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", gap: Spacing.sm, justifyContent: "space-between", minHeight: 48, padding: Spacing.md },
  workspaceName: { flex: 1, minWidth: 0 },
  workspaceSelection: { fontSize: 16, fontWeight: "900", minWidth: 18, textAlign: "center" },
  workspaceEmpty: { borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, justifyContent: "center", minHeight: 72, padding: Spacing.md },
  workspaceEmptyText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  workspaceSelectionHint: { fontSize: 12, lineHeight: 17 },
  savingStatus: { alignItems: "center", flexDirection: "row", gap: Spacing.sm },
});
