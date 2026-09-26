import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet } from "react-native";

import { Colors, Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function OnboardingModelBackButton() {
  const { fromGuide, guideReplay } = useLocalSearchParams<{
    fromGuide?: string;
    guideReplay?: string;
  }>();
  const router = useRouter();
  const colors = Colors[useTheme().mode];

  if (fromGuide !== "1") return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Getting Started"
      onPress={() => {
        router.replace(
          `/getting-started?step=2${guideReplay === "1" ? "&replay=1" : ""}` as Href,
        );
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.accentSoft, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView name="chevron.left" size={20} tintColor={colors.accent} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderCurve: "continuous",
    borderRadius: Radius.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  pressed: { opacity: 0.65 },
});
