import { UiText as Text } from "@/components/ui-text";
import { type Href, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Colors, Radius, Spacing } from "@/constants/theme";
import { useSpeechPlayback } from "@/hooks/use-speech-playback";
import { useTheme } from "@/hooks/use-theme";
import { useUiCopyTranslation } from "@/hooks/use-ui-copy-translation";
import type { TtsLanguageCode } from "@/services/tts-language";

export function SpeechPlaybackButton({
  speechId,
  label,
  text,
  requestedLanguage,
  compact = false,
}: {
  speechId: string;
  label: string;
  text: string;
  requestedLanguage?: TtsLanguageCode;
  compact?: boolean;
}) {
  const colors = Colors[useTheme().mode];
  const tr = useUiCopyTranslation();
  const router = useRouter();
  const { service, state } = useSpeechPlayback();
  const isActive = state.speechId === speechId;
  const disabled = !isActive && state.inferenceBusy;
  const buttonLabel = tr(isActive
    ? state.phase === "error"
      ? "Try again"
      : "Stop"
    : "Read aloud");
  const visibleLabel = compact && !isActive ? tr("Read") : buttonLabel;
  const isPreparing = isActive && state.phase === "preparing";
  const isPlaying = isActive && state.phase === "playing";

  return (
    <View style={[styles.wrapper, compact && styles.compactWrapper]}>
      <View style={[styles.actions, compact && styles.compactActions]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${buttonLabel}: ${label}`}
          accessibilityState={{ busy: isPreparing, disabled, selected: isPlaying }}
          disabled={disabled}
          onPress={() => void service.speak({ id: speechId, label, text, requestedLanguage })}
          style={({ pressed }) => [
            styles.button,
            compact && styles.compactButton,
            { backgroundColor: colors.accentSoft, borderColor: colors.border },
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {isPreparing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={[styles.glyph, { color: colors.accent }]}>{isActive && state.phase !== "error" ? "■" : "▶"}</Text>
          )}
          <Text numberOfLines={1} style={[styles.label, { color: colors.accent }]}>{visibleLabel}</Text>
        </Pressable>
        {isActive && state.phase !== "idle" && state.phase !== "error" && (
          <Text style={[styles.status, { color: colors.textMuted }]}>{state.message}</Text>
        )}
      </View>

      {isActive && state.phase === "error" && (
        <View style={styles.errorRow}>
          <Text selectable style={[styles.error, { color: colors.danger }]}>{state.message}</Text>
          {state.errorCode === "missing-model" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Text-to-Speech Models"
              onPress={() => router.push("/ai/tts-models" as Href)}
              style={({ pressed }) => [styles.modelsButton, pressed && styles.pressed]}
            >
              <Text style={[styles.modelsLink, { color: colors.accent }]}>Open Text-to-Speech Models</Text>
            </Pressable>
          )}
        </View>
      )}
      {!isActive && disabled && (
        <Text style={[styles.status, { color: colors.textMuted }]}>Available when the current local operation finishes.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.xs },
  compactWrapper: { flex: 1, minWidth: 0 },
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  compactActions: { flex: 1 },
  button: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 34, paddingHorizontal: Spacing.sm },
  compactButton: { flex: 1, justifyContent: "center", minHeight: 44, minWidth: 0, paddingHorizontal: Spacing.xs },
  glyph: { fontSize: 11, fontWeight: "900" },
  label: { fontSize: 12, fontWeight: "800" },
  status: { flexShrink: 1, fontSize: 11, lineHeight: 15 },
  errorRow: { alignItems: "flex-start", gap: 4 },
  error: { fontSize: 12, lineHeight: 17 },
  modelsButton: { alignItems: "center", alignSelf: "flex-start", justifyContent: "center", minHeight: 44 },
  modelsLink: { fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.65 },
});
