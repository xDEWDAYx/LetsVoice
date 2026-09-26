import { UiAlert as Alert } from "@/localization/ui-alert";
import { UiTextInput as TextInput } from "@/components/ui-text-input";
import { UiText as Text } from "@/components/ui-text";
import { SymbolView } from "expo-symbols";
import { Stack, type Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    InputAccessoryView,
    Keyboard,
    Pressable,
    StyleSheet,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { ModalCloseButton } from "@/components/modal-close-button";
import { SafeAreaModal } from "@/components/safe-area-modal";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { NoteCard } from "@/components/note-card";
import { CategoryFilter, type CategoryFilterValue } from "@/components/category-filter";
import { NoteSelectionToolbar } from "@/components/note-selection-toolbar";
import { Colors, Radius, Spacing } from "@/constants/theme";
import type { Note } from "@/domain/note/note";
import { ValidationError } from "@/errors/validation-error";
import { useTheme } from "@/hooks/use-theme";
import { useTrashUndo } from "@/providers/trash-undo-provider";
import type { NoteSearchResult } from "@/services/note-fuzzy-search";

type WorkspaceNotesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      workspace: NonNullable<
        Awaited<ReturnType<typeof appContainer.workspaceService.getWorkspace>>
      >;
      notes: Awaited<
        ReturnType<typeof appContainer.noteService.getNotesByWorkspace>
      >;
    };

type WorkspaceNoteListItem = {
  note: Note;
  match?: NoteSearchResult;
};

type WorkspaceNoteSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; results: NoteSearchResult[] };

const TRANSCRIPT_INPUT_ACCESSORY_ID = "new-note-transcript-accessory";

export default function WorkspaceDetailScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const { workspaceService, noteService } = appContainer;
  const { showTrashUndo } = useTrashUndo();
  const [state, setState] = useState<WorkspaceNotesState>({
    status: "loading",
  });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"create-note" | "rename">("create-note");
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteTranscript, setNewNoteTranscript] = useState("");
  const [renameWorkspaceDraft, setRenameWorkspaceDraft] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pinningNoteId, setPinningNoteId] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilterValue>("all");
  const [noteQuery, setNoteQuery] = useState("");
  const [noteSearch, setNoteSearch] = useState<WorkspaceNoteSearchState>({ status: "idle" });
  const [searchRevision, setSearchRevision] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [destinationWorkspaces, setDestinationWorkspaces] = useState<Awaited<ReturnType<typeof workspaceService.getWorkspaces>>>([]);
  const normalizedNoteQuery = noteQuery.trim();

  const categoryNotes = useMemo(
    () => state.status === "success"
      ? state.notes.filter((note) => category === "all" || note.getCategory() === category)
      : [],
    [category, state],
  );
  const filteredSearchResults = useMemo(
    () => noteSearch.status === "success"
      ? noteSearch.results.filter((result) => category === "all" || result.note.getCategory() === category)
      : [],
    [category, noteSearch],
  );
  const currentItems = useMemo<WorkspaceNoteListItem[]>(
    () => normalizedNoteQuery
      ? filteredSearchResults.map((match) => ({ note: match.note, match }))
      : categoryNotes.map((note) => ({ note })),
    [categoryNotes, filteredSearchResults, normalizedNoteQuery],
  );
  const visibleItems = useMemo<WorkspaceNoteListItem[]>(
    () => frozenIds === null
      ? currentItems
      : frozenIds.flatMap((id) => state.status === "success"
        ? state.notes.find((note) => note.getId() === id) ?? []
        : []).map((note) => ({ note })),
    [currentItems, frozenIds, state],
  );
  const visibleNotes = useMemo(
    () => visibleItems.map((item) => item.note),
    [visibleItems],
  );
  const selectedNotes = useMemo(
    () => visibleNotes.filter((note) => selectedIds.has(note.getId())),
    [selectedIds, visibleNotes],
  );

  const loadWorkspace = async () => {
    setState({ status: "loading" });

    try {
      const [loadedWorkspace, loadedNotes] = await Promise.all([
        workspaceService.getWorkspace(workspaceId),
        noteService.getNotesByWorkspace(workspaceId),
      ]);
      if (loadedWorkspace === null) {
        setState({ status: "error", message: "Workspace not found." });
        return;
      }

      setState({
        status: "success",
        workspace: loadedWorkspace,
        notes: loadedNotes,
      });
      setDestinationWorkspaces(await workspaceService.getWorkspaces());
      setSearchRevision((value) => value + 1);
    } catch {
      setState({ status: "error", message: "Unable to load workspace." });
    }
  };

  useFocusEffect(
    useCallback(() => {
      void loadWorkspace();
    }, [workspaceId]),
  );

  useEffect(() => noteService.subscribeToCategoryChanges(() => {
    void noteService.getNotesByWorkspace(workspaceId).then((notes) => {
      setState((current) => current.status === "success" ? { ...current, notes } : current);
      setSearchRevision((value) => value + 1);
    });
  }), [noteService, workspaceId]);

  useEffect(() => {
    if (frozenIds !== null) return;
    if (!normalizedNoteQuery) {
      setNoteSearch({ status: "idle" });
      return;
    }

    let active = true;
    setNoteSearch({ status: "loading" });
    const timer = setTimeout(() => {
      void noteService.searchNoteResults(normalizedNoteQuery).then(
        (results) => {
          if (!active) return;
          setNoteSearch({
            status: "success",
            results: results.filter((result) => result.note.getWorkspaceId() === workspaceId),
          });
        },
        () => active && setNoteSearch({ status: "error" }),
      );
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [frozenIds, normalizedNoteQuery, noteService, searchRevision, workspaceId]);

  useEffect(() => {
    const refreshSearch = () => setSearchRevision((value) => value + 1);
    const unsubscribers = [
      noteService.subscribeToChanges(refreshSearch),
      appContainer.coreNoteInsightService.subscribeToChanges(refreshSearch),
      appContainer.knowledgeService.subscribeToChanges(refreshSearch),
      appContainer.aiConversationService.subscribeToChanges(refreshSearch),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [noteService]);

  const createNote = async () => {
    setFormError(null);
    setIsSaving(true);

    try {
      await noteService.createNote(workspaceId, newNoteTitle, newNoteTranscript);
      setNewNoteTitle("");
      setNewNoteTranscript("");
      Keyboard.dismiss();
      setIsModalVisible(false);
      await loadWorkspace();
    } catch (caughtError) {
      setFormError(
        caughtError instanceof ValidationError
          ? caughtError.message
          : "Unable to create note.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renameWorkspace = async () => {
    setFormError(null);
    setIsSaving(true);
    try {
      await workspaceService.renameWorkspace(workspaceId, renameWorkspaceDraft ?? "");
      setRenameWorkspaceDraft(null);
      setIsModalVisible(false);
      await loadWorkspace();
    } catch (error) {
      setFormError(error instanceof ValidationError ? error.message : "Unable to rename workspace.");
    } finally {
      setIsSaving(false);
    }
  };

  const openNewNote = () => {
    setModalMode("create-note");
    setFormError(null);
    setIsModalVisible(true);
  };

  const openRenameWorkspace = () => {
    if (state.status !== "success") return;
    setModalMode("rename");
    setRenameWorkspaceDraft((current) => current ?? state.workspace.getName());
    setFormError(null);
    setIsModalVisible(true);
  };

  const closeWorkspaceModal = () => {
    if (isSaving) return;
    Keyboard.dismiss();
    setIsModalVisible(false);
  };

  const togglePinned = async (noteId: string, isPinned: boolean) => {
    setPinningNoteId(noteId);

    try {
      await noteService.setNotePinned(noteId, !isPinned);
      const notes = await noteService.getNotesByWorkspace(workspaceId);
      setState((current) =>
        current.status === "success" ? { ...current, notes } : current,
      );
    } catch {
      Alert.alert(
        isPinned ? "Unable to unpin note" : "Unable to pin note",
        "Please try again.",
      );
    } finally {
      setPinningNoteId(null);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setFrozenIds(null);
  };

  const toggleSelected = (noteId: string) => {
    if (frozenIds === null) setFrozenIds(visibleNotes.map((note) => note.getId()));
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId); else next.add(noteId);
      if (next.size === 0) setFrozenIds(null);
      return next;
    });
  };

  const runBatch = async (action: () => Promise<void>) => {
    setBatchBusy(true);
    try {
      await action();
      clearSelection();
      await loadWorkspace();
    } catch (error) {
      Alert.alert("Unable to update selected notes", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBatchBusy(false);
    }
  };

  const confirmDeleteWorkspace = () => {
    if (state.status !== "success") return;
    const count = state.notes.length;
    Alert.alert(
      "Move workspace to Trash?",
      count > 0
        ? `Its ${count} ${count === 1 ? "note" : "notes"} will be hidden but kept until permanent deletion in Settings → Trash.`
        : "You can restore it later from Settings → Trash.",
      [{ text: "Cancel", style: "cancel" }, { text: "Move to Trash", style: "destructive", onPress: () => {
        void workspaceService.deleteWorkspace(workspaceId).then(
          () => {
            showTrashUndo({
              message: `${state.workspace.getName()} moved to Trash`,
              undo: async () => {
                await workspaceService.restoreWorkspace(workspaceId);
                router.replace({ pathname: "/workspaces/[workspaceId]", params: { workspaceId } });
              },
            });
            router.replace("/workspaces");
          },
          () => Alert.alert("Unable to delete workspace", "Please try again."),
        );
      }}],
    );
  };

  const openSearchResult = (result: NoteSearchResult) => {
    if (result.conversationId) {
      router.push({ pathname: "/ask-ai", params: { conversationId: result.conversationId } });
      return;
    }
    const section = result.source === "Knowledge"
      ? "knowledge"
      : result.source === "Structured Note"
        ? "insights"
        : "transcript";
    router.push({
      pathname: "/notes/[noteId]",
      params: {
        noteId: result.note.getId(),
        section,
        insightSection: result.insightSection,
        knowledgeResultId: result.knowledgeResultId,
      },
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title:
            state.status === "success"
              ? state.workspace.getName()
              : "Workspace",
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          accessibilityLabel="More workspace actions"
          disabled={isSaving || isModalVisible || batchBusy}
          hidden={state.status !== "success"}
          icon="ellipsis"
        >
          <Stack.Toolbar.MenuAction icon="pencil" onPress={openRenameWorkspace}>
            Rename Workspace
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction destructive icon="trash" onPress={confirmDeleteWorkspace}>
            Move to Trash
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      {state.status === "loading" && <View style={styles.stateContent}><LoadingState /></View>}
      {state.status === "error" && (
        <View style={styles.stateContent}>
          <ErrorState message={state.message} onRetry={() => void loadWorkspace()} />
        </View>
      )}
      {state.status === "success" && <>
        <View style={[styles.fixedContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.workspaceHeading}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a new note"
                onPress={openNewNote}
                style={({ pressed }) => [
                  styles.newNoteButton,
                  { backgroundColor: colors.accent },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView name="plus" size={22} tintColor={colors.surface} weight="bold" />
              </Pressable>
            </View>
            <View style={styles.workspaceMetaRow}>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {state.notes.length} {state.notes.length === 1 ? "note" : "notes"}
              </Text>
              <Text style={[styles.metaSeparator, { color: colors.border }]}>•</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Updated {new Date(state.workspace.getUpdatedAt()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Text>
            </View>
          </View>
          <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SymbolView name="magnifyingglass" size={17} tintColor={colors.textMuted} weight="semibold" />
            <TextInput
              accessibilityLabel="Search notes and related content"
              autoCapitalize="none"
              autoCorrect={false}
              editable={frozenIds === null}
              onChangeText={setNoteQuery}
              onSubmitEditing={Keyboard.dismiss}
              placeholder="Search transcripts, insights, Knowledge, or Ask AI"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.text }]}
              value={noteQuery}
            />
            {noteSearch.status === "loading" && normalizedNoteQuery && (
              <ActivityIndicator accessibilityLabel="Searching note content" color={colors.accent} size="small" />
            )}
            {noteQuery.length > 0 && (
              <Pressable
                accessibilityLabel="Clear note search"
                accessibilityRole="button"
                accessibilityState={{ disabled: frozenIds !== null }}
                disabled={frozenIds !== null}
                onPress={() => setNoteQuery("")}
                style={({ pressed }) => [styles.clearSearch, frozenIds !== null && styles.disabled, pressed && frozenIds === null && styles.pressed]}
              >
                <SymbolView name="xmark.circle.fill" size={18} tintColor={colors.textMuted} weight="semibold" />
              </Pressable>
            )}
          </View>
          <CategoryFilter value={category} onChange={frozenIds === null ? setCategory : () => undefined} />
          {frozenIds !== null && (
            <NoteSelectionToolbar
              selectedNotes={selectedNotes}
              allVisibleSelected={selectedIds.size === visibleNotes.length}
              workspaces={destinationWorkspaces}
              busy={batchBusy}
              onToggleAll={() => {
                if (selectedIds.size === visibleNotes.length) clearSelection();
                else setSelectedIds(new Set(visibleNotes.map((note) => note.getId())));
              }}
              onCancel={clearSelection}
              onMove={(destinationId) => runBatch(() => noteService.moveNotes([...selectedIds], destinationId))}
              onTrash={() => runBatch(async () => {
                const ids = [...selectedIds];
                await noteService.trashNotes(ids);
                showTrashUndo({
                  message: `${ids.length} notes moved to Trash`,
                  undo: async () => {
                    await noteService.restoreNotes(ids);
                    await loadWorkspace();
                  },
                });
              })}
              onPin={(pinned) => runBatch(() => noteService.setNotesPinned([...selectedIds], pinned))}
              onAskAi={() => {
                const noteIds = [...selectedIds].sort().join(",");
                clearSelection();
                router.push({ pathname: "/ask-ai", params: { noteIds } } as unknown as Href);
              }}
            />
          )}
        </View>
        <FlatList<WorkspaceNoteListItem>
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Spacing.xxl + insets.bottom },
            visibleItems.length === 0 && styles.emptyListContent,
          ]}
          contentInsetAdjustmentBehavior="automatic"
          data={visibleItems}
          extraData={[batchBusy, frozenIds, pinningNoteId, selectedIds]}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.note.getId()}
          ListEmptyComponent={noteSearch.status === "loading" && normalizedNoteQuery
            ? <LoadingState />
            : noteSearch.status === "error" && normalizedNoteQuery
              ? <ErrorState message="Unable to search this workspace." onRetry={() => setSearchRevision((value) => value + 1)} />
              : state.notes.length === 0
                ? <EmptyState title="No notes yet" />
                : normalizedNoteQuery
                  ? <EmptyState title="No matching notes" description={`No Note, Structured Note, Knowledge result, or Ask AI conversation matches “${normalizedNoteQuery}” in this workspace.`} />
                  : <EmptyState title="No notes in this category" />}
          renderItem={({ item }) => (
            <NoteCard
              note={item.note}
              match={item.match ? { source: item.match.source, excerpt: item.match.excerpt, query: normalizedNoteQuery, resourceTitle: item.match.resourceTitle } : undefined}
              isPinning={pinningNoteId === item.note.getId()}
              onPinPress={frozenIds === null ? () => void togglePinned(item.note.getId(), item.note.getIsPinned()) : undefined}
              selectionMode={frozenIds !== null}
              selected={selectedIds.has(item.note.getId())}
              onLongPress={() => toggleSelected(item.note.getId())}
              onPress={() => frozenIds !== null
                ? toggleSelected(item.note.getId())
                : item.match
                  ? openSearchResult(item.match)
                  : router.push({ pathname: "/notes/[noteId]", params: { noteId: item.note.getId() } })}
            />
          )}
          showsVerticalScrollIndicator
          style={styles.noteList}
        />
      </>}

      <SafeAreaModal
        androidKeyboardBehavior="height"
        dismissDisabled={isSaving}
        visible={isModalVisible}
        onRequestClose={closeWorkspaceModal}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {modalMode === "rename" ? "Rename workspace" : "New note"}
          </Text>
          <ModalCloseButton disabled={isSaving} onPress={closeWorkspaceModal} tintColor={colors.textMuted} />
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {modalMode === "rename" ? "Workspace name" : "Title (optional)"}
        </Text>
        <TextInput
          placeholder={modalMode === "rename" ? "Workspace name" : "e.g. Team meeting"}
          placeholderTextColor={colors.textMuted}
          value={modalMode === "rename" ? renameWorkspaceDraft ?? "" : newNoteTitle}
          onChangeText={modalMode === "rename" ? setRenameWorkspaceDraft : setNewNoteTitle}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text },
          ]}
        />
        {modalMode === "create-note" && <>
          <Text style={[styles.label, { color: colors.textMuted }]}>Transcript</Text>
          <TextInput
            multiline
            inputAccessoryViewID={TRANSCRIPT_INPUT_ACCESSORY_ID}
            placeholder="Write the note transcript..."
            placeholderTextColor={colors.textMuted}
            textAlignVertical="top"
            value={newNoteTranscript}
            onChangeText={setNewNoteTranscript}
            style={[
              styles.input,
              styles.transcriptInput,
              { borderColor: colors.border, color: colors.text },
            ]}
          />
        </>}
        {formError && (
          <Text style={[styles.formError, { color: colors.danger }]}>{formError}</Text>
        )}
        <AppButton
          label={isSaving ? "Saving..." : modalMode === "rename" ? "Save name" : "Create note"}
          disabled={isSaving}
          onPress={() => void (modalMode === "rename" ? renameWorkspace() : createNote())}
        />
        {process.env.EXPO_OS === "ios" && modalMode === "create-note" && (
          <InputAccessoryView nativeID={TRANSCRIPT_INPUT_ACCESSORY_ID}>
            <View
              style={[
                styles.inputAccessory,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Pressable
                onPress={Keyboard.dismiss}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.inputAccessoryAction,
                    { color: colors.accent },
                  ]}
                >
                  Done
                </Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        )}
      </SafeAreaModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  stateContent: { flex: 1, padding: Spacing.lg },
  fixedContent: { borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm, paddingBottom: Spacing.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  workspaceHeading: { gap: Spacing.sm },
  workspaceMetaRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  metaSeparator: { fontSize: 12 },
  pressed: { opacity: 0.65 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  meta: { fontSize: 13 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  searchField: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", gap: Spacing.sm, minHeight: 48, paddingLeft: Spacing.sm },
  searchInput: { flex: 1, fontSize: 15, minHeight: 46, minWidth: 0, paddingVertical: 0 },
  clearSearch: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  disabled: { opacity: 0.5 },
  newNoteButton: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: Radius.sm,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  sectionTitle: { fontSize: 24, fontWeight: "800" },
  noteList: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  emptyListContent: { flexGrow: 1 },
  listSeparator: { height: Spacing.md },
  inputAccessory: {
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  inputAccessoryAction: { fontSize: 16, fontWeight: "700" },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 23, fontWeight: "800" },
  label: { fontSize: 14, fontWeight: "700" },
  input: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
  },
  transcriptInput: { minHeight: 130, paddingTop: Spacing.md },
  formError: { fontSize: 14 },
});
