import { Host, Picker, Text as NativeText } from "@expo/ui/swift-ui";
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { NoteCard } from "@/components/note-card";
import { UiText as Text } from "@/components/ui-text";
import { UiTextInput as TextInput } from "@/components/ui-text-input";
import { NOTE_CATEGORY_KEYS, NOTE_CATEGORY_LABELS, type NoteCategory } from "@/constants/note-categories";
import { Colors, Radius, Spacing } from "@/constants/theme";
import type { CoreTask } from "@/domain/core-note-insight/core-note-insight";
import type { Note } from "@/domain/note/note";
import { useTheme } from "@/hooks/use-theme";
import {
  noteSearchDestinationKey,
  uniqueNoteSearchDestinations,
  type NoteSearchResult,
} from "@/services/note-fuzzy-search";

type NoteFilter = "all" | "pinned" | "todos";
type CategoryFilterValue = "all" | NoteCategory;
type FilterOption<T extends string> = { value: T; label: string };

type LibraryNotesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; notes: Note[]; tasks: CoreTask[]; loadedAt: number };

type NoteSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; results: NoteSearchResult[] };

type NoteListItem = { note: Note; match?: NoteSearchResult };

const NOTE_RESULT_BATCH_SIZE = 20;
const NOTE_FILTER_OPTIONS: readonly FilterOption<NoteFilter>[] = [
  { value: "all", label: "All Notes" },
  { value: "pinned", label: "Pinned" },
  { value: "todos", label: "Open Tasks" },
];
const CATEGORY_FILTER_OPTIONS: readonly FilterOption<CategoryFilterValue>[] = [
  { value: "all", label: "All Category" },
  ...NOTE_CATEGORY_KEYS.map((value) => ({ value, label: NOTE_CATEGORY_LABELS[value] })),
];

export function LibraryNotesPane() {
  const router = useRouter();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LibraryNotesState>({ status: "loading" });
  const [noteFilter, setNoteFilter] = useState<NoteFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>("all");
  const [noteQuery, setNoteQuery] = useState("");
  const [noteSearch, setNoteSearch] = useState<NoteSearchState>({ status: "idle" });
  const [searchRevision, setSearchRevision] = useState(0);
  const [noteResultLimit, setNoteResultLimit] = useState(NOTE_RESULT_BATCH_SIZE);
  const [pinningNoteId, setPinningNoteId] = useState<string | null>(null);
  const normalizedNoteQuery = noteQuery.trim();

  const loadNotes = useCallback(async () => {
    try {
      const [notes, insightItems] = await Promise.all([
        appContainer.noteService.getAllNotes(),
        appContainer.coreNoteInsightService.getDashboardItems(),
      ]);
      setState({ status: "success", notes, ...insightItems, loadedAt: Date.now() });
    } catch {
      setState({ status: "error", message: "Unable to load your notes." });
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadNotes(); }, [loadNotes]));

  useEffect(
    () => appContainer.noteService.subscribeToCategoryChanges(() => {
      appContainer.noteService.invalidateSearchIndex();
      void loadNotes();
    }),
    [loadNotes],
  );

  useEffect(
    () => appContainer.noteService.subscribeToChanges(() => { void loadNotes(); }),
    [loadNotes],
  );

  useEffect(
    () => appContainer.coreNoteInsightService.subscribeToChanges(() => {
      appContainer.noteService.invalidateSearchIndex();
      void loadNotes();
    }),
    [loadNotes],
  );

  useEffect(
    () => appContainer.knowledgeService.subscribeToChanges(() => {
      appContainer.noteService.invalidateSearchIndex();
      setSearchRevision((value) => value + 1);
    }),
    [],
  );

  useEffect(
    () => appContainer.aiConversationService.subscribeToChanges(() => {
      appContainer.noteService.invalidateSearchIndex();
      setSearchRevision((value) => value + 1);
    }),
    [],
  );

  const loadedAt = state.status === "success" ? state.loadedAt : 0;

  useEffect(() => {
    const normalized = noteQuery.trim();
    if (!normalized) {
      setNoteSearch({ status: "idle" });
      return;
    }

    let active = true;
    setNoteSearch({ status: "loading" });
    const timer = setTimeout(() => {
      void appContainer.noteService.searchNoteResourceResults(normalized).then(
        (results) => active && setNoteSearch({ status: "success", results }),
        () => active && setNoteSearch({ status: "error" }),
      );
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [loadedAt, noteQuery, searchRevision]);

  useEffect(() => {
    setNoteResultLimit(NOTE_RESULT_BATCH_SIZE);
  }, [categoryFilter, loadedAt, normalizedNoteQuery, noteFilter, searchRevision]);

  const filteredNotes = useMemo(() => {
    if (state.status !== "success") return [];
    const pendingNoteIds = new Set(
      state.tasks
        .filter((task) => task.status === "pending")
        .map((task) => task.sourceNoteId),
    );
    return state.notes.filter((note) =>
      (noteFilter === "pinned"
        ? note.getIsPinned()
        : noteFilter === "todos"
          ? pendingNoteIds.has(note.getId())
          : true)
      && (categoryFilter === "all" || note.getCategory() === categoryFilter),
    );
  }, [categoryFilter, noteFilter, state]);

  const visibleNoteResults = useMemo<NoteListItem[]>(() => {
    if (!normalizedNoteQuery) return filteredNotes.map((note) => ({ note }));
    if (noteSearch.status !== "success") return [];
    const allowedIds = new Set(filteredNotes.map((note) => note.getId()));
    return uniqueNoteSearchDestinations(
      noteSearch.results.filter((result) => allowedIds.has(result.note.getId())),
    ).map((match) => ({ note: match.note, match }));
  }, [filteredNotes, normalizedNoteQuery, noteSearch]);

  const renderedNoteResults = visibleNoteResults.slice(0, noteResultLimit);

  const noteResultKey = (result: NoteListItem) => result.match
    ? noteSearchDestinationKey(result.match)
    : `note:${result.note.getId()}`;

  const openNoteResult = (result: NoteListItem) => {
    if (result.match?.conversationId) {
      router.push({ pathname: "/ask-ai", params: { conversationId: result.match.conversationId } });
      return;
    }
    const section = result.match?.source === "Knowledge"
      ? "knowledge"
      : result.match?.source === "Structured Note"
        ? "insights"
        : "transcript";
    router.push({
      pathname: "/notes/[noteId]",
      params: {
        noteId: result.note.getId(),
        section,
        insightSection: result.match?.insightSection,
        knowledgeResultId: result.match?.knowledgeResultId,
      },
    });
  };

  const togglePinned = async (note: Note) => {
    setPinningNoteId(note.getId());
    try {
      await appContainer.noteService.setNotePinned(note.getId(), !note.getIsPinned());
      await loadNotes();
    } catch {
      Alert.alert(
        note.getIsPinned() ? "Unable to unpin note" : "Unable to pin note",
        "Please try again.",
      );
    } finally {
      setPinningNoteId(null);
    }
  };

  const emptyContent = () => {
    if (state.status === "loading") return <LoadingState />;
    if (state.status === "error") {
      return <ErrorState message={state.message} onRetry={() => void loadNotes()} />;
    }
    if (normalizedNoteQuery && noteSearch.status === "loading") {
      return (
        <View accessibilityLiveRegion="polite" style={styles.searchStatus}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.searchStatusText, { color: colors.textMuted }]}>Searching all related content…</Text>
        </View>
      );
    }
    if (normalizedNoteQuery && noteSearch.status === "error") {
      return <ErrorState message="Unable to search notes." onRetry={() => setSearchRevision((value) => value + 1)} />;
    }
    return (
      <EmptyState
        title={normalizedNoteQuery ? "No matching notes" : noteFilter === "all" ? "No notes yet" : "No matching notes"}
        description={normalizedNoteQuery
          ? `No Note, Structured Note, Knowledge result, or Ask AI conversation matches “${normalizedNoteQuery}” with the current filters.`
          : noteFilter === "todos"
            ? "Notes with unfinished Core Note tasks appear here."
            : undefined}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.controls, { borderBottomColor: colors.border }]}>
        <View style={styles.resultHeading}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
          <Text selectable style={[styles.resultCount, { color: colors.textMuted }]}>
            {normalizedNoteQuery ? `${visibleNoteResults.length} matches` : `${filteredNotes.length} notes`}
          </Text>
        </View>

        <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Image accessibilityElementsHidden source="sf:magnifyingglass" style={styles.searchIcon} tintColor={colors.textMuted} />
          <TextInput
            accessibilityLabel="Search notes and related content"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setNoteQuery}
            onSubmitEditing={Keyboard.dismiss}
            placeholder="Search notes and related content"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
            value={noteQuery}
          />
          {noteQuery.length > 0 && (
            <Pressable
              accessibilityLabel="Clear note search"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setNoteQuery("")}
              style={({ pressed }) => [
                styles.clearSearch,
                { backgroundColor: colors.surfaceMuted },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.clearSearchText, { color: colors.textMuted }]}>×</Text>
            </Pressable>
          )}
        </View>

        <View accessibilityLabel="Note filters" style={styles.filterRow}>
          <Host
            colorScheme={theme.mode}
            matchContents
            seedColor={colors.accent}
          >
            <Picker
              label="Filter notes by status"
              modifiers={[
                pickerStyle("menu"),
                buttonStyle("bordered"),
                buttonBorderShape("capsule"),
                controlSize("small"),
              ]}
              onSelectionChange={setNoteFilter}
              selection={noteFilter}
              testID="library-note-scope-filter"
            >
              {NOTE_FILTER_OPTIONS.map((option) => (
                <NativeText key={option.value} modifiers={[tag(option.value)]}>
                  {option.label}
                </NativeText>
              ))}
            </Picker>
          </Host>

          <Host
            colorScheme={theme.mode}
            matchContents
            seedColor={colors.accent}
          >
            <Picker
              label="Filter notes by category"
              modifiers={[
                pickerStyle("menu"),
                buttonStyle("bordered"),
                buttonBorderShape("capsule"),
                controlSize("small"),
              ]}
              onSelectionChange={setCategoryFilter}
              selection={categoryFilter}
              testID="library-note-category-filter"
            >
              {CATEGORY_FILTER_OPTIONS.map((option) => (
                <NativeText key={option.value} modifiers={[tag(option.value)]}>
                  {option.label}
                </NativeText>
              ))}
            </Picker>
          </Host>
        </View>
      </View>

      <FlatList<NoteListItem>
        accessibilityLabel="Note results"
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing.xxl },
          renderedNoteResults.length === 0 && styles.emptyListContent,
        ]}
        data={renderedNoteResults}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={noteResultKey}
        ListEmptyComponent={emptyContent}
        ListFooterComponent={renderedNoteResults.length < visibleNoteResults.length
          ? <Text style={[styles.moreResults, { color: colors.textMuted }]}>{`${renderedNoteResults.length} of ${visibleNoteResults.length} loaded`}</Text>
          : null}
        onEndReached={() => setNoteResultLimit((current) => Math.min(current + NOTE_RESULT_BATCH_SIZE, visibleNoteResults.length))}
        onEndReachedThreshold={0.35}
        renderItem={({ item }) => (
          <NoteCard
            note={item.note}
            match={item.match
              ? {
                  source: item.match.source,
                  excerpt: item.match.excerpt,
                  query: normalizedNoteQuery,
                  resourceTitle: item.match.resourceTitle,
                }
              : undefined}
            isPinning={pinningNoteId === item.note.getId()}
            onPinPress={() => void togglePinned(item.note)}
            onPress={() => openNoteResult(item)}
          />
        )}
        showsVerticalScrollIndicator
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  controls: { borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.sm, paddingBottom: Spacing.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  resultHeading: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, justifyContent: "space-between" },
  sectionTitle: { fontSize: 20, fontWeight: "800" },
  resultCount: { fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "700" },
  searchField: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", minHeight: 46, paddingHorizontal: Spacing.sm },
  searchIcon: { height: 18, marginHorizontal: Spacing.xs, width: 18 },
  searchInput: { flex: 1, fontSize: 15, minHeight: 44, minWidth: 0, paddingHorizontal: Spacing.xs },
  clearSearch: { alignItems: "center", borderRadius: 14, height: 28, justifyContent: "center", width: 28 },
  clearSearchText: { fontSize: 20, fontWeight: "600", lineHeight: 22 },
  filterRow: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, minHeight: 38 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  emptyListContent: { flexGrow: 1 },
  listSeparator: { height: Spacing.md },
  moreResults: { fontSize: 12, fontWeight: "600", padding: Spacing.md, textAlign: "center" },
  searchStatus: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, justifyContent: "center", minHeight: 120 },
  searchStatusText: { fontSize: 13, fontWeight: "600" },
  pressed: { opacity: 0.72 },
});
