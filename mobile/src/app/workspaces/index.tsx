import { UiTextInput as TextInput } from "@/components/ui-text-input";
import { UiText as Text } from "@/components/ui-text";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Keyboard, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { ModalCloseButton } from "@/components/modal-close-button";
import { SafeAreaModal } from "@/components/safe-area-modal";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { WorkspaceCard } from "@/components/workspace-card";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { ValidationError } from "@/errors/validation-error";
import { useTheme } from "@/hooks/use-theme";
import type { WorkspaceNameSuggestion } from "@/services/workspace-name-suggestion";

type WorkspaceListItem = Awaited<ReturnType<typeof appContainer.workspaceService.getWorkspaces>>[number];

type WorkspaceListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "success";
      workspaces: Awaited<
        ReturnType<typeof appContainer.workspaceService.getWorkspaces>
      >;
      suggestion: WorkspaceNameSuggestion | null;
    };

export function WorkspaceListScreen({
  embeddedInLibrary = false,
  embeddedInTab = false,
}: {
  embeddedInLibrary?: boolean;
  embeddedInTab?: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const { workspaceService } = appContainer;
  const [state, setState] = useState<WorkspaceListState>({
    status: "loading",
  });
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);
  const [hideSuggestion, setHideSuggestion] = useState(false);
  const [workspaceQuery, setWorkspaceQuery] = useState("");

  const normalizedWorkspaceQuery = workspaceQuery.trim().toLocaleLowerCase("en");
  const filteredWorkspaces = useMemo(
    () => state.status === "success"
      ? state.workspaces.filter((workspace) => workspace.getName().toLocaleLowerCase("en").includes(normalizedWorkspaceQuery))
      : [],
    [normalizedWorkspaceQuery, state],
  );

  const loadWorkspaces = async () => {
    setState({ status: "loading" });

    try {
      const [workspaces, suggestion] = await Promise.all([
        workspaceService.getWorkspaces(),
        workspaceService.getWorkspaceNameSuggestion(),
      ]);
      setState({
        status: "success",
        workspaces,
        suggestion,
      });
    } catch {
      setState({ status: "error", message: "Unable to load workspaces." });
    }
  };

  const applySuggestion = (suggestion: WorkspaceNameSuggestion) => {
    if (suggestion.action === "create") {
      setName(suggestion.name);
      setFormError(null);
      setIsModalVisible(true);
      return;
    }
    if (!suggestion.workspaceId) return;
    Alert.alert(
      `Rename to ${suggestion.name}?`,
      "Only the workspace name will change. Notes will not be moved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Rename",
          onPress: () => {
            setIsApplyingSuggestion(true);
            void workspaceService.renameWorkspace(suggestion.workspaceId!, suggestion.name)
              .then(async () => {
                setHideSuggestion(true);
                await loadWorkspaces();
              })
              .catch(() => Alert.alert("Unable to rename workspace", "Please try again."))
              .finally(() => setIsApplyingSuggestion(false));
          },
        },
      ],
    );
  };

  useFocusEffect(
    useCallback(() => {
      void loadWorkspaces();
    }, []),
  );

  const createWorkspace = async () => {
    setFormError(null);
    setIsSaving(true);

    try {
      await workspaceService.createWorkspace(name);
      setName("");
      setIsModalVisible(false);
      await loadWorkspaces();
    } catch (caughtError) {
      setFormError(
        caughtError instanceof ValidationError
          ? caughtError.message
          : "Unable to create workspace.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const closeCreateWorkspace = () => {
    if (isSaving) return;
    Keyboard.dismiss();
    setIsModalVisible(false);
  };

  const openCreateWorkspace = () => {
    setFormError(null);
    setIsModalVisible(true);
  };

  const showSuggestion = state.status === "success"
    && normalizedWorkspaceQuery.length === 0
    && state.suggestion !== null
    && !hideSuggestion;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {!embeddedInTab && !embeddedInLibrary && <Stack.Screen options={{ title: "Workspaces" }} />}
      <View
        style={[
          styles.fixedHeader,
          {
            borderColor: colors.border,
            paddingTop: embeddedInTab ? insets.top + Spacing.md : Spacing.lg,
          },
          embeddedInLibrary && styles.libraryHeader,
        ]}
      >
        {embeddedInTab && (
          <View style={styles.heading}>
            <Text style={[styles.title, { color: colors.text }]}>Workspaces</Text>
            <Text style={[styles.workspaceSubtitle, { color: colors.textMuted }]}>Browse and organize your saved notes.</Text>
          </View>
        )}
        <View style={styles.headingActions}>
          <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SymbolView name="magnifyingglass" size={17} tintColor={colors.textMuted} weight="semibold" />
            <TextInput
              accessibilityLabel="Search workspaces by name"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setWorkspaceQuery}
              placeholder="Search workspaces"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.text }]}
              value={workspaceQuery}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New workspace"
            hitSlop={6}
            onPress={openCreateWorkspace}
            style={({ pressed }) => [
              styles.newWorkspaceButton,
              { backgroundColor: colors.accent },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView name="plus" size={20} tintColor={colors.surface} weight="bold" />
          </Pressable>
        </View>
      </View>

      <FlatList<WorkspaceListItem>
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Spacing.xxl + insets.bottom },
          filteredWorkspaces.length === 0 && styles.emptyListContent,
        ]}
        contentInsetAdjustmentBehavior="automatic"
        data={filteredWorkspaces}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(workspace) => workspace.getId()}
        ListEmptyComponent={state.status === "loading"
          ? <LoadingState />
          : state.status === "error"
            ? <ErrorState message={state.message} onRetry={() => void loadWorkspaces()} />
            : <EmptyState title={state.workspaces.length === 0 ? "No workspaces yet" : "No matching workspaces"} />}
        ListHeaderComponent={showSuggestion ? (
          <View style={[styles.suggestionCard, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
            <View style={styles.suggestionCopy}>
              <Text style={[styles.suggestionKicker, { color: colors.accent }]}>ORGANISATION SUGGESTION</Text>
              <Text style={[styles.suggestionTitle, { color: colors.text }]}>{state.status === "success" ? state.suggestion?.name : ""}</Text>
              <Text style={[styles.suggestionReason, { color: colors.textMuted }]}>{state.status === "success" ? state.suggestion?.reason : ""}</Text>
              <Text style={[styles.suggestionPrivacy, { color: colors.textMuted }]}>Calculated locally with fixed rules. Nothing is moved automatically.</Text>
            </View>
            <View style={styles.suggestionActions}>
              {isApplyingSuggestion && <ActivityIndicator accessibilityLabel="Applying workspace suggestion" color={colors.accent} />}
              <AppButton
                label={state.status === "success" && state.suggestion?.action === "rename" ? "Review rename" : "Use suggestion"}
                variant="secondary"
                disabled={isApplyingSuggestion}
                onPress={() => {
                  if (state.status === "success" && state.suggestion) applySuggestion(state.suggestion);
                }}
              />
              <AppButton label="Dismiss" variant="quiet" disabled={isApplyingSuggestion} onPress={() => setHideSuggestion(true)} />
            </View>
          </View>
        ) : null}
        renderItem={({ item: workspace }) => (
          <WorkspaceCard
            workspace={workspace}
            onPress={() =>
              router.push({
                pathname: "/workspaces/[workspaceId]",
                params: { workspaceId: workspace.getId() },
              })
            }
          />
        )}
        showsVerticalScrollIndicator
        style={styles.listScroller}
      />

      <SafeAreaModal
        androidPresentation="center"
        dismissDisabled={isSaving}
        visible={isModalVisible}
        onRequestClose={closeCreateWorkspace}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>New workspace</Text>
          <ModalCloseButton disabled={isSaving} onPress={closeCreateWorkspace} tintColor={colors.textMuted} />
        </View>
        <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
        <TextInput
          placeholder="e.g. Personal"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text },
          ]}
        />
        {formError && (
          <Text style={[styles.formError, { color: colors.danger }]}>{formError}</Text>
        )}
        <AppButton
          label={isSaving ? "Creating..." : "Create workspace"}
          disabled={isSaving}
          onPress={() => void createWorkspace()}
        />
      </SafeAreaModal>
    </View>
  );
}

export default function WorkspacesScreen() {
  return <WorkspaceListScreen />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fixedHeader: { borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.lg, paddingBottom: Spacing.md, paddingHorizontal: Spacing.lg },
  libraryHeader: { paddingTop: Spacing.md },
  heading: { gap: Spacing.xs },
  headingActions: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, width: "100%" },
  searchField: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flex: 1, flexDirection: "row", gap: Spacing.sm, minHeight: 46, paddingHorizontal: Spacing.sm },
  searchInput: { flex: 1, fontSize: 15, minWidth: 0, paddingVertical: 0 },
  newWorkspaceButton: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, height: 44, justifyContent: "center", width: 44 },
  listScroller: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  emptyListContent: { flexGrow: 1 },
  listSeparator: { height: Spacing.md },
  pressed: { opacity: 0.72 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 34, fontWeight: "800" },
  workspaceSubtitle: { fontSize: 14, lineHeight: 20 },
  suggestionCard: { borderRadius: Radius.md, borderWidth: 1, gap: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md },
  suggestionCopy: { flex: 1, gap: Spacing.xs },
  suggestionKicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  suggestionTitle: { fontSize: 20, fontWeight: "800" },
  suggestionReason: { fontSize: 14, lineHeight: 20 },
  suggestionPrivacy: { fontSize: 12, lineHeight: 17 },
  suggestionActions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
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
  formError: { fontSize: 14 },
});
