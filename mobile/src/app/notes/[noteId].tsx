import { UiAlert as Alert } from "@/localization/ui-alert";
import { UiTextInput as TextInput } from "@/components/ui-text-input";
import { UiText as Text } from "@/components/ui-text";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter, type Href } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { ModalCloseButton } from "@/components/modal-close-button";
import { SafeAreaModal } from "@/components/safe-area-modal";
import { SpeechPlaybackButton } from "@/components/speech-playback-button";
import type { ContentLanguage } from "@/localization/i18n";
import { normalizeTtsLanguage } from "@/services/tts-language";
import {
  KNOWLEDGE_SCENARIO_DEFINITIONS,
} from "@/constants/knowledge-scenarios";
import { Colors, Radius, Spacing } from "@/constants/theme";
import {
  KnowledgeDocument,
  KnowledgeScenario,
  type KnowledgeSection,
} from "@/domain/knowledge/knowledge-document";
import { NOTE_CATEGORY_KEYS, NOTE_CATEGORY_LABELS, type NoteCategory } from "@/constants/note-categories";
import type { KnowledgeTemplate } from "@/domain/knowledge/knowledge-template";
import {
  CoreNoteInsight,
  CoreTask,
} from "@/domain/core-note-insight/core-note-insight";
import { CoreNoteInsightGenerationError } from "@/errors/core-note-insight-generation-error";
import { KnowledgeGenerationError } from "@/errors/knowledge-generation-error";
import { useSpeechPlayback } from "@/hooks/use-speech-playback";
import { useTheme } from "@/hooks/use-theme";
import { useTrashUndo } from "@/providers/trash-undo-provider";
import { formatCompactDateTime, formatDate } from "@/utils/format-date";
import type { NoteTranslation, NoteTranslationPayload, NoteTranslationSection } from "@/domain/note-translation/note-translation";
import { useNoteTranslationCopy } from "@/hooks/use-note-translation-copy";
import type { NoteTranslationCopy } from "@/localization/note-translation-copy";
import type { AiConversationHistoryItem } from "@/services/ai-conversation-service";
import type { CoreInsightPreview } from "@/services/core-note-insight-service";
import { InferenceCancelledError } from "@/services/local-llm-coordinator";
import { markdownToPlainText } from "@/services/safe-markdown";

type NoteDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      note: NonNullable<
        Awaited<ReturnType<typeof appContainer.noteService.getNote>>
      >;
      workspaceName: string | null;
      knowledge: KnowledgeDocument | null;
      knowledgeHistory: KnowledgeDocument[];
      knowledgeTemplates: KnowledgeTemplate[];
      coreInsights: CoreNoteInsight | null;
      translation: NoteTranslation | null;
      linkedConversations: AiConversationHistoryItem[];
    };

type GenerationState =
  | { status: "idle" }
  | { status: "selecting"; scenario: KnowledgeScenario }
  | { status: "queued" | "stopping"; scenario: KnowledgeScenario }
  | { status: "generating"; scenario: KnowledgeScenario; partialSections: KnowledgeSection[] }
  | { status: "error"; scenario: KnowledgeScenario; message: string };

type CoreInsightGenerationState =
  | { status: "idle" }
  | { status: "queued" | "stopping" }
  | { status: "generating"; partial: CoreInsightPreview }
  | { status: "error"; message: string };

type TranslationState =
  | { status: "idle" }
  | { status: "translating"; requestId?: string; section: NoteTranslationSection | null; targetLanguage: string; partialPayload?: NoteTranslationPayload }
  | { status: "error"; section: NoteTranslationSection; message: string };

type NoteSection = "transcript" | "insights" | "knowledge";
type InsightSectionKey = "summary" | "key-points" | "tasks";

export default function NoteDetailScreen() {
  const { noteId, section, insightSection, knowledgeResultId, autoGenerate } = useLocalSearchParams<{ noteId: string; section?: string; insightSection?: string; knowledgeResultId?: string; autoGenerate?: string }>();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const { noteService, workspaceService, knowledgeService, coreNoteInsightService, noteTranslationService, aiConversationService, notePdfExportService } = appContainer;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const router = useRouter();
  const { language: translationLanguage, copy: translationCopy } = useNoteTranslationCopy();
  const { showTrashUndo } = useTrashUndo();
  const [state, setState] = useState<NoteDetailState>({
    status: "loading",
  });
  const [generation, setGeneration] = useState<GenerationState>({
    status: "idle",
  });
  const [actionModal, setActionModal] = useState<"move" | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Awaited<ReturnType<typeof workspaceService.getWorkspaces>>>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [coreGeneration, setCoreGeneration] = useState<CoreInsightGenerationState>({ status: "idle" });
  const [coreItemError, setCoreItemError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NoteSection>("transcript");
  const [translationState, setTranslationState] = useState<TranslationState>({ status: "idle" });
  const firstRenderedTranslationRequest = useRef<string | null>(null);
  const automaticGenerationStarted = useRef(false);
  const pendingRemovalAction = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const [categoryVisible, setCategoryVisible] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const audioRelativePath =
    state.status === "success" ? state.note.getAudioRelativePath() : null;
  const audioUri = audioRelativePath
    ? new File(Paths.document, ...audioRelativePath.split("/")).uri
    : null;
  const player = useAudioPlayer(audioUri);
  const playerStatus = useAudioPlayerStatus(player);
  const savedTitle = state.status === "success" ? (state.note.getName()?.trim() ?? "") : "";
  const normalizedTitleInput = titleInput.trim();
  const titleHasChanges = isEditingTitle && normalizedTitleInput !== savedTitle;
  const canSaveTitle = normalizedTitleInput.length > 0 && titleHasChanges && !isRenaming;

  useEffect(() => {
    void coreNoteInsightService.ensureReady().catch(() => undefined);
  }, [coreNoteInsightService]);

  const loadNote = async () => {
    setState({ status: "loading" });

    try {
      const loadedNote = await noteService.getNote(noteId);

      if (loadedNote === null) {
        setState({ status: "error", message: "Note not found." });
        return;
      }

      const [workspace, knowledgeHistory, knowledgeTemplates, coreInsights, translation, linkedConversations] = await Promise.all([
        workspaceService
          .getWorkspace(loadedNote.getWorkspaceId())
          .catch((error) => {
            console.warn(
              "[NoteDetail] Workspace metadata could not be loaded",
              {
                noteId: loadedNote.getId(),
                error,
              },
            );
            return null;
          }),
        knowledgeService.getHistoryForNote(loadedNote.getId()).catch((error) => {
          console.warn("[NoteDetail] Saved knowledge could not be loaded", {
            noteId: loadedNote.getId(),
            error,
          });
          return [];
        }),
        appContainer.knowledgeTemplateService.getTemplates().catch(() => []),
        coreNoteInsightService.getForNote(loadedNote.getId()).catch((error) => {
          console.warn("[NoteDetail] Saved core insights could not be loaded", { noteId: loadedNote.getId(), error });
          return null;
        }),
        noteTranslationService.getForNote(loadedNote.getId()).catch((error) => {
          console.warn("[NoteDetail] Saved translation could not be loaded", { noteId: loadedNote.getId(), error });
          return null;
        }),
        aiConversationService.getConversationHistoryForNote(loadedNote.getId()).catch((error) => {
          console.warn("[NoteDetail] Linked Ask AI conversations could not be loaded", { noteId: loadedNote.getId(), error });
          return [];
        }),
      ]);
      setState({
        status: "success",
        note: loadedNote,
        workspaceName: workspace?.getName() ?? null,
        knowledge: knowledgeHistory[0] ?? null,
        knowledgeHistory,
        knowledgeTemplates,
        coreInsights,
        translation,
        linkedConversations,
      });
    } catch (error) {
      console.error("[NoteDetail] Unable to load note", { noteId, error });
      setState({ status: "error", message: "Unable to load note." });
    }
  };

  useEffect(() => {
    setIsEditingTitle(false);
    setIsRenaming(false);
    setRenameError(null);
    setTitleInput("");
    void loadNote();
  }, [noteId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void aiConversationService.getConversationHistoryForNote(noteId).then((linkedConversations) => {
      if (!active) return;
      setState((current) => current.status === "success" ? { ...current, linkedConversations } : current);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [aiConversationService, noteId]));

  useEffect(() => () => {
    void appContainer.speechPlaybackService.stop();
  }, [noteId]);

  useEffect(() => noteService.subscribeToCategoryChanges((change) => {
    if (change.noteId !== noteId) return;
    void noteService.getNote(noteId).then((note) => {
      if (!note) return;
      setState((current) => current.status === "success" ? { ...current, note } : current);
    });
  }), [noteId, noteService]);

  useEffect(() => {
    if (section === "transcript" || section === "insights" || section === "knowledge") setActiveSection(section);
  }, [section]);

  useEffect(() => coreNoteInsightService.subscribeToGeneration(noteId, (generationState) => {
    if (generationState.status === "queued" || generationState.status === "stopping") {
      setCoreGeneration({ status: generationState.status });
      return;
    }
    if (generationState.status === "generating") {
      setCoreGeneration({ status: "generating", partial: generationState.partial });
      return;
    }
    if (generationState.status === "failed") {
      setCoreGeneration({ status: "error", message: generationState.message });
      return;
    }
    setCoreGeneration({ status: "idle" });
    if (generationState.status === "completed") {
      void coreNoteInsightService.getForNote(noteId).then((coreInsights) => {
        if (coreInsights) setState((current) => current.status === "success" ? { ...current, coreInsights } : current);
      });
    }
  }), [coreNoteInsightService, noteId]);

  useEffect(() => knowledgeService.subscribeToGeneration(noteId, (generationState) => {
    if (generationState.status === "queued" || generationState.status === "stopping") {
      setGeneration({ status: generationState.status, scenario: generationState.scenario });
      return;
    }
    if (generationState.status === "generating") {
      setGeneration({ status: "generating", scenario: generationState.scenario, partialSections: generationState.partialSections });
      return;
    }
    if (generationState.status === "failed") {
      setGeneration({ status: "error", scenario: generationState.scenario, message: generationState.message });
      return;
    }
    setGeneration({ status: "idle" });
    if (generationState.status === "completed") {
      void knowledgeService.getHistoryForNote(noteId).then((knowledgeHistory) => {
        setState((current) => current.status === "success" ? { ...current, knowledge: knowledgeHistory[0] ?? null, knowledgeHistory } : current);
      });
    }
  }), [knowledgeService, noteId]);

  useEffect(() => noteTranslationService.subscribe((operation) => {
    if (operation.status === "translating") {
      setTranslationState({ status: "translating", requestId: operation.requestId, section: operation.noteId === noteId ? operation.section : null, targetLanguage: operation.targetLanguage, partialPayload: operation.noteId === noteId ? operation.partialPayload : undefined });
      return;
    }
    if (operation.status === "failed" && operation.noteId === noteId) {
      setTranslationState({ status: "error", section: operation.section, message: translationCopy.genericError });
      return;
    }
    setTranslationState({ status: "idle" });
    if (operation.status === "completed" && operation.noteId === noteId) {
      void noteTranslationService.getForNote(noteId).then((translation) => {
        setState((current) => current.status === "success" ? { ...current, translation } : current);
      });
    }
  }), [noteId, noteTranslationService, translationCopy.genericError]);

  useEffect(() => {
    if (translationState.status !== "translating" || !translationState.requestId || !translationState.partialPayload || firstRenderedTranslationRequest.current === translationState.requestId) return;
    firstRenderedTranslationRequest.current = translationState.requestId;
    console.info("[Translation] First token rendered", { requestId: translationState.requestId, noteId, section: translationState.section });
  }, [noteId, translationState]);

  const generateKnowledge = async (scenario: KnowledgeScenario) => {
    if (state.status !== "success") return;
    const startedAt = Date.now();
    console.info("[NoteDetail] Knowledge generation started", {
      noteId: state.note.getId(),
      scenario,
    });
    setGeneration({ status: "generating", scenario, partialSections: [] });
    try {
      const knowledge = await knowledgeService.generate(
        state.note.getId(),
        state.note.getTranscript(),
        scenario,
      );
      const knowledgeHistory = await knowledgeService.getHistoryForNote(state.note.getId());
      setState((current) => current.status === "success" && current.note.getId() === state.note.getId() ? { ...current, knowledge, knowledgeHistory } : current);
      setGeneration({ status: "idle" });
      console.info("[NoteDetail] Knowledge generation displayed", {
        noteId: state.note.getId(),
        scenario,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (error instanceof InferenceCancelledError) {
        setGeneration({ status: "idle" });
        return;
      }
      const message =
        error instanceof KnowledgeGenerationError
          ? error.message
          : "Knowledge generation did not finish. Please try again.";
      console.error("[NoteDetail] Knowledge generation failed", {
        noteId: state.note.getId(),
        scenario,
        durationMs: Date.now() - startedAt,
        errorCode:
          error instanceof KnowledgeGenerationError ? error.code : "unexpected",
        error,
      });
      setGeneration({ status: "error", scenario, message });
    }
  };

  const generateCustomKnowledge = async (template: KnowledgeTemplate) => {
    if (state.status !== "success") return;
    setGeneration({ status: "generating", scenario: "general", partialSections: [] });
    try {
      const knowledge = await knowledgeService.generateCustom(
        state.note.getId(), state.note.getTranscript(), template,
      );
      const knowledgeHistory = await knowledgeService.getHistoryForNote(state.note.getId());
      setState((current) => current.status === "success" ? { ...current, knowledge, knowledgeHistory } : current);
      setGeneration({ status: "idle" });
    } catch (error) {
      if (error instanceof InferenceCancelledError) {
        setGeneration({ status: "idle" });
        return;
      }
      setGeneration({ status: "error", scenario: "general", message: error instanceof Error ? error.message : "Knowledge generation did not finish." });
    }
  };

  const deleteKnowledgeResult = (result: KnowledgeDocument) => {
    Alert.alert("Delete this Knowledge result?", "This permanently removes this saved snapshot. It will not enter Trash.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        void knowledgeService.deleteResult(noteId, result.getId()).then(async () => {
          const knowledgeHistory = await knowledgeService.getHistoryForNote(noteId);
          setState((current) => current.status === "success" ? { ...current, knowledge: knowledgeHistory[0] ?? null, knowledgeHistory } : current);
        }, (error: unknown) => Alert.alert("Unable to delete result", error instanceof Error ? error.message : "Please try again."));
      }},
    ]);
  };

  const openMove = async () => {
    if (isLoadingWorkspaces || isMoving) return;
    setActionError(null);
    setWorkspaces([]);
    setActionModal("move");
    setIsLoadingWorkspaces(true);
    try {
      setWorkspaces(await workspaceService.getWorkspaces());
    } catch {
      setActionError("Unable to load workspaces.");
    } finally {
      setIsLoadingWorkspaces(false);
    }
  };

  const beginTitleEditing = () => {
    if (state.status !== "success" || isRenaming) return;
    setTitleInput(state.note.getName() ?? "");
    setRenameError(null);
    setIsEditingTitle(true);
  };

  const cancelTitleEditing = () => {
    if (isRenaming) return;
    setTitleInput(state.status === "success" ? (state.note.getName() ?? "") : "");
    setRenameError(null);
    setIsEditingTitle(false);
  };

  const renameNote = async () => {
    if (state.status !== "success" || !canSaveTitle) return;
    setIsRenaming(true);
    setRenameError(null);
    try {
      await noteService.renameNote(noteId, normalizedTitleInput);
      const renamedNote = await noteService.getNote(noteId);
      if (renamedNote === null) throw new Error("Note not found after renaming.");
      setState((current) => current.status === "success" ? { ...current, note: renamedNote } : current);
      setTitleInput(renamedNote.getName() ?? normalizedTitleInput);
      setIsEditingTitle(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Unable to rename note.");
    } finally {
      setIsRenaming(false);
    }
  };

  usePreventRemove(isEditingTitle && (titleHasChanges || isRenaming), ({ data }) => {
    if (isRenaming) {
      Alert.alert("Saving title", "Please wait until the title has finished saving.");
      return;
    }
    Alert.alert("Discard title changes?", "Your unsaved title will be lost.", [
      { text: "Keep Editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          pendingRemovalAction.current = data.action;
          cancelTitleEditing();
        },
      },
    ]);
  });

  useEffect(() => {
    if (isEditingTitle || pendingRemovalAction.current === null) return;
    const action = pendingRemovalAction.current;
    pendingRemovalAction.current = null;
    navigation.dispatch(action);
  }, [isEditingTitle, navigation]);

  const moveNote = async (workspaceId: string) => {
    if (isMoving || isLoadingWorkspaces) return;
    setIsMoving(true);
    setActionError(null);
    try {
      await noteService.moveNote(noteId, workspaceId);
      const movedNote = await noteService.getNote(noteId);
      const movedWorkspace = await workspaceService.getWorkspace(workspaceId).catch(() => null);
      setActionModal(null);
      if (movedNote === null) {
        void loadNote();
        return;
      }
      setState((current) => current.status === "success"
        ? { ...current, note: movedNote, workspaceName: movedWorkspace?.getName() ?? null }
        : current);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to move note.");
    } finally {
      setIsMoving(false);
    }
  };

  const chooseCategory = async (category: NoteCategory | "auto") => {
    if (isUpdatingCategory) return;
    setIsUpdatingCategory(true);
    try {
      if (category === "auto") await noteService.classifyNote(noteId);
      else await noteService.setCategory(noteId, category);
      const updatedNote = await noteService.getNote(noteId);
      if (updatedNote === null) throw new Error("Note not found after updating its category.");
      setState((current) => current.status === "success" ? { ...current, note: updatedNote } : current);
      setCategoryVisible(false);
    } catch (error) {
      Alert.alert("Unable to update category", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  const togglePinnedNote = async () => {
    if (state.status !== "success" || isPinning) return;
    const nextPinned = !state.note.getIsPinned();
    setIsPinning(true);
    try {
      await noteService.setNotePinned(noteId, nextPinned);
      const note = await noteService.getNote(noteId);
      if (note === null) throw new Error("Note not found.");
      setState((current) => current.status === "success" ? { ...current, note } : current);
    } catch (error) {
      Alert.alert(
        nextPinned ? "Unable to pin note" : "Unable to unpin note",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsPinning(false);
    }
  };

  const confirmDeleteNote = () => {
    if (state.status !== "success") return;
    const workspaceId = state.note.getWorkspaceId();
    const name = state.note.getName()?.trim() || "Untitled note";
    Alert.alert("Move note to Trash?", "The note, audio, insights, and Knowledge history will be kept until you permanently delete it from Settings → Trash.", [
      { text: "Cancel", style: "cancel" },
      { text: "Move to Trash", style: "destructive", onPress: () => {
        void noteService.deleteNote(noteId).then(
          () => {
            showTrashUndo({
              message: `${name} moved to Trash`,
              undo: async () => {
                await noteService.restoreNotes([noteId]);
                router.replace({ pathname: "/notes/[noteId]", params: { noteId } });
              },
            });
            router.replace({ pathname: "/workspaces/[workspaceId]", params: { workspaceId } });
          },
          () => Alert.alert("Unable to delete note", "Please try again."),
        );
      }},
    ]);
  };

  const exportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await notePdfExportService.exportAndShare(noteId);
    } catch (error) {
      Alert.alert(
        "Unable to export PDF",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const generateCoreInsights = async () => {
    if (state.status !== "success") return;
    const startedAt = Date.now();
    console.info("[NoteDetail] Core insights generation started", { noteId: state.note.getId() });
    setCoreGeneration({
      status: "generating",
      partial: { phase: "content", summary: "", keyPoints: [], tasks: [] },
    });
    try {
      const coreInsights = await coreNoteInsightService.generate(
        state.note.getId(),
        state.note.getTranscript(),
        state.note.getCreatedAt(),
      );
      setState((current) => current.status === "success" && current.note.getId() === state.note.getId() ? { ...current, coreInsights } : current);
      setCoreGeneration({ status: "idle" });
      console.info("[NoteDetail] Core insights displayed", { noteId: state.note.getId(), durationMs: Date.now() - startedAt });
    } catch (error) {
      if (error instanceof InferenceCancelledError) {
        setCoreGeneration({ status: "idle" });
        return;
      }
      const message = error instanceof CoreNoteInsightGenerationError ? error.message : "Structured Note did not finish. Please try again.";
      console.error("[NoteDetail] Core insights generation failed", { noteId: state.note.getId(), durationMs: Date.now() - startedAt, error });
      setCoreGeneration({ status: "error", message });
    }
  };

  useEffect(() => {
    if (
      autoGenerate !== "1" ||
      automaticGenerationStarted.current ||
      state.status !== "success" ||
      state.coreInsights !== null
    ) return;
    automaticGenerationStarted.current = true;
    setActiveSection("insights");
    void generateCoreInsights();
  }, [autoGenerate, state]);

  const setCoreTaskCompleted = async (taskId: string, completed: boolean) => {
    if (state.status !== "success") return;
    setCoreItemError(null);
    try {
      const coreInsights = await coreNoteInsightService.setTaskCompleted(
        state.note.getId(), taskId, completed,
      );
      setState((current) => current.status === "success" ? { ...current, coreInsights } : current);
    } catch (error) {
      setCoreItemError(error instanceof Error ? error.message : "Unable to update this task.");
      throw error;
    }
  };

  const translateSection = async (section: NoteTranslationSection) => {
    if (state.status !== "success" || translationState.status === "translating") return;
    setTranslationState({ status: "translating", section, targetLanguage: translationCopy.languageName });
    try {
      const translation = await noteTranslationService.translate(
        state.note.getId(), section, translationLanguage, translationCopy.languageName, state.note.getTranscript(), state.coreInsights, state.knowledge,
      );
      setState((current) => current.status === "success" ? { ...current, translation } : current);
      setTranslationState({ status: "idle" });
    } catch (error) {
      if (error instanceof InferenceCancelledError) {
        setTranslationState({ status: "idle" });
        return;
      }
      console.warn("[NoteDetail] Section translation failed", { section, error });
      setTranslationState({ status: "error", section, message: translationCopy.genericError });
    }
  };

  const restoreOriginal = async (section: NoteTranslationSection) => {
    if (state.status !== "success") return;
    try {
      const translation = await noteTranslationService.restoreOriginal(state.note.getId(), section);
      setState((current) => current.status === "success" ? { ...current, translation } : current);
      setTranslationState({ status: "idle" });
    } catch (error) {
      console.warn("[NoteDetail] Original section restore failed", { section, error });
      setTranslationState({ status: "error", section, message: translationCopy.restoreError });
    }
  };

  const savedTranslation = state.status === "success" ? state.translation : null;
  const liveSection = translationState.status === "translating" ? translationState.section : null;
  const livePayload = translationState.status === "translating" ? translationState.partialPayload : undefined;
  const transcriptTranslated = savedTranslation?.isSectionActive("transcript") ?? false;
  const insightsTranslated = savedTranslation?.isSectionActive("insights") ?? false;
  const knowledgeTranslated = savedTranslation?.isSectionActive("knowledge") ?? false;
  const knowledgeTranslationVisible = liveSection === "knowledge" || knowledgeTranslated;
  const displayInsight = state.status === "success" ? translateCoreInsight(state.coreInsights, liveSection === "insights" ? livePayload?.strings : insightsTranslated ? savedTranslation?.getPayload().strings : undefined) : null;
  const displayKnowledge = state.status === "success" ? translateKnowledge(state.knowledge, liveSection === "knowledge" ? livePayload?.strings : knowledgeTranslated ? savedTranslation?.getPayload().strings : undefined) : null;
  const requestedInsightSection: InsightSectionKey = insightSection === "key-points" || insightSection === "tasks"
    ? insightSection
    : "summary";
  const moveTargets = state.status === "success"
    ? workspaces.filter((workspace) => workspace.getId() !== state.note.getWorkspaceId())
    : [];
  const noteMenuDisabled = state.status !== "success" || isEditingTitle || isRenaming || isLoadingWorkspaces || isMoving || isUpdatingCategory;

  const setCoreTaskPinned = async (taskId: string, pinned: boolean) => {
    if (state.status !== "success") return;
    setCoreItemError(null);
    try {
      const coreInsights = await coreNoteInsightService.setTaskPinned(state.note.getId(), taskId, pinned);
      setState((current) => current.status === "success" ? { ...current, coreInsights } : current);
    } catch (error) {
      setCoreItemError(error instanceof Error ? error.message : "Unable to pin this task.");
      throw error;
    }
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Note" }} />
      <Stack.Toolbar placement="right">
        {isExportingPdf ? (
          <Stack.Toolbar.View>
            <View
              accessibilityLabel="Creating PDF"
              accessibilityRole="progressbar"
              accessibilityState={{ busy: true }}
              style={styles.headerProgress}
            >
              <ActivityIndicator color={colors.accent} />
            </View>
          </Stack.Toolbar.View>
        ) : (
          <Stack.Toolbar.Menu
            accessibilityLabel="More note actions"
            disabled={noteMenuDisabled}
            hidden={state.status !== "success"}
            icon="ellipsis"
          >
            <Stack.Toolbar.MenuAction
              icon="square.and.arrow.up"
              onPress={() => void exportPdf()}
            >
              Export PDF
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="folder"
              onPress={() => void openMove()}
            >
              Move to Workspace
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              destructive
              icon="trash"
              onPress={confirmDeleteNote}
            >
              Move to Trash
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        )}
      </Stack.Toolbar>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Spacing.xxl + insets.bottom },
        ]}
      >
        {state.status === "loading" && <LoadingState />}
        {state.status === "error" && (
          <ErrorState message={state.message} onRetry={() => void loadNote()} />
        )}
        {state.status === "success" && (
          <>
            <View style={styles.header}>
              {isEditingTitle ? (
                <View style={styles.titleEditorBlock}>
                  <View style={styles.titleEditorRow}>
                    <TextInput
                      accessibilityLabel="Note title"
                      autoFocus
                      editable={!isRenaming}
                      onChangeText={(value) => {
                        setTitleInput(value);
                        setRenameError(null);
                      }}
                      onSubmitEditing={() => {
                        if (canSaveTitle) void renameNote();
                      }}
                      placeholder="Note title"
                      placeholderTextColor={colors.textMuted}
                      returnKeyType="done"
                      selectTextOnFocus
                      style={[
                        styles.titleInput,
                        { backgroundColor: colors.surface, borderColor: renameError ? colors.danger : colors.border, color: colors.text },
                      ]}
                      value={titleInput}
                    />
                    <Pressable
                      accessibilityLabel="Cancel title editing"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isRenaming }}
                      disabled={isRenaming}
                      hitSlop={4}
                      onPress={cancelTitleEditing}
                      style={({ pressed }) => [styles.titleEditAction, { backgroundColor: colors.surfaceMuted }, isRenaming && styles.disabled, pressed && !isRenaming && styles.pressed]}
                    >
                      <SymbolView name="xmark" size={17} tintColor={colors.textMuted} weight="semibold" />
                    </Pressable>
                    <Pressable
                      accessibilityLabel={isRenaming ? "Saving note title" : "Save note title"}
                      accessibilityRole="button"
                      accessibilityState={{ busy: isRenaming, disabled: !canSaveTitle }}
                      disabled={!canSaveTitle || isRenaming}
                      hitSlop={4}
                      onPress={() => void renameNote()}
                      style={({ pressed }) => [styles.titleEditAction, { backgroundColor: colors.accentSoft }, (!canSaveTitle || isRenaming) && styles.disabled, pressed && canSaveTitle && styles.pressed]}
                    >
                      {isRenaming
                        ? <ActivityIndicator size="small" color={colors.accent} />
                        : <SymbolView name="checkmark" size={18} tintColor={colors.accent} weight="bold" />}
                    </Pressable>
                  </View>
                  {renameError && <Text selectable style={[styles.errorText, { color: colors.danger }]}>{renameError}</Text>}
                </View>
              ) : (
                <Pressable
                  accessibilityHint="Edits this title in place"
                  accessibilityLabel="Rename note title"
                  accessibilityRole="button"
                  onPress={beginTitleEditing}
                  style={({ pressed }) => [styles.noteTitleButton, pressed && styles.pressed]}
                >
                  <Text numberOfLines={2} style={[styles.noteTitle, { color: colors.text }]}>
                    {state.note.getName()?.trim() || "Untitled note"}
                  </Text>
                  <SymbolView name="pencil" size={18} tintColor={colors.accent} weight="semibold" />
                </Pressable>
              )}
              <View style={styles.noteIdentityRow}>
                <View style={styles.noteIdentity}>
                  <Text numberOfLines={1} style={[styles.workspaceName, { color: colors.textMuted }]}>
                    {state.workspaceName ?? "Workspace unavailable"}
                  </Text>
                  <View style={styles.noteMetaRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Change note category"
                      accessibilityState={{ disabled: isEditingTitle || isRenaming || isUpdatingCategory }}
                      disabled={isEditingTitle || isRenaming || isUpdatingCategory}
                      onPress={() => setCategoryVisible(true)}
                      style={({ pressed }) => [styles.categoryControl, (isEditingTitle || isRenaming || isUpdatingCategory) && styles.disabled, pressed && styles.pressed]}
                    >
                      <View style={[styles.categoryBadge, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.categoryButtonText, { color: colors.accent }]}>{NOTE_CATEGORY_LABELS[state.note.getCategory()]}</Text>
                      </View>
                    </Pressable>
                    <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.noteTimestamp, { color: colors.textMuted }]}>
                      {formatCompactDateTime(state.note.getCreatedAt())}
                    </Text>
                    {state.note.getIsPinned() && (
                      <Text style={[styles.pinnedMeta, { color: colors.accent }]}>Pinned</Text>
                    )}
                  </View>
                </View>
                <View style={styles.noteQuickActions}>
                  <NotePrimaryAction
                    disabled={isEditingTitle || isRenaming || isPinning}
                    label={state.note.getIsPinned() ? "Unpin note" : "Pin note"}
                    shortLabel={isPinning ? "Saving…" : state.note.getIsPinned() ? "Unpin" : "Pin"}
                    symbol={state.note.getIsPinned() ? "star.fill" : "star"}
                    color={colors.accent}
                    backgroundColor={colors.surfaceMuted}
                    selected={state.note.getIsPinned()}
                    onPress={() => void togglePinnedNote()}
                  />
                  {state.note.getAudioRelativePath() && (
                    <NotePrimaryAction
                      disabled={isEditingTitle || isRenaming}
                      label={playerStatus.playing ? "Pause recording" : "Play recording"}
                      shortLabel={playerStatus.playing ? "Pause" : "Audio"}
                      symbol={playerStatus.playing ? "pause.fill" : "play.fill"}
                      color={colors.accent}
                      backgroundColor={colors.surfaceMuted}
                      selected={playerStatus.playing}
                      onPress={() => playerStatus.playing ? player.pause() : player.play()}
                    />
                  )}
                  <NotePrimaryAction
                    disabled={isEditingTitle || isRenaming}
                    label="Ask AI about this transcript"
                    shortLabel="Ask AI"
                    symbol="sparkles"
                    color={colors.accent}
                    backgroundColor={colors.surfaceMuted}
                    onPress={() =>
                      router.push({
                        pathname: "/ask-ai",
                        params: { noteId: state.note.getId() },
                      } as unknown as Href)
                    }
                  />
                </View>
              </View>
            </View>
            <SectionTabs
              activeSection={activeSection}
              onChange={setActiveSection}
              accentColor={colors.accent}
              backgroundColor={colors.surfaceMuted}
              mutedColor={colors.textMuted}
              surfaceColor={colors.surface}
              textColor={colors.text}
            />
            {activeSection === "transcript" && <View
              style={[
                styles.transcript,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Transcript
              </Text>
              <TranslationControl section="transcript" translated={transcriptTranslated} targetLanguage={savedTranslation?.getTargetLanguage() ?? translationCopy.languageName} state={translationState} copy={translationCopy} dangerColor={colors.danger} mutedColor={colors.textMuted} onTranslate={translateSection} onRestore={restoreOriginal} onCancel={() => noteTranslationService.cancel()} />
              <Text style={[styles.body, { color: colors.text }]}>
                {liveSection === "transcript" && livePayload?.transcript ? livePayload.transcript : transcriptTranslated ? savedTranslation?.getPayload().transcript : state.note.getTranscript()}
              </Text>
            </View>}
            {activeSection === "insights" && <View style={[styles.knowledgeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.structuredNoteHeading}>
                <View style={styles.headingCopy}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Structured Note</Text>
                </View>
                {state.coreInsights && displayInsight && (
                  <CoreInsightActions
                    insight={displayInsight}
                    requestedLanguage={insightsTranslated ? normalizeTtsLanguage(savedTranslation?.getPayload().languageCode ?? savedTranslation?.getTargetLanguage()) ?? translationLanguage : undefined}
                    translated={insightsTranslated}
                    translationState={translationState}
                    translationCopy={translationCopy}
                    onTranslate={translateSection}
                    onRestore={restoreOriginal}
                    onCancel={() => noteTranslationService.cancel()}
                  />
                )}
              </View>
              {coreGeneration.status === "generating" || coreGeneration.status === "queued" || coreGeneration.status === "stopping" ? (
                <View style={[styles.generationStatus, { backgroundColor: colors.surfaceMuted }]}>
                  <ActivityIndicator color={colors.accent} />
                  <View style={styles.headingCopy}>
                    <Text style={[styles.statusTitle, { color: colors.text }]}>{coreGeneration.status === "queued"
                      ? "Waiting for local AI…"
                      : coreGeneration.status === "stopping"
                        ? "Stopping…"
                        : coreGeneration.status === "generating"
                          ? coreGeneration.partial.phase === "structured"
                            ? "Structuring note…"
                            : coreGeneration.partial.phase === "content"
                              ? "Writing summary and key points…"
                              : "Extracting tasks and dates…"
                          : "Extracting core insights…"}</Text>
                    <Text style={[styles.supportingText, { color: colors.textMuted }]}>Running privately on this device.</Text>
                  </View>
                  {coreGeneration.status !== "stopping" && <AppButton label="Stop" variant="quiet" onPress={() => void coreNoteInsightService.stopGeneration(noteId)} />}
                  {coreGeneration.status === "generating" && (coreGeneration.partial.summary || coreGeneration.partial.keyPoints.length > 0 || coreGeneration.partial.tasks.length > 0) && (
                    <View style={styles.streamPreview}>
                      {coreGeneration.partial.summary && <Text selectable style={[styles.body, { color: colors.text }]}>{coreGeneration.partial.summary}</Text>}
                      {coreGeneration.partial.keyPoints.map((point, index) => <Text selectable key={`${index}-${point}`} style={[styles.body, { color: colors.text }]}>• {point}</Text>)}
                      {coreGeneration.partial.tasks.length > 0 && <Text style={[styles.statusTitle, { color: colors.text }]}>Tasks</Text>}
                      {coreGeneration.partial.tasks.map((item, index) => <Text selectable key={`task-${index}-${item}`} style={[styles.body, { color: colors.text }]}>• {item}</Text>)}
                    </View>
                  )}
                </View>
              ) : (
                <>
                  {displayInsight && <CoreInsightResult
                    insight={displayInsight}
                    initialSection={requestedInsightSection}
                    textColor={colors.text}
                    mutedColor={colors.textMuted}
                    borderColor={colors.border}
                    accentColor={colors.accent}
                    surfaceMutedColor={colors.surfaceMuted}
                    onTaskCompletedChange={setCoreTaskCompleted}
                    onTaskPinnedChange={setCoreTaskPinned}
                  />}
                  {coreItemError && <Text selectable style={[styles.errorText, { color: colors.danger }]}>{coreItemError}</Text>}
                  {coreGeneration.status === "error" && <Text selectable style={[styles.errorText, { color: colors.danger }]}>{coreGeneration.message}</Text>}
                  <AppButton
                    accessibilityLabel={state.coreInsights ? "Regenerate Core Insights" : "Generate Core Insights"}
                    label={state.coreInsights ? "Regenerate" : "Generate"}
                    variant={state.coreInsights ? "secondary" : undefined}
                    onPress={() => void generateCoreInsights()}
                  />
                </>
              )}
            </View>}
            {activeSection === "knowledge" && <View
              style={[
                styles.knowledgeCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.knowledgeHeading}>
                <View style={styles.headingCopy}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Knowledge
                  </Text>
                  <Text
                    style={[styles.supportingText, { color: colors.textMuted }]}
                  >
                    Turn this transcript into a note shaped for how you'll use
                    it.
                  </Text>
                </View>
                {state.knowledge && generation.status === "idle" && (
                  <View
                    style={[
                      styles.scenarioBadge,
                      { backgroundColor: colors.accentSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scenarioBadgeText,
                        { color: colors.accent },
                      ]}
                    >
                      {state.knowledge.getTemplateName()}{state.knowledge.getTemplateDeleted() ? " · Deleted template" : ""}
                    </Text>
                  </View>
                )}
              </View>
              {state.knowledge && <TranslationControl section="knowledge" translated={knowledgeTranslated} targetLanguage={savedTranslation?.getTargetLanguage() ?? translationCopy.languageName} state={translationState} copy={translationCopy} dangerColor={colors.danger} mutedColor={colors.textMuted} onTranslate={translateSection} onRestore={restoreOriginal} onCancel={() => noteTranslationService.cancel()} />}

              {generation.status === "generating" || generation.status === "queued" || generation.status === "stopping" ? (
                <View
                  style={[
                    styles.generationStatus,
                    { backgroundColor: colors.surfaceMuted },
                  ]}
                >
                  <ActivityIndicator color={colors.accent} />
                  <View style={styles.headingCopy}>
                    <Text style={[styles.statusTitle, { color: colors.text }]}>
                      {generation.status === "queued" ? "Waiting for local AI…" : generation.status === "stopping" ? "Stopping…" : "Organizing your knowledge…"}
                    </Text>
                    <Text
                      style={[
                        styles.supportingText,
                        { color: colors.textMuted },
                      ]}
                    >
                      Running privately on this device. This can take a moment.
                    </Text>
                  </View>
                  {generation.status !== "stopping" && <AppButton label="Stop" variant="quiet" onPress={() => void knowledgeService.stopGeneration(noteId)} />}
                  {generation.status === "generating" && generation.partialSections.length > 0 && (
                    <View style={styles.streamPreview}>
                      {generation.partialSections.map((section) => (
                        <View key={section.key} style={styles.headingCopy}>
                          <Text style={[styles.statusTitle, { color: colors.text }]}>{section.title}</Text>
                          {section.items.map((item, index) => <Text selectable key={`${index}-${item}`} style={[styles.body, { color: colors.text }]}>• {item}</Text>)}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : generation.status === "selecting" ||
                generation.status === "error" ? (
                <View style={styles.selector}>
                  <Text style={[styles.selectorTitle, { color: colors.text }]}>
                    Built-in templates
                  </Text>
                  <View style={styles.scenarioGrid}>
                    {KNOWLEDGE_SCENARIO_DEFINITIONS.map((scenario) => {
                      const selected = generation.scenario === scenario.id;
                      return (
                        <Pressable
                          key={scenario.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          onPress={() =>
                            setGeneration({
                              status: "selecting",
                              scenario: scenario.id,
                            })
                          }
                          style={({ pressed }) => [
                            styles.scenarioOption,
                            {
                              backgroundColor: selected
                                ? colors.accentSoft
                                : colors.background,
                              borderColor: selected
                                ? colors.accent
                                : colors.border,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.scenarioTitle,
                              { color: colors.text },
                            ]}
                          >
                            {scenario.name}
                          </Text>
                          <Text
                            style={[
                              styles.scenarioDescription,
                              { color: colors.textMuted },
                            ]}
                          >
                            {scenario.description}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={[styles.selectorTitle, { color: colors.text }]}>Custom templates</Text>
                  <View style={styles.scenarioGrid}>
                    {state.knowledgeTemplates.map((template) => (
                      <Pressable
                        key={template.getId()}
                        accessibilityRole="button"
                        onPress={() => void generateCustomKnowledge(template)}
                        style={({ pressed }) => [styles.scenarioOption, { backgroundColor: colors.background, borderColor: colors.border }, pressed && styles.pressed]}
                      >
                        <Text style={[styles.scenarioTitle, { color: colors.text }]}>{template.getName()}</Text>
                        <Text numberOfLines={2} style={[styles.scenarioDescription, { color: colors.textMuted }]}>{template.getRequirement()}</Text>
                      </Pressable>
                    ))}
                    {state.knowledgeTemplates.length === 0 && <Text style={[styles.supportingText, { color: colors.textMuted }]}>No custom templates yet.</Text>}
                  </View>
                  <AppButton accessibilityLabel="Manage Templates" label="Templates" variant="quiet" onPress={() => router.push("/ai/knowledge-templates" as Href)} />
                  {generation.status === "error" && (
                    <Text
                      selectable
                      style={[styles.errorText, { color: colors.danger }]}
                    >
                      {generation.message}
                    </Text>
                  )}
                  <View style={styles.actionRow}>
                    <AppButton
                      label="Cancel"
                      variant="quiet"
                      onPress={() => setGeneration({ status: "idle" })}
                    />
                    <AppButton
                      label={
                        state.knowledge ? "Regenerate" : "Generate"
                      }
                      onPress={() =>
                        void generateKnowledge(generation.scenario)
                      }
                    />
                  </View>
                </View>
              ) : knowledgeTranslationVisible && displayKnowledge ? (
                <View style={styles.document}>
                  <KnowledgeResult
                    document={displayKnowledge}
                    requestedLanguage={knowledgeTranslated ? normalizeTtsLanguage(savedTranslation?.getPayload().languageCode ?? savedTranslation?.getTargetLanguage()) ?? translationLanguage : undefined}
                    textColor={colors.text}
                    mutedColor={colors.textMuted}
                    borderColor={colors.border}
                  />
                  <AppButton
                    accessibilityLabel="Generate Knowledge again"
                    label="Regenerate"
                    variant="secondary"
                    onPress={() => setGeneration({ status: "selecting", scenario: state.knowledge!.getScenario() })}
                  />
                </View>
              ) : state.knowledgeHistory.length > 0 ? (
                <View style={styles.document}>
                  {state.knowledgeHistory.map((document, index) => (
                    <KnowledgeHistoryResult
                      key={document.getId()}
                      document={document}
                      initiallyExpanded={index === 0 || document.getId() === knowledgeResultId}
                      textColor={colors.text}
                      mutedColor={colors.textMuted}
                      borderColor={colors.border}
                      accentColor={colors.accent}
                      onDelete={() => deleteKnowledgeResult(document)}
                    />
                  ))}
                  <AppButton
                    accessibilityLabel="Generate Knowledge again"
                    label="Regenerate"
                    variant="secondary"
                    onPress={() =>
                      setGeneration({
                        status: "selecting",
                        scenario: state.knowledge!.getScenario(),
                      })
                    }
                  />
                </View>
              ) : (
                <AppButton
                  accessibilityLabel="Generate Knowledge"
                  label="Generate"
                  onPress={() =>
                    setGeneration({ status: "selecting", scenario: "general" })
                  }
                />
              )}
            </View>}
            <View style={[styles.knowledgeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.knowledgeHeading}>
                <View style={styles.headingCopy}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Ask AI Conversations</Text>
                  <Text style={[styles.supportingText, { color: colors.textMuted }]}>Conversations that use this Note as a source.</Text>
                </View>
                <AppButton
                  label="New"
                  variant="quiet"
                  onPress={() => router.push({ pathname: "/ask-ai", params: { noteId: state.note.getId(), mode: "new" } } as unknown as Href)}
                />
              </View>
              {state.linkedConversations.length === 0 ? (
                <Text style={[styles.emptyInsight, { color: colors.textMuted }]}>No linked conversations yet.</Text>
              ) : (
                <View style={styles.conversationList}>
                  {state.linkedConversations.map((item) => (
                    <Pressable
                      key={item.conversation.getId()}
                      accessibilityRole="button"
                      accessibilityLabel={`Continue ${item.conversation.getName()}`}
                      onPress={() => router.push({ pathname: "/ask-ai", params: { conversationId: item.conversation.getId() } } as unknown as Href)}
                      style={({ pressed }) => [styles.conversationCard, { backgroundColor: colors.background, borderColor: colors.border }, pressed && styles.pressed]}
                    >
                      <View style={styles.headingCopy}>
                        <Text style={[styles.scenarioTitle, { color: colors.text }]}>{item.conversation.getName()}</Text>
                        <Text numberOfLines={2} style={[styles.supportingText, { color: colors.textMuted }]}>
                          {item.latestMessage ? markdownToPlainText(item.latestMessage.getContent()) : "Conversation started"}
                        </Text>
                        <Text style={[styles.generatedMeta, { color: colors.textMuted }]}>{formatDate(item.conversation.getUpdatedAt())} · {item.linkedNotes.length} {item.linkedNotes.length === 1 ? "source" : "sources"}</Text>
                      </View>
                      <Text style={[styles.audioAction, { color: colors.accent }]}>Continue</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <SafeAreaModal
        dismissDisabled={isLoadingWorkspaces || isMoving}
        visible={actionModal === "move"}
        onRequestClose={() => setActionModal(null)}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Move note</Text>
          <ModalCloseButton
            disabled={isLoadingWorkspaces || isMoving}
            label="Close Move Note"
            onPress={() => setActionModal(null)}
            tintColor={colors.textMuted}
          />
        </View>
        <View style={styles.workspaceChoices}>
          {isLoadingWorkspaces ? (
            <View accessibilityLabel="Loading workspaces" accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={styles.modalProgress}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.textMuted }}>Loading workspaces…</Text>
            </View>
          ) : (
            <>
              {isMoving && (
                <View accessibilityLabel="Moving note" accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={styles.modalProgress}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={{ color: colors.textMuted }}>Moving note…</Text>
                </View>
              )}
              {moveTargets.map((workspace) => (
                <AppButton key={workspace.getId()} label={workspace.getName()} variant="secondary" disabled={isMoving} onPress={() => void moveNote(workspace.getId())} />
              ))}
              {!actionError && moveTargets.length === 0 && <Text style={{ color: colors.textMuted }}>No other workspace is available.</Text>}
            </>
          )}
        </View>
        {actionError && <Text selectable style={{ color: colors.danger }}>{actionError}</Text>}
      </SafeAreaModal>
      <SafeAreaModal dismissDisabled={isUpdatingCategory} visible={categoryVisible} onRequestClose={() => setCategoryVisible(false)}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Note category</Text>
          <ModalCloseButton
            disabled={isUpdatingCategory}
            label="Close Note Category"
            onPress={() => setCategoryVisible(false)}
            tintColor={colors.textMuted}
          />
        </View>
        {isUpdatingCategory && (
          <View accessibilityLabel="Updating note category" accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={styles.modalProgress}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.textMuted }}>Updating category…</Text>
          </View>
        )}
        <View style={styles.workspaceChoices}>
          {NOTE_CATEGORY_KEYS.map((category) => (
            <AppButton key={category} label={NOTE_CATEGORY_LABELS[category]} variant={state.status === "success" && state.note.getCategory() === category ? "secondary" : "quiet"} disabled={isUpdatingCategory} onPress={() => void chooseCategory(category)} />
          ))}
          <AppButton accessibilityLabel="Classify Automatically" label="Auto-classify" variant="secondary" disabled={isUpdatingCategory} onPress={() => void chooseCategory("auto")} />
        </View>
      </SafeAreaModal>
    </View>
  );
}

function CoreInsightActions({ insight, requestedLanguage, translated, translationState, translationCopy, onTranslate, onRestore, onCancel }: {
  insight: CoreNoteInsight;
  requestedLanguage?: ContentLanguage;
  translated: boolean;
  translationState: TranslationState;
  translationCopy: NoteTranslationCopy;
  onTranslate: (section: NoteTranslationSection) => Promise<void>;
  onRestore: (section: NoteTranslationSection) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const colors = Colors[useTheme().mode];
  const router = useRouter();
  const { service, state } = useSpeechPlayback();
  const speechId = `structured-note:${insight.getId()}:${insight.getUpdatedAt()}`;
  const speechActive = state.speechId === speechId;
  const speechPreparing = speechActive && state.phase === "preparing";
  const speechPlaying = speechActive && state.phase === "playing";
  const speechDisabled = !speechActive && state.inferenceBusy;
  const translationError = translationState.status === "error" && translationState.section === "insights"
    ? translationState.message
    : null;
  const speechError = speechActive && state.phase === "error" ? state.message : null;
  const speechNeedsModel = speechActive && state.phase === "error" && state.errorCode === "missing-model";
  const speechLabel = speechPreparing
    ? "Preparing Structured Note speech"
    : speechPlaying
      ? "Stop reading Structured Note"
      : speechError
        ? "Try reading Structured Note again"
        : "Read Structured Note aloud";

  return (
    <View style={styles.insightUtilityBlock}>
      <View style={styles.insightActionRow}>
        <TranslationActionButton
          compact
          section="insights"
          translated={translated}
          state={translationState}
          copy={translationCopy}
          onTranslate={onTranslate}
          onRestore={onRestore}
          onCancel={onCancel}
        />
        <CopyInsightsButton html={formatCoreInsightsAsHtml(insight)} position="top" compact />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={speechLabel}
          accessibilityState={{ busy: speechPreparing, disabled: speechDisabled, selected: speechPlaying }}
          disabled={speechDisabled}
          onPress={() => void service.speak({
            id: speechId,
            label: "Structured Note",
            text: formatCoreInsightsAsSpeech(insight),
            requestedLanguage,
          })}
          style={({ pressed }) => [
            styles.insightIconButton,
            { backgroundColor: colors.accentSoft, borderColor: colors.border },
            speechDisabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {speechPreparing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <SymbolView
              name={speechPlaying ? "stop.fill" : speechError ? "arrow.clockwise" : "speaker.wave.2.fill"}
              size={17}
              tintColor={speechError ? colors.danger : colors.accent}
              weight="semibold"
            />
          )}
        </Pressable>
      </View>
      {translationError && <Text selectable style={[styles.insightActionFeedback, { color: colors.danger }]}>{translationError}</Text>}
      {speechError && <Text selectable style={[styles.insightActionFeedback, { color: colors.danger }]}>{speechError}</Text>}
      {speechNeedsModel && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Text-to-Speech Models"
          hitSlop={6}
          onPress={() => router.push("/ai/tts-models" as Href)}
          style={({ pressed }) => [styles.insightModelsButton, pressed && styles.pressed]}
        >
          <Text style={[styles.insightModelsLink, { color: colors.accent }]}>Open TTS models</Text>
        </Pressable>
      )}
    </View>
  );
}

function CoreInsightResult({ insight, initialSection, textColor, mutedColor, borderColor, accentColor, surfaceMutedColor, onTaskCompletedChange, onTaskPinnedChange }: {
  insight: CoreNoteInsight;
  initialSection: InsightSectionKey;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  accentColor: string;
  surfaceMutedColor: string;
  onTaskCompletedChange: (taskId: string, completed: boolean) => Promise<void>;
  onTaskPinnedChange: (taskId: string, pinned: boolean) => Promise<void>;
}) {
  const [activeSection, setActiveSection] = useState<InsightSectionKey>(initialSection);
  const insightId = insight.getId();
  useEffect(() => setActiveSection(initialSection), [initialSection, insightId]);
  const empty = "No relevant information found.";
  const latestCompletedBySeries = new Map<string, number>();
  for (const task of insight.getTasks()) if (task.status === "completed" && task.seriesKey) latestCompletedBySeries.set(task.seriesKey, Math.max(latestCompletedBySeries.get(task.seriesKey) ?? -1, task.occurrenceIndex ?? 0));
  return (
    <View style={styles.document}>
      <InsightTabs activeSection={activeSection} onChange={setActiveSection} accentColor={accentColor} borderColor={borderColor} mutedColor={mutedColor} />
      {activeSection === "summary" && <InsightSection title="Summary" borderColor={borderColor} textColor={textColor} first>
        <Text selectable style={[styles.body, { color: insight.getSummary() ? textColor : mutedColor }]}>{insight.getSummary() || empty}</Text>
      </InsightSection>}
      {activeSection === "key-points" && <InsightSection title="Key Points" borderColor={borderColor} textColor={textColor} first>
        {insight.getKeyPoints().length ? (
          <View style={styles.bulletList}>
            {insight.getKeyPoints().map((item, index) => (
              <View key={`key-${index}`} style={styles.bulletRow}>
                <Text selectable style={[styles.bulletMarker, { color: mutedColor }]}>•</Text>
                <Text selectable style={[styles.resultItem, { color: textColor }]}>{item}</Text>
              </View>
            ))}
          </View>
        ) : <EmptyInsight text={empty} color={mutedColor} />}
      </InsightSection>}
      {activeSection === "tasks" && <InsightSection title="Tasks & Action Plan" borderColor={borderColor} textColor={textColor} first>
        {insight.getTasks().length ? insight.getTasks().map((task, taskIndex) => (
          <InteractiveTask key={task.id} task={task} index={taskIndex} textColor={textColor}
            mutedColor={mutedColor} borderColor={borderColor} accentColor={accentColor}
            surfaceMutedColor={surfaceMutedColor} onTaskCompletedChange={onTaskCompletedChange}
            onTaskPinnedChange={onTaskPinnedChange}
            canRestore={!task.endedAt && (!task.seriesKey || latestCompletedBySeries.get(task.seriesKey) === (task.occurrenceIndex ?? 0))}
          />
        )) : <EmptyInsight text={empty} color={mutedColor} />}
        {insight.getUnassignedActionItems().map((item) => <InsightRow key={item.id} title={item.title} detail={item.description} time={coreTimeDisplay(item.metadata, item.dueAt ? "dueAt" : "startsAt", item.dueAt ?? item.startsAt)} textColor={textColor} mutedColor={mutedColor} />)}
      </InsightSection>}
      <Text selectable style={[styles.generatedMeta, { color: mutedColor }]}>Generated locally · {formatDate(insight.getUpdatedAt())}</Text>
    </View>
  );
}

function SectionTabs({ activeSection, onChange, accentColor, backgroundColor, mutedColor, surfaceColor, textColor }: {
  activeSection: NoteSection;
  onChange: (section: NoteSection) => void;
  accentColor: string;
  backgroundColor: string;
  mutedColor: string;
  surfaceColor: string;
  textColor: string;
}) {
  const sections: { key: NoteSection; label: string }[] = [
    { key: "transcript", label: "Transcript" },
    { key: "insights", label: "Insights" },
    { key: "knowledge", label: "Knowledge" },
  ];
  return (
    <View accessibilityRole="tablist" style={[styles.sectionTabs, { backgroundColor }]}>
      {sections.map((section) => {
        const selected = section.key === activeSection;
        return <Pressable key={section.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(section.key)} style={({ pressed }) => [styles.sectionTab, { borderColor: "transparent" }, selected && { backgroundColor: surfaceColor, borderColor: accentColor }, pressed && styles.pressed]}>
          <Text style={[styles.sectionTabText, { color: selected ? textColor : mutedColor }]}>{section.label}</Text>
        </Pressable>;
      })}
    </View>
  );
}

function InsightTabs({ activeSection, onChange, accentColor, borderColor, mutedColor }: {
  activeSection: InsightSectionKey;
  onChange: (section: InsightSectionKey) => void;
  accentColor: string;
  borderColor: string;
  mutedColor: string;
}) {
  const sections: { key: InsightSectionKey; label: string }[] = [
    { key: "summary", label: "Summary" },
    { key: "key-points", label: "Key points" },
    { key: "tasks", label: "Tasks" },
  ];
  return (
    <View accessibilityRole="tablist" style={[styles.insightTabs, { borderColor }]}>
      {sections.map((section) => {
        const selected = activeSection === section.key;
        return (
          <Pressable
            key={section.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(section.key)}
            style={({ pressed }) => [styles.insightTab, pressed && styles.pressed]}
          >
            <Text style={[styles.insightTabText, { color: selected ? accentColor : mutedColor }]}>{section.label}</Text>
            <View style={[styles.insightTabIndicator, { backgroundColor: selected ? accentColor : "transparent" }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function NotePrimaryAction({ label, shortLabel, symbol, color, backgroundColor, onPress, disabled = false, selected }: {
  label: string;
  shortLabel: string;
  symbol: SFSymbol;
  color: string;
  backgroundColor: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.notePrimaryAction, { backgroundColor }, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <SymbolView name={symbol} size={18} tintColor={color} weight="semibold" />
      <Text numberOfLines={1} style={[styles.notePrimaryActionLabel, { color }]}>{shortLabel}</Text>
    </Pressable>
  );
}

function InteractiveTask({ task, index, textColor, mutedColor, borderColor, accentColor, surfaceMutedColor, onTaskCompletedChange, onTaskPinnedChange, canRestore }: {
  task: CoreTask;
  index: number;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  accentColor: string;
  surfaceMutedColor: string;
  onTaskCompletedChange: (taskId: string, completed: boolean) => Promise<void>;
  onTaskPinnedChange: (taskId: string, pinned: boolean) => Promise<void>;
  canRestore: boolean;
}) {
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const toggle = async (id: string, completed: boolean, update: (id: string, completed: boolean) => Promise<void>) => {
    if (busyIds.has(id)) return;
    setBusyIds((current) => new Set(current).add(id));
    try { await update(id, completed); }
    catch { /* The parent displays the persistence error. */ }
    finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <View style={[styles.taskCard, { backgroundColor: surfaceMutedColor, borderColor }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={task.isPinned ? "Unpin task" : "Pin task"}
        disabled={busyIds.has(task.id)}
        onPress={() => void toggle(task.id, !task.isPinned, onTaskPinnedChange)}
        style={({ pressed }) => [styles.taskPin, pressed && styles.pressed]}
      >
        <Text style={[styles.taskPinText, { color: accentColor }]}>{task.isPinned ? "★" : "☆"}</Text>
      </Pressable>
      <ChecklistRow
        title={`${index + 1}. ${task.title}`}
        description={task.description}
        time={coreTimeDisplay(task.metadata, "dueAt", task.dueAt)}
        completed={task.status === "completed"}
        busy={busyIds.has(task.id)}
        disabled={task.status === "completed" && !canRestore}
        emphasized
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
        accentColor={accentColor}
        onPress={() => void toggle(task.id, task.status !== "completed", onTaskCompletedChange)}
      />
      {task.recurrenceKind && (
        <Text style={[styles.structuredMeta, { color: mutedColor }]}>Repeats {task.recurrenceKind}{task.endedAt ? " · Ended series" : task.isCurrent === false ? " · History" : ""}</Text>
      )}
      <View style={styles.actionSteps}>
        {task.actionItems.length ? task.actionItems.map((item, actionIndex) => (
          <View key={item.id} style={styles.actionStep}>
            <Text selectable style={[styles.stepNumber, { color: mutedColor }]}>{actionIndex + 1}</Text>
            <View style={styles.stepCopy}>
              <Text selectable style={[styles.resultItem, { color: textColor }]}>{item.title}</Text>
              {displayValue(item.description) && <Text selectable style={[styles.supportingText, { color: mutedColor }]}>{item.description}</Text>}
              {coreTimeDisplay(item.metadata, item.dueAt ? "dueAt" : "startsAt", item.dueAt ?? item.startsAt) && (
                <Text selectable style={[styles.structuredMeta, { color: mutedColor }]}>Due: {coreTimeDisplay(item.metadata, item.dueAt ? "dueAt" : "startsAt", item.dueAt ?? item.startsAt)}</Text>
              )}
            </View>
          </View>
        )) : <EmptyInsight text="No actionable steps generated." color={mutedColor} />}
      </View>
    </View>
  );
}

function ChecklistRow({ title, description, time, completed, busy, disabled = false, emphasized = false, textColor, mutedColor, borderColor, accentColor, onPress }: {
  title: string;
  description: string | null;
  time: string | null;
  completed: boolean;
  busy: boolean;
  disabled?: boolean;
  emphasized?: boolean;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed, disabled: busy || disabled }}
      accessibilityLabel={`${completed ? "Mark incomplete" : "Mark complete"}: ${title}`}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.checklistRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, { borderColor: completed ? accentColor : borderColor }, completed && { backgroundColor: accentColor }]}>
        {busy ? <ActivityIndicator size="small" color={completed ? "#ffffff" : accentColor} /> : completed && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.stepCopy}>
        <Text selectable style={[emphasized ? styles.taskTitle : styles.resultItem,
          { color: completed ? mutedColor : textColor }, completed && styles.completedText]}>{title}</Text>
        {displayValue(description) && <Text selectable style={[styles.supportingText, { color: mutedColor }, completed && styles.completedText]}>{description}</Text>}
        {time && <Text selectable style={[styles.structuredMeta, { color: mutedColor }]}>Due: {time}</Text>}
      </View>
    </Pressable>
  );
}

function CopyInsightsButton({ html, position, compact = false }: { html: string; position: "top" | "bottom"; compact?: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const theme = useTheme();
  const colors = Colors[theme.mode];

  const copy = async () => {
    try {
      const copied = await Clipboard.setStringAsync(html, { inputFormat: Clipboard.StringFormat.HTML });
      setCopyState(copied ? "copied" : "error");
      if (copied) setTimeout(() => setCopyState("idle"), 2000);
      console.info("[CoreInsights] Formatted content copied", { position, copied });
    } catch (error) {
      setCopyState("error");
      console.warn("[CoreInsights] Formatted copy failed", { position, error });
    }
  };

  return (
    <View style={[styles.copyBlock, compact && styles.copyBlockCompact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copyState === "copied" ? "Structured Note copied" : copyState === "error" ? "Copy failed. Try again" : "Copy Structured Note"}
        accessibilityState={{ busy: false }}
        onPress={() => void copy()}
        style={({ pressed }) => [
          styles.copyButton,
          compact && styles.copyButtonCompact,
          { backgroundColor: colors.accentSoft, borderColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={copyState === "copied" ? "checkmark" : copyState === "error" ? "exclamationmark.triangle" : "doc.on.doc"}
          size={17}
          tintColor={copyState === "error" ? colors.danger : colors.accent}
          weight="semibold"
        />
        {!compact && <Text numberOfLines={1} style={[styles.copyLabel, { color: colors.accent }]}>{copyState === "copied" ? "Copied" : "Copy"}</Text>}
      </Pressable>
      {!compact && copyState === "error" && <Text selectable style={[styles.copyError, { color: colors.danger }]}>Unable to copy. Please try again.</Text>}
    </View>
  );
}

function formatCoreInsightsAsHtml(insight: CoreNoteInsight): string {
  const empty = "No relevant information found.";
  const list = (items: readonly string[]) => items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p><em>${empty}</em></p>`;
  const tasks = insight.getTasks().length
    ? `<ol>${insight.getTasks().map((task) => `<li><strong>${escapeHtml(task.title)}</strong>${optionalParagraph(task.description)}${optionalMeta("Due", coreTimeDisplay(task.metadata, "dueAt", task.dueAt))}${task.actionItems.length ? `<ol>${task.actionItems.map((item) => `<li>${escapeHtml(item.title)}${optionalParagraph(item.description)}${optionalMeta("Due", coreTimeDisplay(item.metadata, "dueAt", item.dueAt))}</li>`).join("")}</ol>` : `<p><em>No actionable steps generated.</em></p>`}</li>`).join("")}</ol>`
    : `<p><em>${empty}</em></p>`;

  return `<article><h1>Structured Note</h1><h2>Summary</h2><p>${escapeHtml(insight.getSummary() || empty)}</p><h2>Key Points</h2>${list(insight.getKeyPoints())}<h2>Tasks &amp; Action Plan</h2>${tasks}<hr><p><small>Generated locally · ${escapeHtml(formatDate(insight.getUpdatedAt()))}</small></p></article>`;
}

function formatCoreInsightsAsSpeech(insight: CoreNoteInsight): string {
  const parts = ["Structured Note."];
  if (insight.getSummary()) parts.push(`Summary. ${insight.getSummary()}`);
  if (insight.getKeyPoints().length) parts.push(`Key points. ${insight.getKeyPoints().join(". ")}`);
  if (insight.getTasks().length) {
    parts.push(`Tasks. ${insight.getTasks().map((task) => {
      const steps = task.actionItems.length ? ` Steps. ${task.actionItems.map((item) => item.title).join(". ")}` : "";
      return `${task.title}.${steps}`;
    }).join(" ")}`);
  }
  return parts.join(" ");
}

function coreTimeDisplay(metadata: Record<string, unknown>, field: string, normalized: string | null): string | null {
  const expressions = metadata.timeExpressions;
  if (expressions && typeof expressions === "object" && !Array.isArray(expressions)) {
    const value = (expressions as Record<string, unknown>)[field];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const raw = (value as Record<string, unknown>).raw;
      const resolvedDate = (value as Record<string, unknown>).resolvedDate;
      const resolved = (value as Record<string, unknown>).normalized;
      const precision = (value as Record<string, unknown>).precision;
      if (typeof raw === "string" && displayValue(raw)) {
        const friendlyResolved = precision === "datetime" && typeof resolved === "string"
          ? formatResolvedTime(resolved)
          : typeof resolvedDate === "string" ? formatResolvedDate(resolvedDate) : null;
        return friendlyResolved && !raw.includes(friendlyResolved) ? `${raw}（${friendlyResolved}）` : raw;
      }
    }
  }
  return displayValue(normalized) ? formatResolvedTime(normalized) : null;
}

function formatResolvedDate(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatResolvedTime(value: string): string {
  const dateTime = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (dateTime) return `${new Date(Number(dateTime[1]), Number(dateTime[2]) - 1, Number(dateTime[3])).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${dateTime[4]}:${dateTime[5]}`;
  return formatResolvedDate(value) ?? value;
}

function optionalParagraph(value: string | null): string {
  return displayValue(value) ? `<p>${escapeHtml(value)}</p>` : "";
}

function optionalMeta(label: string, value: string | null): string {
  return displayValue(value) ? `<p><small><strong>${label}:</strong> ${escapeHtml(value)}</small></p>` : "";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function InsightSection({ title, borderColor, textColor, first = false, children }: { title: string; borderColor: string; textColor: string; first?: boolean; children: ReactNode }) {
  return <View style={[styles.knowledgeSection, !first && styles.dividedSection, !first && { borderColor }]}><Text style={[styles.resultTitle, { color: textColor }]}>{title}</Text>{children}</View>;
}

function InsightRow({ title, detail, time, textColor, mutedColor }: { title: string; detail?: string | null; time?: string | null; textColor: string; mutedColor: string }) {
  return <View style={styles.structuredItem}><Text selectable style={[styles.resultItem, { color: textColor }]}>{title}</Text>{displayValue(detail) && <Text selectable style={[styles.supportingText, { color: mutedColor }]}>{detail}</Text>}{displayValue(time) && <Text selectable style={[styles.structuredMeta, { color: mutedColor }]}>Time: {time}</Text>}</View>;
}

function displayValue(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  return !["null", "unknown", "undefined", "none", "n/a", "na", "not specified", "unspecified"].includes(value.trim().toLocaleLowerCase());
}

function EmptyInsight({ text, color }: { text: string; color: string }) {
  return <Text selectable style={[styles.emptyInsight, { color }]}>{text}</Text>;
}

function KnowledgeHistoryResult({
  document,
  initiallyExpanded,
  textColor,
  mutedColor,
  borderColor,
  accentColor,
  onDelete,
}: {
  document: KnowledgeDocument;
  initiallyExpanded: boolean;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  accentColor: string;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  useEffect(() => setExpanded(initiallyExpanded), [initiallyExpanded]);
  return (
    <View style={[styles.historyResult, { borderColor }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.historyHeading, pressed && styles.pressed]}
      >
        <View style={styles.headingCopy}>
          <Text style={[styles.scenarioTitle, { color: textColor }]}>{document.getTemplateName()}</Text>
          <Text style={[styles.generatedMeta, { color: mutedColor }]}>{document.getTemplateDeleted() ? "Deleted template · " : ""}{formatDate(document.getCreatedAt())}</Text>
        </View>
        <Text style={[styles.scenarioTitle, { color: accentColor }]}>{expanded ? "⌃" : "⌄"}</Text>
      </Pressable>
      {expanded && (
        <>
          <KnowledgeResult document={document} textColor={textColor} mutedColor={mutedColor} borderColor={borderColor} />
          <Pressable accessibilityRole="button" onPress={onDelete} style={({ pressed }) => [styles.deleteResult, pressed && styles.pressed]}>
            <Text style={[styles.meta, { color: mutedColor }]}>Delete</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function KnowledgeResult({
  document,
  requestedLanguage,
  textColor,
  mutedColor,
  borderColor,
}: {
  document: KnowledgeDocument;
  requestedLanguage?: ContentLanguage;
  textColor: string;
  mutedColor: string;
  borderColor: string;
}) {
  const coreInsightSectionKeys = new Set(["keyPoints", "tasks", "reminders", "actionItems", "followUps", "nextSteps"]);
  const visibleSections = document.getSections().filter((section) => section.items.length > 0 && !coreInsightSectionKeys.has(section.key));
  return (
    <View style={styles.document}>
      <SpeechPlaybackButton
        speechId={`knowledge:${document.getId()}:${document.getUpdatedAt()}`}
        label="Knowledge document"
        text={[
          document.getSummary(),
          ...visibleSections.flatMap((section) => [section.title, ...section.items]),
        ].filter(Boolean).join(". ")}
        requestedLanguage={requestedLanguage}
      />
      {visibleSections.length === 0 && (
        <Text selectable style={[styles.emptyInsight, { color: mutedColor }]}>No supported scenario-specific information was found in this note.</Text>
      )}
      {visibleSections.map((section, sectionIndex) => (
          <View
            key={section.key}
            style={[
              styles.knowledgeSection,
              sectionIndex > 0 && styles.dividedSection,
              sectionIndex > 0 && { borderColor },
            ]}
          >
            <Text style={[styles.resultTitle, { color: textColor }]}>
              {section.title}
            </Text>
            <View style={styles.itemList}>
              {section.items.map((item, index) => (
                <View key={`${section.key}-${index}`} style={styles.itemRow}>
                  <Text style={[styles.bullet, { color: mutedColor }]}>•</Text>
                  <Text
                    selectable
                    style={[styles.resultItem, { color: textColor }]}
                  >
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      <Text style={[styles.generatedMeta, { color: mutedColor }]}>
        Generated locally · {formatDate(document.getUpdatedAt())}
      </Text>
    </View>
  );
}

function TranslationControl({ section, translated, targetLanguage, state, copy, dangerColor, mutedColor, onTranslate, onRestore, onCancel }: {
  section: NoteTranslationSection;
  translated: boolean;
  targetLanguage: string;
  state: TranslationState;
  copy: NoteTranslationCopy;
  dangerColor: string;
  mutedColor: string;
  onTranslate: (section: NoteTranslationSection) => Promise<void>;
  onRestore: (section: NoteTranslationSection) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const error = state.status === "error" && state.section === section ? state.message : null;
  return (
    <View style={styles.translationControl}>
      <Text selectable style={[styles.supportingText, { color: mutedColor }]}>
        {translated ? copy.translatedInto(targetLanguage) : copy.translateInto(copy.languageName)}
      </Text>
      <Text selectable style={[styles.supportingText, { color: mutedColor }]}>{copy.localHint}</Text>
      <TranslationActionButton
        section={section}
        translated={translated}
        state={state}
        copy={copy}
        onTranslate={onTranslate}
        onRestore={onRestore}
        onCancel={onCancel}
      />
      {error && <Text selectable style={[styles.errorText, { color: dangerColor }]}>{error}</Text>}
    </View>
  );
}

function TranslationActionButton({ section, translated, state, copy, onTranslate, onRestore, onCancel, compact = false }: {
  section: NoteTranslationSection;
  translated: boolean;
  state: TranslationState;
  copy: NoteTranslationCopy;
  onTranslate: (section: NoteTranslationSection) => Promise<void>;
  onRestore: (section: NoteTranslationSection) => Promise<void>;
  onCancel: () => Promise<void>;
  compact?: boolean;
}) {
  const colors = Colors[useTheme().mode];
  const translating = state.status === "translating" && state.section === section;
  const disabled = state.status === "translating" && !translating;
  const accessibilityLabel = translated
    ? `${copy.restore}: ${section}`
    : translating
      ? `${copy.translating} ${section}`
      : `${copy.translateInto(copy.languageName)}: ${section}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: translating, disabled }}
      disabled={disabled}
      onPress={() => translating ? void onCancel() : translated ? void onRestore(section) : void onTranslate(section)}
      style={({ pressed }) => [
        styles.translationActionButton,
        compact && styles.translationActionButtonCompact,
        { backgroundColor: translated ? colors.accent : colors.accentSoft, borderColor: translated ? colors.accent : colors.border },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={translating ? "xmark" : { ios: "translate", android: "translate", web: "translate" }}
        size={18}
        tintColor={translated ? colors.background : colors.accent}
        weight="semibold"
      />
      {!compact && (
        <Text numberOfLines={1} style={[styles.translationActionLabel, { color: translated ? colors.background : colors.accent }]}>
          {translating ? "Cancel" : translated ? "Original" : "Translate"}
        </Text>
      )}
    </Pressable>
  );
}

function translateCoreInsight(insight: CoreNoteInsight | null, strings?: Record<string, string>): CoreNoteInsight | null {
  if (!insight || !strings) return insight;
  const text = (key: string, original: string) => strings[key] ?? original;
  const tasks = insight.getTasks().map((task, taskIndex) => ({
    ...task,
    title: text(`insight.task.${taskIndex}.title`, task.title),
    description: task.description ? text(`insight.task.${taskIndex}.description`, task.description) : null,
    actionItems: task.actionItems.map((item, itemIndex) => ({
      ...item,
      title: text(`insight.task.${taskIndex}.action.${itemIndex}.title`, item.title),
      description: item.description ? text(`insight.task.${taskIndex}.action.${itemIndex}.description`, item.description) : null,
    })),
  }));
  const unassigned = insight.getUnassignedActionItems().map((item, index) => ({
    ...item,
    title: text(`insight.action.${index}.title`, item.title),
    description: item.description ? text(`insight.action.${index}.description`, item.description) : null,
  }));
  return new CoreNoteInsight(
    insight.getId(), insight.getNoteId(), text("insight.summary", insight.getSummary()),
    insight.getKeyPoints().map((item, index) => text(`insight.keyPoint.${index}`, item)),
    tasks, unassigned, insight.getModelId(), insight.getCreatedAt(), insight.getUpdatedAt(),
  );
}

function translateKnowledge(document: KnowledgeDocument | null, strings?: Record<string, string>): KnowledgeDocument | null {
  if (!document || !strings) return document;
  const text = (key: string, original: string) => strings[key] ?? original;
  return new KnowledgeDocument(
    document.getId(), document.getNoteId(), document.getScenario(), text("knowledge.summary", document.getSummary()),
    document.getSections().map((section, sectionIndex) => ({
      ...section,
      title: text(`knowledge.section.${sectionIndex}.title`, section.title),
      items: section.items.map((item, itemIndex) => text(`knowledge.section.${sectionIndex}.item.${itemIndex}`, item)),
    })),
    document.getModelId(), document.getCreatedAt(), document.getUpdatedAt(),
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.lg, padding: Spacing.lg },
  header: { gap: Spacing.md },
  translationControl: { gap: Spacing.xs },
  insightUtilityBlock: { alignItems: "flex-end", flexShrink: 0, gap: 4 },
  insightActionRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  insightActionFeedback: { fontSize: 11, lineHeight: 15, maxWidth: 132, textAlign: "right" },
  insightModelsLink: { fontSize: 11, fontWeight: "800", lineHeight: 15 },
  insightModelsButton: { alignItems: "center", alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
  insightIconButton: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  translationActionButton: { alignItems: "center", alignSelf: "stretch", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: Spacing.sm },
  translationActionButtonCompact: { alignSelf: "auto", height: 44, minHeight: 44, paddingHorizontal: 0, width: 44 },
  translationActionLabel: { flexShrink: 1, fontSize: 12, fontWeight: "800" },
  headerProgress: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  noteTitleButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: Spacing.sm, minHeight: 44, maxWidth: "100%" },
  noteTitle: { flexShrink: 1, fontSize: 30, fontWeight: "800", lineHeight: 36 },
  titleEditorBlock: { gap: Spacing.xs },
  titleEditorRow: { alignItems: "center", flexDirection: "row", gap: Spacing.xs },
  titleInput: { borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flex: 1, fontSize: 22, fontWeight: "800", minHeight: 48, minWidth: 0, paddingHorizontal: Spacing.sm },
  titleEditAction: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, height: 44, justifyContent: "center", width: 44 },
  noteIdentityRow: { alignItems: "flex-start", flexDirection: "row", gap: Spacing.md, justifyContent: "space-between" },
  noteIdentity: { flex: 1, gap: 4, minWidth: 0 },
  workspaceName: { fontSize: 15, fontWeight: "700", lineHeight: 21 },
  noteMetaRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", columnGap: Spacing.sm, rowGap: 0 },
  pinnedMeta: { fontSize: 12, fontWeight: "800" },
  noteQuickActions: { alignItems: "center", flexDirection: "row", flexShrink: 0, gap: 6 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 36, fontWeight: "800", lineHeight: 42 },
  meta: { fontSize: 13 },
  noteTimestamp: { flexShrink: 1, fontSize: 13, fontVariant: ["tabular-nums"] },
  categoryControl: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  categoryBadge: { borderCurve: "continuous", borderRadius: 999, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  categoryButtonText: { fontSize: 12, fontWeight: "800" },
  historyResult: { borderRadius: Radius.sm, borderWidth: 1, gap: Spacing.sm, padding: Spacing.md },
  historyHeading: { alignItems: "center", flexDirection: "row", gap: Spacing.md, justifyContent: "space-between" },
  deleteResult: { alignSelf: "flex-start", paddingVertical: Spacing.xs },
  audioAction: { fontSize: 13, fontWeight: "800", paddingHorizontal: Spacing.xs },
  transcript: {
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  sectionTitle: { fontSize: 20, fontWeight: "800" },
  body: { fontSize: 17, lineHeight: 28 },
  knowledgeCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.md,
    padding: Spacing.md,
  },
  conversationList: { gap: Spacing.sm },
  conversationCard: { alignItems: "center", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", gap: Spacing.md, padding: Spacing.md },
  knowledgeHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  structuredNoteHeading: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, justifyContent: "space-between" },
  headingCopy: { flex: 1, gap: Spacing.xs },
  supportingText: { fontSize: 14, lineHeight: 20 },
  scenarioBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  scenarioBadgeText: { fontSize: 12, fontWeight: "800" },
  generationStatus: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    borderRadius: Radius.sm,
    gap: Spacing.md,
    padding: Spacing.md,
  },
  statusTitle: { fontSize: 16, fontWeight: "700" },
  selector: { gap: Spacing.md },
  selectorTitle: { fontSize: 17, fontWeight: "800" },
  scenarioGrid: { gap: Spacing.sm },
  scenarioOption: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    gap: 3,
    padding: Spacing.md,
  },
  scenarioTitle: { fontSize: 16, fontWeight: "800" },
  scenarioDescription: { fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.72 },
  errorText: { fontSize: 14, lineHeight: 20 },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  notePrimaryAction: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: Radius.sm,
    flexDirection: "row",
    gap: 6,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
  },
  notePrimaryActionLabel: { fontSize: 13, fontWeight: "800" },
  sectionTabs: { borderCurve: "continuous", borderRadius: Radius.md, flexDirection: "row", gap: 4, padding: 4 },
  sectionTab: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: Spacing.xs },
  sectionTabText: { fontSize: 13, fontWeight: "800" },
  insightTabs: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row" },
  insightTab: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: Spacing.xs, position: "relative" },
  insightTabText: { fontSize: 13, fontWeight: "800", textAlign: "center" },
  insightTabIndicator: { borderRadius: 999, bottom: -StyleSheet.hairlineWidth, height: 3, left: Spacing.sm, position: "absolute", right: Spacing.sm },
  modalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  modalTitle: { fontSize: 23, fontWeight: "800" },
  modalProgress: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, minHeight: 44 },
  workspaceChoices: { gap: Spacing.sm },
  document: { gap: Spacing.lg },
  streamPreview: { flexBasis: "100%", gap: Spacing.sm },
  knowledgeSection: { gap: Spacing.sm },
  dividedSection: { borderTopWidth: 1, paddingTop: Spacing.lg },
  resultTitle: { fontSize: 19, fontWeight: "800" },
  itemList: { gap: Spacing.sm },
  bulletList: { gap: Spacing.sm },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  bulletMarker: { fontSize: 18, lineHeight: 25 },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm },
  bullet: { fontSize: 18, lineHeight: 25 },
  resultItem: { flex: 1, fontSize: 16, lineHeight: 25 },
  generatedMeta: { fontSize: 12 },
  structuredItem: { gap: Spacing.xs, paddingVertical: Spacing.xs },
  structuredMeta: { fontSize: 12, fontVariant: ["tabular-nums"] },
  emptyInsight: { fontSize: 14, fontStyle: "italic", lineHeight: 20 },
  taskCard: { borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm, padding: Spacing.sm, position: "relative" },
  taskPin: { alignItems: "center", justifyContent: "center", minHeight: 34, minWidth: 34, position: "absolute", right: Spacing.sm, top: Spacing.sm, zIndex: 2 },
  taskPinText: { fontSize: 21, fontWeight: "700" },
  taskTitle: { fontSize: 17, fontWeight: "800", lineHeight: 24 },
  actionSteps: { gap: Spacing.xs, paddingLeft: Spacing.lg },
  actionStep: { alignItems: "flex-start", flexDirection: "row", gap: Spacing.sm, paddingVertical: Spacing.xs },
  stepNumber: { fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "800", lineHeight: 25, minWidth: 22 },
  stepCopy: { flex: 1, gap: 2 },
  checklistRow: { alignItems: "flex-start", flexDirection: "row", gap: Spacing.sm, minHeight: 44, padding: Spacing.xs },
  checkbox: { alignItems: "center", borderRadius: 7, borderWidth: 2, height: 24, justifyContent: "center", width: 24 },
  checkmark: { color: "#ffffff", fontSize: 16, fontWeight: "900", lineHeight: 19 },
  completedText: { textDecorationLine: "line-through" },
  copyBlock: { alignItems: "flex-start", gap: Spacing.xs },
  copyBlockCompact: { alignItems: "center" },
  copyButton: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 40, paddingHorizontal: Spacing.md },
  copyButtonCompact: { height: 44, justifyContent: "center", minHeight: 44, paddingHorizontal: 0, width: 44 },
  copyLabel: { flexShrink: 1, fontSize: 12, fontWeight: "800" },
  copyError: { fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.5 },
});
