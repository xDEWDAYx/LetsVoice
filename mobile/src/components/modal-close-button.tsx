import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet } from "react-native";

import { Radius } from "@/constants/theme";

type ModalCloseButtonProps = {
  disabled?: boolean;
  label?: string;
  onPress: () => void;
  tintColor: string;
};

export function ModalCloseButton({
  disabled = false,
  label = "Close",
  onPress,
  tintColor,
}: ModalCloseButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <SymbolView name="xmark" size={17} tintColor={tintColor} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: Radius.sm,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.62 },
});
