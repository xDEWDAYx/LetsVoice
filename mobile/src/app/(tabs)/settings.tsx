import { UiText as Text } from "@/components/ui-text";
import { SymbolView } from "expo-symbols";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { Backgrounds, Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useAppPreferences } from "@/providers/app-preferences-provider";
import type { ThemePreference } from "@/providers/theme-provider";
import { TEXT_SIZE_PREFERENCES, type TextSizePreference } from "@/services/app-preferences-service";

type SegmentOption<T extends string> = { value: T; label: string };

const APPEARANCE_OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const TEXT_SIZE_LABELS: Record<TextSizePreference, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
};
const TEXT_SIZE_OPTIONS: readonly SegmentOption<TextSizePreference>[] =
  TEXT_SIZE_PREFERENCES.map((value) => ({
    value,
    label: TEXT_SIZE_LABELS[value],
  }));
type ThemeColors = (typeof Colors)[keyof typeof Colors];

export default function SettingsScreen() {
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const preferences = useAppPreferences();
  const [error, setError] = useState<string | null>(null);
  const [savingAppearance, setSavingAppearance] = useState<ThemePreference | null>(null);
  const [savingTextSize, setSavingTextSize] = useState<TextSizePreference | null>(null);
  const [savingAutoSpeak, setSavingAutoSpeak] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationDenied, setNotificationDenied] = useState(false);

  const chooseAppearance = async (preference: ThemePreference) => {
    if (savingAppearance !== null || preference === theme.preference) return;
    setError(null);
    setSavingAppearance(preference);
    try {
      await theme.setPreference(preference);
    } catch {
      setError("Unable to save the appearance setting.");
    } finally {
      setSavingAppearance(null);
    }
  };

  const chooseTextSize = async (textSize: TextSizePreference) => {
    if (savingTextSize !== null || textSize === preferences.textSize) return;
    setError(null);
    setSavingTextSize(textSize);
    try {
      await preferences.setTextSize(textSize);
    } catch {
      setError("Unable to save the text size setting.");
    } finally {
      setSavingTextSize(null);
    }
  };

  const toggleAutoSpeak = async (enabled: boolean) => {
    if (savingAutoSpeak) return;
    setError(null);
    setSavingAutoSpeak(true);
    try {
      await preferences.setAutoSpeakAnswers(enabled);
    } catch {
      setError("Unable to save the spoken answers setting.");
    } finally {
      setSavingAutoSpeak(false);
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    if (savingNotifications) return;
    setError(null);
    setNotificationDenied(false);
    setSavingNotifications(true);
    try {
      const result = await appContainer.noteNotificationService.setEnabled(enabled);
      if (result === "denied") {
        setNotificationDenied(true);
        setError("Notification permission is off. You can enable it in iPhone Settings.");
      } else if (result === "unavailable") {
        setError("Task notifications are available on iPhone.");
      }
    } catch {
      setError("Unable to update task notifications.");
    } finally {
      setSavingNotifications(false);
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{
        backgroundColor: colors.background,
        experimental_backgroundImage: Backgrounds[theme.mode],
      }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 76 },
      ]}
    >
      <View style={styles.heading}>
        <Text style={[styles.kicker, { color: colors.accent }]}>SETTINGS</Text>
        <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Choose how LetsVoice looks on this iPhone.</Text>
      </View>

      <SettingsSegmentedControl
        accessibilityLabel="Appearance"
        busyValue={savingAppearance}
        colors={colors}
        disabled={savingAppearance !== null}
        onChange={(value) => void chooseAppearance(value)}
        options={APPEARANCE_OPTIONS}
        value={theme.preference}
      />

      <SectionHeading title="Text Size" detail="Adjust app text while keeping iPhone Dynamic Type available." colors={colors} />
      <SettingsSegmentedControl
        accessibilityLabel="Text Size"
        busyValue={savingTextSize}
        colors={colors}
        disabled={savingTextSize !== null}
        onChange={(value) => void chooseTextSize(value)}
        options={TEXT_SIZE_OPTIONS}
        value={preferences.textSize}
      />

      <SectionHeading title="AI & Notifications" detail="These preferences stay on this device." colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingSwitchRow
          label="Speak New AI Answers"
          detail="Automatically read only a newly completed Ask AI answer. Off by default."
          value={preferences.autoSpeakAnswers}
          busy={savingAutoSpeak}
          onValueChange={(value) => void toggleAutoSpeak(value)}
          colors={colors}
        />
        <SettingSwitchRow
          label="Task Notifications"
          detail="Schedule local alerts for dated open tasks."
          value={preferences.notificationsEnabled}
          busy={savingNotifications}
          onValueChange={(value) => void toggleNotifications(value)}
          colors={colors}
          divided
        />
      </View>
      {notificationDenied && (
        <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
          <Text style={[styles.settingsLink, { color: colors.accent }]}>Open iPhone Settings</Text>
        </Pressable>
      )}
      {error && <Text selectable style={[styles.error, { color: colors.danger }]}>{error}</Text>}

      <SectionHeading title="Help" colors={colors} />
      <NavigationCard
        icon="questionmark.circle"
        label="Getting Started"
        detail="Review privacy, capture, and local model setup."
        onPress={() => router.push({ pathname: "/getting-started", params: { replay: "1" } } as unknown as Href)}
        colors={colors}
      />

      <SectionHeading title="Data" colors={colors} />
      <NavigationCard
        icon="trash"
        label="Trash"
        detail="Restore or permanently delete removed items."
        onPress={() => router.push("/trash" as Href)}
        colors={colors}
      />
    </ScrollView>
  );
}

function SectionHeading({ title, detail, colors }: { title: string; detail?: string; colors: ThemeColors }) {
  return (
    <View style={styles.heading}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {detail && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{detail}</Text>}
    </View>
  );
}

function SettingsSegmentedControl<T extends string>({
  accessibilityLabel,
  busyValue,
  colors,
  disabled,
  onChange,
  options,
  value,
}: {
  accessibilityLabel: string;
  busyValue: T | null;
  colors: ThemeColors;
  disabled: boolean;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  value: T;
}) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.segmented,
        { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
      ]}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: selected ? colors.surface : "transparent",
                borderColor: selected ? colors.accent : "transparent",
              },
              pressed && styles.pressed,
            ]}
          >
            {busyValue === option.value ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text
                style={[
                  styles.segmentLabel,
                  { color: selected ? colors.accent : colors.text },
                ]}
              >
                {option.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingSwitchRow({ label, detail, value, busy, onValueChange, colors, divided = false }: {
  label: string;
  detail: string;
  value: boolean;
  busy: boolean;
  onValueChange: (value: boolean) => void;
  colors: ThemeColors;
  divided?: boolean;
}) {
  return (
    <View style={[styles.option, divided && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
      <View style={styles.optionCopy}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.optionDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
      {busy
        ? <ActivityIndicator color={colors.accent} />
        : <Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.accent }} />}
    </View>
  );
}

function NavigationCard({ icon, label, detail, onPress, colors }: {
  icon: "questionmark.circle" | "trash";
  label: string;
  detail: string;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.navigationCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
    >
      <View style={[styles.navigationIcon, { backgroundColor: colors.surfaceMuted }]}>
        <SymbolView name={icon} size={22} tintColor={colors.text} />
      </View>
      <View style={styles.optionCopy}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.optionDetail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
      <Text style={[styles.chevron, { color: colors.accent }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: Spacing.lg, paddingHorizontal: Spacing.lg },
  heading: { gap: Spacing.xs },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 36, fontWeight: "800", lineHeight: 42 },
  sectionTitle: { fontSize: 24, fontWeight: "800", lineHeight: 30 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  card: { borderCurve: "continuous", borderRadius: Radius.lg, borderWidth: 1, boxShadow: Shadows.card, overflow: "hidden" },
  option: { alignItems: "center", flexDirection: "row", gap: Spacing.md, minHeight: 78, padding: Spacing.md },
  optionCopy: { flex: 1, gap: 3, minWidth: 0 },
  optionLabel: { fontSize: 17, fontWeight: "800" },
  optionDetail: { fontSize: 13, lineHeight: 18 },
  segmented: { borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, flexDirection: "row", gap: 4, padding: 4 },
  segment: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44 },
  segmentLabel: { fontSize: 14, fontWeight: "800" },
  error: { fontSize: 13, lineHeight: 18 },
  settingsLink: { fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  navigationCard: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.lg, borderWidth: 1, boxShadow: Shadows.card, flexDirection: "row", gap: Spacing.md, minHeight: 78, padding: Spacing.md },
  navigationIcon: { alignItems: "center", borderRadius: Radius.sm, height: 42, justifyContent: "center", width: 42 },
  chevron: { fontSize: 28, lineHeight: 28 },
});
