import { UiText as Text } from "@/components/ui-text";
import { StyleSheet, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const theme = useTheme();
  const colors = Colors[theme.mode];

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <Text selectable style={[styles.message, { color: colors.danger }]}>
        {message}
      </Text>
      <AppButton label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
});
