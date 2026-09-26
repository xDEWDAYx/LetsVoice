import { UiText as Text } from "@/components/ui-text";
import { Pressable, StyleSheet, type PressableProps } from "react-native";

import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type AppButtonProps = Omit<PressableProps, "style"> & {
  label: string;
  variant?: "primary" | "secondary" | "quiet" | "destructive";
};

export function AppButton({
  label,
  variant = "primary",
  disabled,
  hitSlop,
  ...props
}: AppButtonProps) {
  const theme = useTheme();
  const colors = Colors[theme.mode];

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={hitSlop ?? 4}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && {
          backgroundColor: colors.accent,
          experimental_backgroundImage: "linear-gradient(180deg, #477F78 0%, #356F68 100%)",
        },
        variant === "secondary" && {
          backgroundColor: colors.accentSoft,
          borderColor: colors.border,
          borderWidth: 1,
        },
        variant === "quiet" && styles.quiet,
        variant === "destructive" && { backgroundColor: colors.danger },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: variant === "primary" || variant === "destructive" ? colors.surface : colors.accent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: Shadows.card,
  },
  quiet: {
    paddingHorizontal: Spacing.sm,
    boxShadow: "none",
  },
  label: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.45,
  },
});
