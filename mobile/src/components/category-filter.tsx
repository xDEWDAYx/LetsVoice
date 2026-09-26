import { ScrollView, Pressable, StyleSheet, Text } from "react-native";

import {
  NOTE_CATEGORY_KEYS,
  NOTE_CATEGORY_LABELS,
  type NoteCategory,
} from "@/constants/note-categories";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type CategoryFilterValue = "all" | NoteCategory;

export function CategoryFilter({
  value,
  onChange,
}: {
  value: CategoryFilterValue;
  onChange: (value: CategoryFilterValue) => void;
}) {
  const colors = Colors[useTheme().mode];
  const options: readonly CategoryFilterValue[] = ["all", ...NOTE_CATEGORY_KEYS];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.item,
              { backgroundColor: selected ? colors.accent : colors.surface, borderColor: selected ? colors.accent : colors.border },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, { color: selected ? "#FFFFFF" : colors.text }]}>
              {option === "all" ? "All" : NOTE_CATEGORY_LABELS[option]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.sm },
  item: { borderCurve: "continuous", borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  label: { fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.72 },
});
