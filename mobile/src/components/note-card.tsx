import { UiText as Text } from "@/components/ui-text";
import { Pressable, StyleSheet, View } from "react-native";

import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import { Note } from "@/domain/note/note";
import { useTheme } from "@/hooks/use-theme";
import { formatDate } from "@/utils/format-date";
import { NOTE_CATEGORY_LABELS } from "@/constants/note-categories";
import type { NoteMatchSource } from "@/services/note-fuzzy-search";

type NoteCardProps = {
  note: Note;
  onPress: () => void;
  onPinPress?: () => void;
  isPinning?: boolean;
  onLongPress?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  match?: { source: NoteMatchSource; excerpt: string; query?: string; resourceTitle?: string };
};

export function NoteCard({
  note,
  onPress,
  onPinPress,
  isPinning = false,
  onLongPress,
  selected = false,
  selectionMode = false,
  match,
}: NoteCardProps) {
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const title = note.getName() || "Untitled note";
  const preview = note.getTranscript().replace(/\s+/g, " ").trim();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityActions={onLongPress ? [{ name: "longpress", label: "Select note" }] : undefined}
        onPress={onPress}
        onLongPress={onLongPress}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "longpress") onLongPress?.();
        }}
        delayLongPress={350}
        accessibilityState={{ selected: selectionMode ? selected : undefined }}
        style={({ pressed }) => [
          styles.content,
          (onPinPress || note.getIsPinned()) && styles.contentWithPin,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.header}>
          {selectionMode && (
            <View style={[styles.selection, { backgroundColor: selected ? colors.accent : "transparent", borderColor: selected ? colors.accent : colors.border }]}>
              {selected && <Text style={styles.check}>✓</Text>}
            </View>
          )}
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={[styles.categoryBadge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.categoryText, { color: colors.accent }]}>{NOTE_CATEGORY_LABELS[note.getCategory()]}</Text>
          </View>
          {match && (
            <Text numberOfLines={1} style={[styles.matchSource, { color: colors.textMuted }]}>
              {match.resourceTitle ? `${match.source} · ${match.resourceTitle}` : match.source}
            </Text>
          )}
        </View>
        <HighlightedPreview
          text={match?.excerpt || preview}
          query={match?.query}
          color={colors.textMuted}
          highlightColor={colors.accent}
        />
        <View style={styles.footer}>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {formatDate(note.getUpdatedAt())}
          </Text>
          {note.getAudioRelativePath() && (
            <Text style={[styles.meta, { color: colors.accent }]}>
              Audio available
            </Text>
          )}
        </View>
      </Pressable>
      {onPinPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={note.getIsPinned() ? "Unpin note" : "Pin note"}
          accessibilityState={{ busy: isPinning, disabled: isPinning }}
          disabled={isPinning}
          hitSlop={8}
          onPress={onPinPress}
          style={({ pressed }) => [
            styles.pinButton,
            { borderColor: colors.border },
            pressed && styles.pressed,
            isPinning && styles.disabled,
          ]}
        >
          <Text style={[styles.pinIcon, { color: colors.accent }]}>
            {isPinning ? "…" : note.getIsPinned() ? "★" : "☆"}
          </Text>
        </Pressable>
      ) : note.getIsPinned() ? (
        <Text accessibilityLabel="Pinned note" style={[styles.pinBadge, styles.pinIcon, { color: colors.accent }]}>
          ★
        </Text>
      ) : null}
    </View>
  );
}

function HighlightedPreview({ text, query, color, highlightColor }: { text: string; query?: string; color: string; highlightColor: string }) {
  const needle = query?.trim();
  if (!needle) return <Text style={[styles.preview, { color }]} numberOfLines={3}>{text}</Text>;
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return <Text style={[styles.preview, { color }]} numberOfLines={3}>{text}</Text>;
  return (
    <Text style={[styles.preview, { color }]} numberOfLines={3}>
      {text.slice(0, index)}
      <Text style={{ color: highlightColor, fontWeight: "800" }}>{text.slice(index, index + needle.length)}</Text>
      {text.slice(index + needle.length)}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: "continuous",
    borderRadius: Radius.md,
    borderWidth: 1,
    boxShadow: Shadows.card,
    overflow: "hidden",
    position: "relative",
  },
  content: {
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  contentWithPin: {
    paddingRight: 58,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  selection: { alignItems: "center", borderRadius: 10, borderWidth: 1.5, height: 20, justifyContent: "center", width: 20 },
  check: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  badgeRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  categoryBadge: { borderCurve: "continuous", borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  categoryText: { fontSize: 11, fontWeight: "800" },
  matchSource: { flexShrink: 1, fontSize: 11, fontWeight: "700", minWidth: 0 },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    minWidth: 0,
  },
  pinIcon: { fontSize: 22, fontWeight: "700" },
  pinButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 0,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 36,
    position: "absolute",
    right: Spacing.md,
    top: Spacing.md,
  },
  pinBadge: {
    position: "absolute",
    right: Spacing.md,
    top: Spacing.md,
  },
  preview: {
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "space-between",
  },
  meta: {
    fontSize: 12,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
