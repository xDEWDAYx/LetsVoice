import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ModalCloseButton } from "@/components/modal-close-button";
import { SafeAreaModal } from "@/components/safe-area-modal";
import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import type { Note } from "@/domain/note/note";
import type { Workspace } from "@/domain/workspace/workspace";
import { useTheme } from "@/hooks/use-theme";

export function NoteSelectionToolbar({
  selectedNotes,
  allVisibleSelected,
  workspaces,
  busy,
  onToggleAll,
  onCancel,
  onMove,
  onTrash,
  onPin,
  onAskAi,
}: {
  selectedNotes: readonly Note[];
  allVisibleSelected: boolean;
  workspaces: readonly Workspace[];
  busy: boolean;
  onToggleAll: () => void;
  onCancel: () => void;
  onMove: (workspaceId: string) => Promise<void>;
  onTrash: () => Promise<void>;
  onPin: (pinned: boolean) => Promise<void>;
  onAskAi: () => void;
}) {
  const colors = Colors[useTheme().mode];
  const [moveVisible, setMoveVisible] = useState(false);
  const allPinned = selectedNotes.length > 0 && selectedNotes.every((note) => note.getIsPinned());
  const allSameWorkspace = selectedNotes.length > 0 && selectedNotes.every((note) => note.getWorkspaceId() === selectedNotes[0].getWorkspaceId());

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <Text style={[styles.count, { color: colors.text }]}>{selectedNotes.length} selected</Text>
        <View style={styles.headingActions}>
          <Pressable disabled={busy} onPress={onToggleAll}><Text style={[styles.link, { color: colors.accent }]}>{allVisibleSelected ? "Deselect All" : "Select All"}</Text></Pressable>
          <Pressable disabled={busy} onPress={onCancel}><Text style={[styles.link, { color: colors.textMuted }]}>Cancel</Text></Pressable>
        </View>
      </View>
      <View style={styles.actions}>
        <ToolbarButton label="Move" disabled={busy || selectedNotes.length === 0} onPress={() => setMoveVisible(true)} />
        <ToolbarButton label="Trash" danger disabled={busy || selectedNotes.length === 0} onPress={() => void onTrash()} />
        <ToolbarButton label={allPinned ? "Unpin All" : "Pin All"} disabled={busy || selectedNotes.length === 0} onPress={() => void onPin(!allPinned)} />
        <ToolbarButton label="Ask AI" disabled={busy || selectedNotes.length === 0 || selectedNotes.length > 3} onPress={onAskAi} />
      </View>
      {selectedNotes.length > 3 && <Text style={[styles.hint, { color: colors.textMuted }]}>Select up to 3 notes for Ask AI</Text>}

      <SafeAreaModal dismissDisabled={busy} visible={moveVisible} onRequestClose={() => setMoveVisible(false)}>
        <View style={styles.heading}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Move selected notes</Text>
          <ModalCloseButton
            disabled={busy}
            onPress={() => setMoveVisible(false)}
            tintColor={colors.textMuted}
          />
        </View>
        {workspaces.map((workspace) => {
          const allAlreadyThere = allSameWorkspace && selectedNotes[0]?.getWorkspaceId() === workspace.getId();
          return (
            <Pressable
              key={workspace.getId()}
              disabled={busy || allAlreadyThere}
              onPress={() => void onMove(workspace.getId()).then(() => setMoveVisible(false))}
              style={({ pressed }) => [styles.destination, { backgroundColor: colors.background, borderColor: colors.border }, pressed && styles.pressed, allAlreadyThere && styles.disabled]}
            >
              <Text style={[styles.destinationName, { color: colors.text }]}>{workspace.getName()}</Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>{allAlreadyThere ? "Already here" : "Move"}</Text>
            </Pressable>
          );
        })}
      </SafeAreaModal>
    </View>
  );
}

function ToolbarButton({ label, onPress, disabled, danger = false }: { label: string; onPress: () => void; disabled: boolean; danger?: boolean }) {
  const colors = Colors[useTheme().mode];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { borderColor: colors.border }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, { color: danger ? colors.danger : colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, boxShadow: Shadows.card, gap: Spacing.sm, padding: Spacing.md },
  heading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  headingActions: { flexDirection: "row", gap: Spacing.md },
  count: { fontSize: 15, fontWeight: "800" },
  link: { fontSize: 13, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  button: { borderRadius: Radius.sm, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  buttonText: { fontSize: 13, fontWeight: "800" },
  hint: { fontSize: 12, lineHeight: 17 },
  modalTitle: { fontSize: 22, fontWeight: "800" },
  destination: { alignItems: "center", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 52, padding: Spacing.md },
  destinationName: { flex: 1, fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});
