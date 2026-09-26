import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WorkspaceListScreen } from "@/app/workspaces";
import { LibraryNotesPane } from "@/components/library-notes-pane";
import { UiText as Text } from "@/components/ui-text";
import { Backgrounds, Colors, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type LibrarySection = "notes" | "workspaces";

export default function LibraryScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const [selectedSection, setSelectedSection] = useState<LibrarySection>("notes");

  useEffect(() => {
    if (section === "notes" || section === "workspaces") setSelectedSection(section);
  }, [section]);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          experimental_backgroundImage: Backgrounds[theme.mode],
        },
      ]}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, paddingTop: insets.top + Spacing.md },
        ]}
      >
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.text }]}>Library</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Your notes and workspaces in one place.</Text>
        </View>
        <View
          accessibilityLabel="Choose Library section"
          style={[styles.segmented, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
        >
          <LibrarySegment
            label="Notes"
            selected={selectedSection === "notes"}
            onPress={() => setSelectedSection("notes")}
          />
          <LibrarySegment
            label="Workspaces"
            selected={selectedSection === "workspaces"}
            onPress={() => setSelectedSection("workspaces")}
          />
        </View>
      </View>

      <View style={styles.content}>
        {selectedSection === "notes"
          ? <LibraryNotesPane />
          : <WorkspaceListScreen embeddedInLibrary />}
      </View>
    </View>
  );
}

function LibrarySegment({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const colors = Colors[useTheme().mode];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        {
          backgroundColor: selected ? colors.surface : "transparent",
          borderColor: selected ? colors.accent : "transparent",
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.segmentLabel, { color: selected ? colors.accent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.md, paddingBottom: Spacing.md, paddingHorizontal: Spacing.lg },
  heading: { gap: Spacing.xs },
  title: { fontSize: 34, fontWeight: "800" },
  subtitle: { fontSize: 14, lineHeight: 20 },
  segmented: { borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, flexDirection: "row", gap: 2, padding: 3 },
  segment: { alignItems: "center", borderCurve: "continuous", borderRadius: 8, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: Spacing.md },
  segmentLabel: { fontSize: 14, fontWeight: "700" },
  content: { flex: 1 },
  pressed: { opacity: 0.72 },
});
