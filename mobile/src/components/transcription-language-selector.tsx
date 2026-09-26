import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { UiText as Text } from "@/components/ui-text";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  TRANSCRIPTION_LANGUAGES,
  type TranscriptionLanguage,
} from "@/services/transcription-language";

type Props = {
  value: TranscriptionLanguage;
  disabled?: boolean;
  englishOnly?: boolean;
  onChange: (language: TranscriptionLanguage) => void;
};

export function TranscriptionLanguageSelector({
  value,
  disabled = false,
  englishOnly = false,
  onChange,
}: Props) {
  const colors = Colors[useTheme().mode];
  const languages = englishOnly
    ? TRANSCRIPTION_LANGUAGES.filter(({ code }) => code === "en")
    : TRANSCRIPTION_LANGUAGES;

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={[styles.label, { color: colors.text }]}>Speech language</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {englishOnly
            ? "The active Parakeet model recognizes English only."
            : "Choose a language for better short-recording accuracy, or use Auto."}
        </Text>
      </View>
      <ScrollView
        horizontal
        contentContainerStyle={styles.options}
        showsHorizontalScrollIndicator={false}
      >
        {languages.map(({ code, label }) => {
          const selected = value === code || (englishOnly && code === "en");
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              onPress={() => onChange(code)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected
                    ? colors.accentSoft
                    : colors.background,
                  borderColor: selected ? colors.accent : colors.border,
                },
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.optionLabel,
                  { color: selected ? colors.accent : colors.text },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  heading: { gap: 2 },
  label: { fontSize: 14, fontWeight: "800" },
  hint: { fontSize: 12, lineHeight: 17 },
  options: { gap: Spacing.xs, paddingRight: Spacing.sm },
  option: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  optionLabel: { fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.58 },
});
