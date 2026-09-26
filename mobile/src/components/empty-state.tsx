import { UiText as Text } from "@/components/ui-text";
import { StyleSheet, View } from "react-native";

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const theme = useTheme();
  const colors = Colors[theme.mode];

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceMuted }]}>
      <Text style={[styles.title, { color: colors.textMuted }]}>{title}</Text>
      {description && (
        <Text selectable style={[styles.description, { color: colors.textMuted }]}>
          {description}
        </Text>
      )}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    borderRadius: Radius.md,
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
  },
  description: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
