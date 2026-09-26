import { SymbolView } from "expo-symbols";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { TrashFilter, TrashItem, TrashKind } from "@/services/trash-service";
import { formatDate } from "@/utils/format-date";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; items: TrashItem[] };

const FILTERS: readonly { value: TrashFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "note", label: "Notes" },
  { value: "workspace", label: "Workspaces" },
  { value: "conversation", label: "Ask AI" },
  { value: "template", label: "Templates" },
];

const KIND_LABELS: Record<TrashKind, string> = {
  note: "Note",
  workspace: "Workspace",
  conversation: "Ask AI",
  template: "Template",
};

export default function TrashScreen() {
  const colors = Colors[useTheme().mode];
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ status: "loading" });
  const [filter, setFilter] = useState<TrashFilter>("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState({ status: "loading" });
      setState({ status: "success", items: await appContainer.trashService.list() });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load Trash." });
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const items = useMemo(() => {
    if (state.status !== "success") return [];
    const needle = query.trim().toLocaleLowerCase();
    return state.items.filter((item) =>
      (filter === "all" || item.kind === filter) &&
      (!needle || `${item.name} ${item.detail}`.toLocaleLowerCase().includes(needle)),
    );
  }, [filter, query, state]);

  const restore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await appContainer.trashService.restore(item.kind, item.id);
      await load();
    } catch (error) {
      Alert.alert("Unable to restore", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmPermanentDelete = async (item: TrashItem) => {
    const impact = await appContainer.trashService.getPermanentDeleteImpact(item.kind, item.id);
    const consequences = [
      impact.noteCount > 0 ? `${impact.noteCount} ${impact.noteCount === 1 ? "note" : "notes"}` : null,
      impact.conversationCount > 0
        ? `${impact.conversationCount} linked Ask AI ${impact.conversationCount === 1 ? "conversation" : "conversations"}`
        : null,
    ].filter(Boolean).join(" and ");
    Alert.alert(
      `Permanently delete ${item.name}?`,
      `${consequences ? `This also permanently deletes ${consequences}. ` : ""}This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Permanently",
          style: "destructive",
          onPress: () => {
            setBusyId(item.id);
            void appContainer.trashService.permanentlyDelete(item.kind, item.id).then(
              load,
              (error: unknown) => Alert.alert("Unable to delete", error instanceof Error ? error.message : "Please try again."),
            ).finally(() => setBusyId(null));
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Trash" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxl + insets.bottom }]}
      >
        <TextInput
          accessibilityLabel="Search Trash"
          value={query}
          onChangeText={setQuery}
          placeholder="Search Trash"
          placeholderTextColor={colors.textMuted}
          style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((option) => {
            const selected = filter === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(option.value)}
                style={({ pressed }) => [
                  styles.filter,
                  { backgroundColor: selected ? colors.accent : colors.surface, borderColor: selected ? colors.accent : colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterText, { color: selected ? "#FFFFFF" : colors.text }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {state.status === "loading" && <LoadingState />}
        {state.status === "error" && <ErrorState message={state.message} onRetry={() => void load()} />}
        {state.status === "success" && items.length === 0 && (
          <EmptyState title="Trash is empty" description="Deleted notes, workspaces, Ask AI conversations, and custom templates appear here." />
        )}
        {items.map((item) => (
          <View key={`${item.kind}:${item.id}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeading}>
              <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
                <SymbolView name="trash" size={20} tintColor={colors.textMuted} />
              </View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.detail, { color: colors.textMuted }]}>{KIND_LABELS[item.kind]} · {item.detail}</Text>
                <Text style={[styles.date, { color: colors.textMuted }]}>{formatDate(item.trashedAt)}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={busyId !== null}
                onPress={() => void restore(item)}
                style={({ pressed }) => [styles.action, { borderColor: colors.border }, pressed && styles.pressed]}
              >
                <Text style={[styles.actionText, { color: colors.accent }]}>Restore</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busyId !== null}
                onPress={() => void confirmPermanentDelete(item)}
                style={({ pressed }) => [styles.action, { borderColor: colors.border }, pressed && styles.pressed]}
              >
                <Text style={[styles.actionText, { color: colors.danger }]}>Delete Permanently</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.md, padding: Spacing.lg },
  search: { borderRadius: Radius.sm, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: Spacing.md },
  filters: { gap: Spacing.sm },
  filter: { borderCurve: "continuous", borderRadius: 18, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  filterText: { fontSize: 13, fontWeight: "700" },
  card: { borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, boxShadow: Shadows.card, gap: Spacing.md, padding: Spacing.md },
  cardHeading: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  icon: { alignItems: "center", borderRadius: Radius.sm, height: 42, justifyContent: "center", width: 42 },
  copy: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: "800" },
  detail: { fontSize: 13 },
  date: { fontSize: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  action: { borderRadius: Radius.sm, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  actionText: { fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.7 },
});
