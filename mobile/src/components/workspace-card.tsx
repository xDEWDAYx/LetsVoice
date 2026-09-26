import { UiText as Text } from "@/components/ui-text";
import { Pressable, StyleSheet, View } from "react-native";

import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import { Workspace } from "@/domain/workspace/workspace";
import { useTheme } from "@/hooks/use-theme";
import { formatDate } from "@/utils/format-date";

type WorkspaceCardProps = {
  workspace: Workspace;
  onPress: () => void;
};

export function WorkspaceCard({ workspace, onPress }: WorkspaceCardProps) {
  const theme = useTheme();
  const colors = Colors[theme.mode];

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.marker, { backgroundColor: colors.accent }]} />
        <View style={styles.content}>
          <Text
            numberOfLines={1}
            style={[styles.name, { color: colors.text }]}
          >
            {workspace.getName()}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.meta, { color: colors.textMuted }]}
          >
            Updated {formatDate(workspace.getUpdatedAt())}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: "continuous",
    borderRadius: Radius.md,
    borderWidth: 1,
    boxShadow: Shadows.card,
    padding: Spacing.md,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
  },
  marker: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
  },
  meta: {
    fontSize: 13,
  },
  chevron: {
    flexShrink: 0,
    fontSize: 26,
    lineHeight: 26,
  },
  pressed: {
    opacity: 0.72,
  },
});
