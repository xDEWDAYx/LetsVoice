import { ActivityIndicator, StyleSheet, View } from "react-native";

import { Colors, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function LoadingState() {
  const theme = useTheme();
  const colors = Colors[theme.mode];

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl,
  },
});
