import { UiTextInput as TextInput } from "@/components/ui-text-input";
import { UiText as Text } from "@/components/ui-text";
import { Stack, type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, View } from "react-native";
import { UiAlert as Alert } from "@/localization/ui-alert";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { CategoryFilter, type CategoryFilterValue } from "@/components/category-filter";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { NoteCard } from "@/components/note-card";
import { NoteSelectionToolbar } from "@/components/note-selection-toolbar";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTrashUndo } from "@/providers/trash-undo-provider";
import type { NoteSearchResult } from "@/services/note-fuzzy-search";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; results: NoteSearchResult[] };

export default function NoteSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = Colors[useTheme().mode];
  const { showTrashUndo } = useTrashUndo();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilterValue>("all");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [workspaces, setWorkspaces] = useState<Awaited<ReturnType<typeof appContainer.workspaceService.getWorkspaces>>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [frozenResults, setFrozenResults] = useState<NoteSearchResult[] | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const [pinningNoteId, setPinningNoteId] = useState<string | null>(null);

  useEffect(() => { void appContainer.workspaceService.getWorkspaces().then(setWorkspaces); }, []);

  useEffect(() => {
    if (frozenResults !== null) return;
    let active = true;
    const normalized = query.trim();
    if (normalized.length === 0) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    const timer = setTimeout(() => {
      void appContainer.noteService.searchNoteResults(normalized).then(
        (results) => active && setState({ status: "success", results }),
        () => active && setState({ status: "error", message: "Unable to search notes." }),
      );
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [frozenResults, query, searchRevision]);

  useFocusEffect(useCallback(() => {
    setSearchRevision((value) => value + 1);
  }, []));

  useEffect(() => {
    const refresh = () => setSearchRevision((value) => value + 1);
    const unsubscribers = [
      appContainer.noteService.subscribeToChanges(refresh),
      appContainer.noteService.subscribeToCategoryChanges(refresh),
      appContainer.workspaceService.subscribeToChanges(refresh),
      appContainer.coreNoteInsightService.subscribeToChanges(refresh),
      appContainer.knowledgeService.subscribeToChanges(refresh),
      appContainer.aiConversationService.subscribeToChanges(refresh),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const filtered = useMemo(() => {
    const results = frozenResults ?? (state.status === "success" ? state.results : []);
    return results.filter((result) => category === "all" || result.note.getCategory() === category);
  }, [category, frozenResults, state]);
  const selectedNotes = useMemo(() => filtered.filter((result) => selectedIds.has(result.note.getId())).map((result) => result.note), [filtered, selectedIds]);

  const clearSelection = () => { setSelectedIds(new Set()); setFrozenResults(null); };
  const toggle = (id: string) => {
    if (frozenResults === null && state.status === "success") setFrozenResults(filtered);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setFrozenResults(null);
      return next;
    });
  };
  const runBatch = async (action: () => Promise<void>) => {
    setBatchBusy(true);
    try {
      await action();
      clearSelection();
      const normalized = query.trim();
      setState(normalized ? { status: "success", results: await appContainer.noteService.searchNoteResults(normalized) } : { status: "idle" });
    } catch (error) {
      Alert.alert("Unable to update selected notes", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBatchBusy(false);
    }
  };
  const togglePinned = async (result: NoteSearchResult) => {
    if (pinningNoteId !== null) return;
    const wasPinned = result.note.getIsPinned();
    setPinningNoteId(result.note.getId());
    try {
      await appContainer.noteService.setNotePinned(result.note.getId(), !wasPinned);
      const normalized = query.trim();
      setState(normalized ? { status: "success", results: await appContainer.noteService.searchNoteResults(normalized) } : { status: "idle" });
    } catch {
      Alert.alert(wasPinned ? "Unable to unpin note" : "Unable to pin note", "Please try again.");
    } finally {
      setPinningNoteId(null);
    }
  };

  const openResult = (result: NoteSearchResult) => {
    if (result.conversationId) {
      router.push({ pathname: "/ask-ai", params: { conversationId: result.conversationId } });
      return;
    }
    const section = result.source === "Knowledge" ? "knowledge" : result.source === "Structured Note" ? "insights" : "transcript";
    router.push({ pathname: "/notes/[noteId]", params: { noteId: result.note.getId(), section, insightSection: result.insightSection, knowledgeResultId: result.knowledgeResultId } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Search notes" }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss} contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxl + insets.bottom }]}>
        <TextInput
          autoFocus
          editable={frozenResults === null}
          accessibilityLabel="Search notes"
          value={query}
          onChangeText={setQuery}
          placeholder="Search all note content"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          blurOnSubmit
          onSubmitEditing={Keyboard.dismiss}
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        />
        <CategoryFilter value={category} onChange={frozenResults === null ? setCategory : () => undefined} />
        {frozenResults !== null && (
          <NoteSelectionToolbar
            selectedNotes={selectedNotes}
            allVisibleSelected={selectedIds.size === filtered.length}
            workspaces={workspaces}
            busy={batchBusy}
            onToggleAll={() => {
              if (selectedIds.size === filtered.length) clearSelection();
              else setSelectedIds(new Set(filtered.map((result) => result.note.getId())));
            }}
            onCancel={clearSelection}
            onMove={(workspaceId) => runBatch(() => appContainer.noteService.moveNotes([...selectedIds], workspaceId))}
            onTrash={() => runBatch(async () => {
              const ids = [...selectedIds];
              await appContainer.noteService.trashNotes(ids);
              showTrashUndo({
                message: `${ids.length} notes moved to Trash`,
                undo: async () => {
                  await appContainer.noteService.restoreNotes(ids);
                  const normalized = query.trim();
                  setState(normalized ? { status: "success", results: await appContainer.noteService.searchNoteResults(normalized) } : { status: "idle" });
                },
              });
            })}
            onPin={(pinned) => runBatch(() => appContainer.noteService.setNotesPinned([...selectedIds], pinned))}
            onAskAi={() => {
              const noteIds = [...selectedIds].sort().join(",");
              clearSelection();
              router.push({ pathname: "/ask-ai", params: { noteIds } } as unknown as Href);
            }}
          />
        )}
        {state.status === "idle" && <EmptyState title="Search your notes" description="Search titles, transcripts, categories, Structured Notes, Knowledge results, and linked Ask AI conversations." />}
        {state.status === "loading" && <LoadingState />}
        {state.status === "error" && <ErrorState message={state.message} onRetry={() => setQuery((value) => `${value} `)} />}
        {state.status === "success" && filtered.length === 0 && <EmptyState title="No notes found" description={`No active note matches “${query.trim()}”.`} />}
        {filtered.length > 0 && <View style={styles.list}>
          <Text style={[styles.count, { color: colors.textMuted }]}>{filtered.length} {filtered.length === 1 ? "result" : "results"}</Text>
          {filtered.map((result) => (
            <NoteCard
              key={result.note.getId()}
              note={result.note}
              match={{ source: result.source, excerpt: result.excerpt, query: query.trim(), resourceTitle: result.resourceTitle }}
              selectionMode={frozenResults !== null}
              selected={selectedIds.has(result.note.getId())}
              isPinning={pinningNoteId === result.note.getId()}
              onPinPress={frozenResults === null ? () => void togglePinned(result) : undefined}
              onLongPress={() => toggle(result.note.getId())}
              onPress={() => frozenResults !== null ? toggle(result.note.getId()) : openResult(result)}
            />
          ))}
        </View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.lg, padding: Spacing.lg },
  input: { borderRadius: Radius.sm, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: Spacing.md },
  list: { gap: Spacing.md },
  count: { fontSize: 13, fontVariant: ["tabular-nums"] },
});
