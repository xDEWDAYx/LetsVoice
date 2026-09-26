import { UiTextInput as TextInput } from "@/components/ui-text-input";
import { UiText as Text } from "@/components/ui-text";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { Stack, type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { ModalCloseButton } from "@/components/modal-close-button";
import { SafeAreaModal } from "@/components/safe-area-modal";
import { SafeMarkdownText } from "@/components/safe-markdown-text";
import { SpeechPlaybackButton } from "@/components/speech-playback-button";
import {
  NO_ACTIVE_LLM_ERROR,
  TRANSCRIPT_TOO_LONG_ERROR,
} from "@/constants/ask-ai-grounding-policy";
import { Colors, Radius, Spacing } from "@/constants/theme";
import type { AiMessage } from "@/domain/ai-message/ai-message";
import type { Note } from "@/domain/note/note";
import { useTheme } from "@/hooks/use-theme";
import { useTrashUndo } from "@/providers/trash-undo-provider";
import type { AiConversationHistoryItem } from "@/services/ai-conversation-service";
import type { LlmGenerationSnapshot } from "@/services/llm-inference-service";
import { InferenceCancelledError } from "@/services/local-llm-coordinator";
import { markdownToPlainText } from "@/services/safe-markdown";
import { formatDate } from "@/utils/format-date";

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      transcriptNotes: Note[];
      selectedNotes: Note[];
      messages: AiMessage[];
      conversationId: string | null;
      hasActiveModel: boolean;
      activeModelFileExists: boolean;
      sourcesAvailable: boolean;
    };

type VoiceStatus = "idle" | "starting" | "recording" | "finishing";

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function noteTitle(note: Note | null): string {
  return note?.getName()?.trim() || "Untitled transcript";
}

function contextLabel(notes: readonly Note[]): string {
  return `${notes.length} selected ${notes.length === 1 ? "transcript" : "transcripts"}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function generationPhaseLabel(snapshot: LlmGenerationSnapshot): string {
  if (snapshot.status !== "running") return "AI is working…";
  switch (snapshot.phase) {
    case "preparing-context":
      return "Preparing note context…";
    case "waiting":
      return "Waiting for local AI…";
    case "loading-model":
      return "Loading the language model…";
    case "generating":
      return "Generating an answer…";
    case "saving":
      return "Saving the answer…";
    case "stopping":
      return "Stopping generation…";
  }
}

export default function AskAiScreen() {
  const params = useLocalSearchParams<{
    conversationId?: string;
    mode?: string;
    noteId?: string;
    noteIds?: string;
  }>();
  const router = useRouter();
  const { showTrashUndo } = useTrashUndo();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const {
    aiConversationService,
    llmInferenceService,
    llmModelService,
    noteService,
    transcriptionService,
  } = appContainer;
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isLocallyGenerating, setIsLocallyGenerating] = useState(false);
  const [generationSnapshot, setGenerationSnapshot] =
    useState<LlmGenerationSnapshot>(() =>
      llmInferenceService.getGenerationSnapshot(),
    );
  const [notice, setNotice] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [history, setHistory] = useState<AiConversationHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState<"loading" | "trashing" | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceText, setVoiceText] = useState("");
  const scrollViewRef = useRef<ScrollView | null>(null);
  const isMountedRef = useRef(true);
  const observedGenerationConversationRef = useRef<string | null>(
    generationSnapshot.status === "running"
      ? generationSnapshot.conversationId
      : null,
  );
  const generationInFlightRef = useRef(false);
  const retryInFlightRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const [shouldFollowLatestMessage, setShouldFollowLatestMessage] =
    useState(true);

  useFocusEffect(useCallback(() => {
    void Promise.allSettled([
      llmInferenceService.ensureReady(),
      appContainer.speechPlaybackService.ensureReady(),
    ]);
  }, [llmInferenceService]));

  const routeConversationId = firstParam(params.conversationId);
  const routeMode = firstParam(params.mode);
  const routeNoteId = firstParam(params.noteId);
  const routeNoteIds = useMemo(() => {
    const value = firstParam(params.noteIds);
    const ids = value ? value.split(",") : routeNoteId ? [routeNoteId] : [];
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
  }, [params.noteIds, routeNoteId]);
  const isPersisted = state.status === "ready" && state.conversationId !== null;
  const isServiceGeneratingCurrentConversation =
    generationSnapshot.status === "running" &&
    state.status === "ready" &&
    state.conversationId === generationSnapshot.conversationId;
  const isGenerating =
    isLocallyGenerating || isServiceGeneratingCurrentConversation;
  const isAnyGenerationActive =
    isLocallyGenerating || generationSnapshot.status === "running";
  const isBusy = isAnyGenerationActive || voiceStatus !== "idle";
  const isHistoryBusy = historyBusy !== null;
  const latestMessage =
    state.status === "ready" ? (state.messages.at(-1) ?? null) : null;
  const hasUnansweredUserMessage =
    isPersisted && !isGenerating && latestMessage?.getRole() === "user";

  const visibleMessages = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.messages;
  }, [state]);

  const load = async () => {
    if (
      routeConversationId !== null &&
      state.status === "ready" &&
      state.conversationId === routeConversationId
    ) {
      return;
    }

    setState({ status: "loading" });
    setNotice(null);

    try {
      const [transcriptNotes, activeModel] = await Promise.all([
        noteService.getTranscriptNotes(),
        llmModelService.getActiveModel(),
      ]);
      const hasActiveModel = activeModel !== null;
      const activeModelFileExists =
        activeModel === null || llmModelService.resolveModelFile(activeModel).exists;

      if (routeConversationId !== null) {
        await aiConversationService.getConversationOrThrow(routeConversationId);
        const [messages, linkedNotes, sourcesAvailable] = await Promise.all([
          aiConversationService.getCanonicalMessages(routeConversationId),
          aiConversationService.getLinkedNotes(routeConversationId),
          aiConversationService.canGenerate(routeConversationId),
        ]);

        setState({
          status: "ready",
          transcriptNotes,
          selectedNotes: linkedNotes,
          messages,
          conversationId: routeConversationId,
          hasActiveModel,
          activeModelFileExists,
          sourcesAvailable,
        });
        return;
      }

      const selectedNotes = routeNoteIds.length > 0
        ? routeNoteIds.flatMap((id) => transcriptNotes.find((note) => note.getId() === id) ?? [])
        : transcriptNotes.slice(0, 1);
      if (routeNoteIds.length > 3) throw new Error("Select up to 3 notes.");
      if (routeNoteIds.length > 0 && selectedNotes.length !== routeNoteIds.length) {
        throw new Error("One or more selected notes are unavailable.");
      }

      const resumeTarget =
        routeMode !== "new" && selectedNotes.length > 0
          ? await aiConversationService.getResumeTargetForNotes(selectedNotes.map((note) => note.getId()))
          : null;
      if (resumeTarget !== null) {
        const resumeConversationId = resumeTarget.getId();
        const messages =
          await aiConversationService.getCanonicalMessages(resumeConversationId);
        setState({
          status: "ready",
          transcriptNotes,
          selectedNotes,
          messages,
          conversationId: resumeConversationId,
          hasActiveModel,
          activeModelFileExists,
          sourcesAvailable: true,
        });
        return;
      }

      setState({
        status: "ready",
        transcriptNotes,
        selectedNotes,
        messages: [],
        conversationId: null,
        hasActiveModel,
        activeModelFileExists,
        sourcesAvailable: true,
      });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  };

  useEffect(() => {
    void load();
  }, [routeConversationId, routeMode, routeNoteId, params.noteIds]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(
    () =>
      llmInferenceService.subscribeToGeneration((snapshot) => {
        const completedConversationId =
          snapshot.status === "idle"
            ? observedGenerationConversationRef.current
            : null;
        observedGenerationConversationRef.current =
          snapshot.status === "running" ? snapshot.conversationId : null;
        setGenerationSnapshot(snapshot);

        if (completedConversationId !== null) {
          void aiConversationService
            .getCanonicalMessages(completedConversationId)
            .then((messages) => {
              if (!isMountedRef.current) return;
              setState((previous) =>
                previous.status === "ready" &&
                previous.conversationId === completedConversationId
                  ? { ...previous, messages }
                  : previous,
              );
            })
            .catch(() => undefined);
        }
      }),
    [aiConversationService, llmInferenceService],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void llmModelService.getActiveModel().then((activeModel) => {
        if (!active) return;
        const hasActiveModel = activeModel !== null;
        const activeModelFileExists =
          activeModel === null || llmModelService.resolveModelFile(activeModel).exists;
        setState((previous) =>
          previous.status === "ready"
            ? {
                ...previous,
                hasActiveModel,
                activeModelFileExists,
              }
            : previous,
        );
      }).catch((error) => {
        if (active) setNotice(errorMessage(error));
      });
      return () => {
        active = false;
      };
    }, [llmModelService]),
  );

  useEffect(
    () => () => {
      void transcriptionService.discard();
    },
    [transcriptionService],
  );

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () =>
      setIsKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setIsKeyboardVisible(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const refreshMessages = async (conversationId: string) => {
    const messages = await aiConversationService.getCanonicalMessages(
      conversationId,
    );
    if (!isMountedRef.current) return;
    setState((previous) =>
      previous.status === "ready" && previous.conversationId === conversationId
        ? { ...previous, messages }
        : previous,
    );
  };

  const claimGeneration = (): boolean => {
    if (generationInFlightRef.current || llmInferenceService.getIsGenerating()) {
      return false;
    }

    generationInFlightRef.current = true;
    setIsLocallyGenerating(true);
    return true;
  };

  const generateForConversation = async (conversationId: string) => {
    setNotice(null);
    setStreamingText("");

    try {
      await llmInferenceService.generate(conversationId, {
        onToken: (tokenText) => {
          if (!isMountedRef.current) return;
          setStreamingText((previous) => previous + tokenText);
        },
      });
      if (isMountedRef.current) setStreamingText("");
      await refreshMessages(conversationId);
      if (isMountedRef.current) setNotice(null);
    } catch (error) {
      if (error instanceof InferenceCancelledError) {
        if (isMountedRef.current) setStreamingText("");
        return;
      }
      const message = errorMessage(error);
      if (isMountedRef.current) {
        setNotice(
          message === TRANSCRIPT_TOO_LONG_ERROR
            ? TRANSCRIPT_TOO_LONG_ERROR
            : message,
        );
        setStreamingText("");
      }
      await refreshMessages(conversationId).catch(() => undefined);
    } finally {
      generationInFlightRef.current = false;
      if (isMountedRef.current) setIsLocallyGenerating(false);
    }
  };

  const sendMessage = async (rawContent: string, ignoreBusy = false) => {
    const content = rawContent.trim();
    if (state.status !== "ready" || content.length === 0) return;
    if (sendInFlightRef.current || generationInFlightRef.current) return;
    if (!ignoreBusy && isBusy) return;

    if (hasUnansweredUserMessage) {
      setNotice(
        "Finish the current turn first. Retry the last question or start a new conversation.",
      );
      return;
    }

    if (state.selectedNotes.length === 0 && state.conversationId === null) {
      setNotice("Select at least one transcript before asking.");
      return;
    }

    if (!state.sourcesAvailable) {
      setNotice("Restore all source notes and workspaces before asking another question.");
      return;
    }

    setNotice(null);
    setStreamingText("");
    if (!claimGeneration()) {
      return;
    }
    sendInFlightRef.current = true;

    let generationConversationId: string | null = null;
    try {
      const createdNewConversation = state.conversationId === null;
      const sendResult =
        state.conversationId === null
          ? await aiConversationService.sendUserMessage({
              noteIds: state.selectedNotes.map((note) => note.getId()),
              content,
            })
          : await aiConversationService.sendUserMessage({
              conversationId: state.conversationId,
              content,
            });

      generationConversationId = sendResult.conversationId;
      if (isMountedRef.current) {
        setInput("");
        setState((previous) =>
          previous.status === "ready"
            ? {
                ...previous,
                conversationId: sendResult.conversationId,
                messages: sendResult.messages,
              }
            : previous,
        );
      }
      if (createdNewConversation && isMountedRef.current) {
        router.setParams({ conversationId: sendResult.conversationId });
      }

      await generateForConversation(sendResult.conversationId);
    } catch (error) {
      generationInFlightRef.current = false;
      if (isMountedRef.current) setIsLocallyGenerating(false);
      const message = errorMessage(error);
      if (isMountedRef.current) {
        setNotice(
          message === TRANSCRIPT_TOO_LONG_ERROR
            ? TRANSCRIPT_TOO_LONG_ERROR
            : message,
        );
        setStreamingText("");
      }
      if (generationConversationId !== null) {
        await refreshMessages(generationConversationId).catch(() => undefined);
      }
    } finally {
      sendInFlightRef.current = false;
    }
  };

  const retryLastUserMessage = async () => {
    if (
      state.status !== "ready" ||
      state.conversationId === null ||
      !hasUnansweredUserMessage ||
      !state.sourcesAvailable ||
      isBusy ||
      retryInFlightRef.current ||
      generationInFlightRef.current
    ) {
      return;
    }

    retryInFlightRef.current = true;
    if (!claimGeneration()) {
      retryInFlightRef.current = false;
      return;
    }

    let handedOffToGeneration = false;
    try {
      const canonicalMessages =
        await aiConversationService.getCanonicalMessages(state.conversationId);
      const canonicalLastMessage = canonicalMessages.at(-1) ?? null;

      if (canonicalLastMessage?.getRole() === "assistant") {
        if (!isMountedRef.current) return;
        setStreamingText("");
        setNotice(null);
        setState((previous) =>
          previous.status === "ready" &&
          previous.conversationId === state.conversationId
            ? { ...previous, messages: canonicalMessages }
            : previous,
        );
        generationInFlightRef.current = false;
        setIsLocallyGenerating(false);
        return;
      }

      if (canonicalLastMessage?.getRole() !== "user") {
        generationInFlightRef.current = false;
        if (isMountedRef.current) setIsLocallyGenerating(false);
        await refreshMessages(state.conversationId).catch(() => undefined);
        return;
      }

      if (isMountedRef.current) {
        setState((previous) =>
          previous.status === "ready" &&
          previous.conversationId === state.conversationId
            ? { ...previous, messages: canonicalMessages }
            : previous,
        );
      }
      handedOffToGeneration = true;
      await generateForConversation(state.conversationId);
    } catch (error) {
      const message = errorMessage(error);
      if (isMountedRef.current) {
        setNotice(
          message === TRANSCRIPT_TOO_LONG_ERROR
            ? TRANSCRIPT_TOO_LONG_ERROR
            : message,
        );
        setStreamingText("");
      }
      await refreshMessages(state.conversationId).catch(() => undefined);
    } finally {
      if (!handedOffToGeneration) {
        generationInFlightRef.current = false;
        if (isMountedRef.current) setIsLocallyGenerating(false);
      }
      retryInFlightRef.current = false;
    }
  };

  const stopGeneration = async () => {
    setNotice("Generation stopped.");
    await llmInferenceService.stopGeneration();
  };

  const loadHistory = async () => {
    if (isHistoryBusy) return;
    Keyboard.dismiss();
    setHistoryVisible(true);
    setHistoryError(null);
    setHistoryBusy("loading");
    try {
      setHistory(await aiConversationService.getConversationHistory());
    } catch (error) {
      setHistoryError(errorMessage(error));
    } finally {
      setHistoryBusy(null);
    }
  };

  const openHistoryItem = (conversationId: string) => {
    setHistoryVisible(false);
    router.replace({
      pathname: "/ask-ai",
      params: { conversationId },
    } as unknown as Href);
  };

  const trashHistoryItem = async (item: AiConversationHistoryItem) => {
    if (isHistoryBusy) return;
    const id = item.conversation.getId();
    setHistoryBusy("trashing");
    setHistoryError(null);
    try {
      await appContainer.trashService.trashConversation(id);
      setHistory((current) => current.filter((entry) => entry.conversation.getId() !== id));
      showTrashUndo({
        message: `${item.conversation.getName()} moved to Trash`,
        undo: async () => {
          await appContainer.trashService.restore("conversation", id);
          setHistory(await aiConversationService.getConversationHistory());
        },
      });
    } catch (error) {
      setHistoryError(errorMessage(error));
    } finally {
      setHistoryBusy(null);
    }
  };

  const startNewConversation = () => {
    const noteIds = state.status === "ready"
      ? state.selectedNotes.map((note) => note.getId()).join(",")
      : "";
    router.replace({
      pathname: "/ask-ai",
      params: noteIds ? { noteIds, mode: "new" } : { mode: "new" },
    } as unknown as Href);
  };

  const handleMessageScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    setShouldFollowLatestMessage(distanceFromBottom < 72);
  };

  const startVoice = async () => {
    if (isAnyGenerationActive || voiceStatus !== "idle") return;
    Keyboard.dismiss();
    setVoiceStatus("starting");
    setVoiceText("");
    setNotice(null);

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission is required.");
      }
      await transcriptionService.start({
        onText: setVoiceText,
        onError: setNotice,
      });
      setVoiceStatus("recording");
    } catch (error) {
      setNotice(errorMessage(error));
      setVoiceStatus("idle");
    }
  };

  const finishVoice = async () => {
    if (voiceStatus !== "recording") return;
    setVoiceStatus("finishing");
    setNotice(null);

    try {
      const result = await transcriptionService.finish();
      transcriptionService.deleteRecording(result.audioRelativePath);
      setVoiceStatus("idle");
      setVoiceText("");
      if (result.transcript.trim().length === 0) {
        setNotice("Transcription did not produce a question.");
        return;
      }
      await sendMessage(result.transcript, true);
    } catch (error) {
      setNotice(errorMessage(error));
      setVoiceStatus("idle");
    }
  };

  const cancelVoice = async () => {
    await transcriptionService.discard();
    setVoiceStatus("idle");
    setVoiceText("");
  };

  const modelNotice =
    state.status === "ready" && !state.hasActiveModel
      ? NO_ACTIVE_LLM_ERROR
      : state.status === "ready" && !state.activeModelFileExists
        ? "The active model file is missing on this device."
        : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Ask AI" }} />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && (
        <View style={styles.content}>
          <ErrorState message={state.message} onRetry={() => void load()} />
        </View>
      )}
      {state.status === "ready" && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
          style={styles.keyboardAvoidingArea}
        >
          <View style={styles.readyContent}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.messageScroller}
              contentInsetAdjustmentBehavior="automatic"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => {
                if (shouldFollowLatestMessage) {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }
              }}
              onScroll={handleMessageScroll}
              onScrollBeginDrag={Keyboard.dismiss}
              onTouchStart={Keyboard.dismiss}
              scrollEventThrottle={120}
              contentContainerStyle={[
                styles.content,
                { paddingBottom: Spacing.xxl + insets.bottom },
              ]}
            >
              <View style={styles.header}>
                <Text style={[styles.kicker, { color: colors.accent }]}>
                  LOCAL TRANSCRIPT AI
                </Text>
                <Text style={[styles.title, { color: colors.text }]}>Ask AI</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  Ask about up to three transcripts. Answers use only the selected note content.
                </Text>
                <View style={styles.headerActions}>
                  <AppButton
                    label="History"
                    variant="secondary"
                    onPress={() => void loadHistory()}
                  />
                  <AppButton
                    label="Large Language Models"
                    variant="quiet"
                    onPress={() => router.push("/ai/llm-models" as Href)}
                  />
                </View>
              </View>

              {state.transcriptNotes.length === 0 && !isPersisted ? (
                <EmptyState
                  title="You don't have any transcripts yet."
                  action={
                    <AppButton
                      label="Start recording"
                      onPress={() => router.push("/transcription")}
                    />
                  }
                />
              ) : (
                <View
                  style={[
                    styles.contextBar,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.contextText}>
                    <Text style={[styles.contextLabel, { color: colors.textMuted }]}>
                      Based on
                    </Text>
                    <Text style={[styles.contextTitle, { color: colors.text }]}>
                      {contextLabel(state.selectedNotes)}
                    </Text>
                    {isPersisted && (
                      <Text style={[styles.locked, { color: colors.textMuted }]}>
                        Context locked for this conversation
                      </Text>
                    )}
                  </View>
                  {!isPersisted && (
                    <AppButton
                      label="Change"
                      variant="secondary"
                      disabled={isBusy}
                      onPress={() => {
                        Keyboard.dismiss();
                        setPickerVisible(true);
                      }}
                    />
                  )}
                  {isPersisted && (
                    <AppButton
                      label="New"
                      variant="secondary"
                      disabled={isBusy || !state.sourcesAvailable}
                      onPress={startNewConversation}
                    />
                  )}
                </View>
              )}

              {modelNotice !== null && (
                <View
                  style={[
                    styles.notice,
                    { backgroundColor: colors.accentSoft, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.noticeText, { color: colors.text }]}>
                    {modelNotice}
                  </Text>
                  <AppButton
                    label="Open models"
                    variant="quiet"
                    onPress={() => router.push("/ai/llm-models" as Href)}
                  />
                </View>
              )}
              {!state.sourcesAvailable && (
                <View style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
                  <Text style={[styles.noticeText, { color: colors.text }]}>Restore all source notes and workspaces to continue this conversation. Saved messages remain readable.</Text>
                </View>
              )}

              {notice !== null && (
                <Text selectable style={[styles.errorText, { color: colors.danger }]}>
                  {notice}
                </Text>
              )}

              {hasUnansweredUserMessage && !isGenerating && (
                <View
                  style={[
                    styles.notice,
                    { backgroundColor: colors.accentSoft, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.noticeText, { color: colors.text }]}>
                    The last question has not received an assistant response yet.
                  </Text>
                  <View style={styles.composerActions}>
                    <AppButton
                      label="New conversation"
                      variant="secondary"
                      disabled={voiceStatus !== "idle" || !state.sourcesAvailable}
                      onPress={startNewConversation}
                    />
                    <AppButton
                      label="Retry"
                      disabled={voiceStatus !== "idle" || modelNotice !== null || !state.sourcesAvailable}
                      onPress={() => void retryLastUserMessage()}
                    />
                  </View>
                </View>
              )}

              <View style={styles.messages}>
                {visibleMessages.length === 0 &&
                  streamingText.length === 0 &&
                  !isGenerating && (
                    <Text
                      style={[styles.placeholder, { color: colors.textMuted }]}
                    >
                      Start with a question about the selected transcript.
                    </Text>
                  )}
                {visibleMessages.map((message) => (
                  <View
                    key={message.getId()}
                    style={[
                      styles.messageBubble,
                      message.getRole() === "user" ? styles.userBubble : styles.assistantBubble,
                      {
                        backgroundColor:
                          message.getRole() === "user"
                            ? colors.accent
                            : colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {message.getRole() === "assistant" ? (
                      <SafeMarkdownText markdown={message.getContent()} />
                    ) : (
                      <Text
                        selectable
                        style={[styles.messageText, { color: colors.surface }]}
                      >
                        {message.getContent()}
                      </Text>
                    )}
                    {message.getRole() === "assistant" && (
                      <SpeechPlaybackButton
                        speechId={`ask-ai:${message.getId()}`}
                        label="AI answer"
                        text={markdownToPlainText(message.getContent())}
                      />
                    )}
                  </View>
                ))}
                {streamingText.length > 0 && (
                  <View
                    style={[
                      styles.messageBubble,
                      styles.assistantBubble,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <SafeMarkdownText markdown={streamingText} />
                  </View>
                )}
                {isGenerating && streamingText.length === 0 && (
                  <View
                    accessibilityLiveRegion="polite"
                    accessibilityRole="progressbar"
                    style={[
                      styles.messageBubble,
                      styles.assistantBubble,
                      styles.workingBubble,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <ActivityIndicator
                      accessibilityLabel="AI is working"
                      color={colors.accent}
                    />
                    <Text
                      style={[styles.workingText, { color: colors.textMuted }]}
                    >
                      {isServiceGeneratingCurrentConversation
                        ? generationPhaseLabel(generationSnapshot)
                        : "Preparing local AI…"}
                    </Text>
                  </View>
                )}
              </View>

              {voiceStatus !== "idle" && (
                <View
                  style={[
                    styles.voicePanel,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.contextLabel, { color: colors.textMuted }]}>
                    {voiceStatus === "starting"
                      ? "Starting microphone"
                      : voiceStatus === "finishing"
                        ? "Finishing transcription"
                        : "Recording question"}
                  </Text>
                  <Text
                    selectable
                    style={[
                      styles.voiceText,
                      { color: voiceText ? colors.text : colors.textMuted },
                    ]}
                  >
                    {voiceText || "Your spoken question will appear here."}
                  </Text>
                  <View style={styles.composerActions}>
                    <AppButton
                      label="Cancel"
                      variant="secondary"
                      onPress={() => void cancelVoice()}
                    />
                    <AppButton
                      label="Finish"
                      disabled={voiceStatus !== "recording"}
                      onPress={() => void finishVoice()}
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            <View
              style={[
                styles.composer,
                {
                  backgroundColor: colors.surface,
                  borderTopColor: colors.border,
                  paddingBottom: isKeyboardVisible
                    ? Spacing.md
                    : Math.max(Spacing.md, insets.bottom + Spacing.sm),
                },
              ]}
            >
              <TextInput
                multiline
                editable={!isBusy && !hasUnansweredUserMessage && state.sourcesAvailable}
                placeholder="Ask about the selected transcripts..."
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                style={[
                  styles.input,
                  { borderColor: colors.border, color: colors.text },
                ]}
              />
              <View style={styles.composerActions}>
                {isGenerating ? (
                  <AppButton
                    label="Stop"
                    variant="secondary"
                    onPress={() => void stopGeneration()}
                  />
                ) : (
                  <AppButton
                    label="Mic"
                    variant="secondary"
                    disabled={
                      voiceStatus !== "idle" ||
                      hasUnansweredUserMessage ||
                      state.transcriptNotes.length === 0 ||
                      modelNotice !== null ||
                      !state.sourcesAvailable
                    }
                    onPress={() => void startVoice()}
                  />
                )}
                <AppButton
                  label={
                    isGenerating
                      ? "Sending..."
                      : hasUnansweredUserMessage
                        ? "Retry"
                        : "Send"
                  }
                  disabled={
                    isBusy ||
                    state.transcriptNotes.length === 0 ||
                    modelNotice !== null ||
                    !state.sourcesAvailable ||
                    (!hasUnansweredUserMessage && input.trim().length === 0)
                  }
                  onPress={() =>
                    void (hasUnansweredUserMessage
                      ? retryLastUserMessage()
                      : sendMessage(input))
                  }
                />
              </View>
            </View>

            <SafeAreaModal
              dismissDisabled={isBusy}
              visible={pickerVisible}
              onRequestClose={() => setPickerVisible(false)}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Choose up to 3 transcripts
                </Text>
                <ModalCloseButton
                  disabled={isBusy}
                  onPress={() => setPickerVisible(false)}
                  tintColor={colors.textMuted}
                />
              </View>
              {state.transcriptNotes.map((note) => {
                const selected = state.selectedNotes.some((item) => item.getId() === note.getId());
                return (
                  <Pressable
                    key={note.getId()}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setState((previous) =>
                        previous.status !== "ready"
                          ? previous
                          : selected
                            ? { ...previous, selectedNotes: previous.selectedNotes.filter((item) => item.getId() !== note.getId()) }
                            : previous.selectedNotes.length < 3
                              ? { ...previous, selectedNotes: [...previous.selectedNotes, note] }
                              : previous,
                      );
                    }}
                    style={[
                      styles.pickRow,
                      {
                        backgroundColor: selected
                          ? colors.accentSoft
                          : colors.background,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.pickTitle, { color: colors.text }]}>
                      {noteTitle(note)}
                    </Text>
                    <Text style={[styles.pickMeta, { color: colors.textMuted }]}>
                      {formatDate(note.getUpdatedAt())}
                    </Text>
                  </Pressable>
                );
              })}
            </SafeAreaModal>

            <SafeAreaModal
              dismissDisabled={isBusy || isHistoryBusy}
              visible={historyVisible}
              onRequestClose={() => setHistoryVisible(false)}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  AI History
                </Text>
                <ModalCloseButton
                  disabled={isBusy || isHistoryBusy}
                  onPress={() => setHistoryVisible(false)}
                  tintColor={colors.textMuted}
                />
              </View>
              {isHistoryBusy && (
                <View
                  accessibilityLabel={historyBusy === "loading" ? "Loading AI history" : "Moving conversation to Trash"}
                  accessibilityRole="progressbar"
                  accessibilityState={{ busy: true }}
                  style={styles.historyProgress}
                >
                  <ActivityIndicator color={colors.accent} />
                  <Text style={[styles.pickMeta, { color: colors.textMuted }]}>
                    {historyBusy === "loading" ? "Loading history…" : "Moving to Trash…"}
                  </Text>
                </View>
              )}
              {historyError !== null && (
                <Text style={[styles.errorText, { color: colors.danger }]}>
                  {historyError}
                </Text>
              )}
              {history.length === 0 && historyError === null && !isHistoryBusy && (
                <Text style={[styles.placeholder, { color: colors.textMuted }]}>
                  No Ask AI conversations yet.
                </Text>
              )}
              {history.map((item) => (
                <Pressable
                  key={item.conversation.getId()}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isHistoryBusy }}
                  disabled={isHistoryBusy}
                  onPress={() => openHistoryItem(item.conversation.getId())}
                  style={[
                    styles.pickRow,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.pickTitle, { color: colors.text }]}>
                    {item.conversation.getName()}
                  </Text>
                  {item.latestMessage !== null && (
                    <Text
                      numberOfLines={2}
                      style={[styles.pickMeta, { color: colors.textMuted }]}
                    >
                      {item.latestMessage.getContent()}
                    </Text>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.conversation.getName()} to Trash`}
                    accessibilityState={{ disabled: isHistoryBusy }}
                    disabled={isHistoryBusy}
                    onPress={(event) => {
                      event.stopPropagation();
                      void trashHistoryItem(item);
                    }}
                    style={({ pressed }) => [styles.historyTrash, pressed && styles.pressed]}
                  >
                    <Text style={[styles.pickMeta, { color: colors.danger }]}>Move to Trash</Text>
                  </Pressable>
                </Pressable>
              ))}
            </SafeAreaModal>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardAvoidingArea: { flex: 1 },
  readyContent: { flex: 1 },
  messageScroller: { flex: 1 },
  content: {
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  header: { gap: Spacing.xs },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 36, fontWeight: "800", lineHeight: 42 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  contextBar: {
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  contextText: { flex: 1, gap: 3 },
  contextLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  contextTitle: { fontSize: 17, fontWeight: "800" },
  locked: { fontSize: 12 },
  notice: {
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  noticeText: { fontSize: 14, lineHeight: 20 },
  errorText: { fontSize: 14, lineHeight: 20 },
  messages: { gap: Spacing.md, minHeight: 220 },
  placeholder: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  messageBubble: {
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.lg,
    maxWidth: "88%",
    padding: Spacing.md,
  },
  userBubble: { alignSelf: "flex-end" },
  assistantBubble: { alignSelf: "flex-start" },
  messageText: { fontSize: 16, lineHeight: 24 },
  workingBubble: { alignItems: "center", flexDirection: "row", gap: Spacing.sm },
  workingText: { fontSize: 14, fontWeight: "700" },
  voicePanel: {
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.md,
    padding: Spacing.md,
  },
  voiceText: { fontSize: 16, lineHeight: 24 },
  composer: {
    borderTopWidth: 1,
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    fontSize: 16,
    maxHeight: 118,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  composerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "flex-end",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 24, fontWeight: "800" },
  pickRow: {
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  pickTitle: { fontSize: 16, fontWeight: "800" },
  pickMeta: { fontSize: 13, lineHeight: 18 },
  historyTrash: { alignSelf: "flex-start", paddingVertical: Spacing.xs },
  historyProgress: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, justifyContent: "center", minHeight: 44 },
  pressed: { opacity: 0.7 },
});
