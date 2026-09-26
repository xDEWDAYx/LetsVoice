import { UiText as Text } from "@/components/ui-text";
import { Image } from "expo-image";
import { Link, type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { HomeTaskList } from "@/components/home-task-list";
import { SafeAreaModal } from "@/components/safe-area-modal";
import { Backgrounds, Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import type { CoreTask } from "@/domain/core-note-insight/core-note-insight";
import type { Note } from "@/domain/note/note";
import { useTheme } from "@/hooks/use-theme";
import { configureCalendarLocale } from "@/localization/calendar-locale";
import { buildHomeCalendarItems, type HomeCalendarItem } from "@/services/home-calendar-items";

type OverviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; notes: Note[]; tasks: CoreTask[]; loadedAt: number };

function toDateKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-GB").format(value);

export default function HomeScreen() {
  const theme = useTheme();
  const language = "en" as const;
  configureCalendarLocale(language);
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewState>({ status: "loading" });
  const [overviewVisible, setOverviewVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date().toISOString())!);

  const loadOverview = useCallback(async () => {
    try {
      const [notes, insightItems] = await Promise.all([
        appContainer.noteService.getAllNotes(),
        appContainer.coreNoteInsightService.getDashboardItems(),
      ]);
      setOverview({ status: "success", notes, ...insightItems, loadedAt: Date.now() });
    } catch {
      setOverview({ status: "error", message: "Unable to load your overview." });
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadOverview(); }, [loadOverview]));

  useEffect(
    () => appContainer.noteService.subscribeToCategoryChanges(() => {
      appContainer.noteService.invalidateSearchIndex();
      void loadOverview();
    }),
    [loadOverview],
  );

  useEffect(
    () => appContainer.noteService.subscribeToChanges(() => { void loadOverview(); }),
    [loadOverview],
  );

  useEffect(
    () => appContainer.coreNoteInsightService.subscribeToChanges(() => {
      appContainer.noteService.invalidateSearchIndex();
      void loadOverview();
    }),
    [loadOverview],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!appContainer.inferenceScheduler.isBusy()) {
        void appContainer.transcriptionService.ensureReady().catch(() => undefined);
      }
    }, 750);
    return () => clearTimeout(timer);
  }, []);

  const overviewData = useMemo(() => {
    if (overview.status !== "success") return null;
    const weekAgo = overview.loadedAt - 7 * 24 * 60 * 60 * 1000;
    const recentNotes = overview.notes.filter((note) => new Date(note.getCreatedAt()).getTime() >= weekAgo);
    const calendarByDate = new Map<string, HomeCalendarItem[]>();
    for (const item of buildHomeCalendarItems({
      tasks: overview.tasks,
    })) {
      calendarByDate.set(item.dateKey, [...(calendarByDate.get(item.dateKey) ?? []), item]);
    }
    return {
      pinnedCount: overview.notes.filter((note) => note.getIsPinned()).length,
      pendingCount: overview.tasks.filter((task) => task.status === "pending").length,
      transcriptCount: overview.notes.reduce((sum, note) => sum + note.getTranscript().length, 0),
      recentTranscriptCount: recentNotes.reduce((sum, note) => sum + note.getTranscript().length, 0),
      recentNoteCount: recentNotes.length,
      calendarByDate,
    };
  }, [overview]);

  const markedDates = useMemo(() => {
    if (!overviewData) return {};
    const marks: Record<string, { marked?: boolean; dotColor?: string; selected?: boolean; selectedColor?: string }> = {};
    for (const dateKey of overviewData.calendarByDate.keys()) marks[dateKey] = { marked: true, dotColor: colors.accent };
    marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: colors.accent };
    return marks;
  }, [colors.accent, overviewData, selectedDate]);

  const selectedEvents = overviewData?.calendarByDate.get(selectedDate) ?? [];
  const openLibrary = () => {
    setOverviewVisible(false);
    router.push({
      pathname: "/(tabs)/library",
      params: { section: "notes" },
    });
  };

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background, experimental_backgroundImage: Backgrounds[theme.mode] }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + 76 }]}
      >
        <View style={styles.hero}>
          <View style={[styles.brandMark, { backgroundColor: colors.accent }]}><Text style={styles.brandGlyph}>|||</Text></View>
          <View style={styles.heroCopy}>
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.eyebrow, { color: colors.accent }]}>LetsVoice</Text>
          </View>
          <Pressable
            accessibilityHint="Shows note and task statistics"
            accessibilityLabel="Open overview"
            accessibilityRole="button"
            accessibilityState={{ expanded: overviewVisible }}
            onPress={() => setOverviewVisible(true)}
            style={({ pressed }) => [
              styles.overviewTrigger,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <Image accessibilityElementsHidden source="sf:chart.bar.xaxis" style={styles.overviewTriggerIcon} tintColor={colors.accent} />
            <Text style={[styles.overviewTriggerLabel, { color: colors.accent }]}>Overview</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Start a transcription</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Choose live recording or upload an audio file.</Text>
        </View>

        <View style={styles.transcriptionChoices}>
          <View style={[styles.transcriptionCard, styles.liveCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconTile, styles.liveIconTile, { backgroundColor: colors.accentSoft }]}><MicrophoneIcon color={colors.accent} /></View>
              <View style={styles.cardCopy}>
                <Text style={[styles.cardTitle, styles.liveTitle, { color: colors.text }]}>Live recording</Text>
                <Text style={[styles.cardBody, { color: colors.textMuted }]}>Record and transcribe as you speak.</Text>
              </View>
            </View>
            <Link href="/transcription" asChild><AppButton label="Record now" /></Link>
          </View>

        </View>

        <View style={[styles.secondaryActionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.secondaryIcon, { backgroundColor: colors.accentSoft }]}><Text style={[styles.actionIcon, { color: colors.accent }]}>↑</Text></View>
          <View style={styles.secondaryCopy}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>Upload audio</Text>
            <Text style={[styles.actionBody, { color: colors.textMuted }]}>Choose a file and start transcribing.</Text>
          </View>
          <Link href={"/audio-transcription" as Href} asChild><AppButton label="Upload" variant="quiet" /></Link>
        </View>

        {overview.status === "loading" && <LoadingState />}
        {overview.status === "error" && <ErrorState message={overview.message} onRetry={() => void loadOverview()} />}
        {overview.status === "success" && overviewData && <>
          <HomeTaskList
            tasks={overview.tasks}
            onOpenNote={(noteId) => router.push({ pathname: "/notes/[noteId]", params: { noteId } })}
            onTaskCompletedChange={async (task, completed) => {
              await appContainer.coreNoteInsightService.setTaskCompleted(task.sourceNoteId, task.id, completed);
              await loadOverview();
            }}
            onTaskPinnedChange={async (task, pinned) => {
              await appContainer.coreNoteInsightService.setTaskPinned(task.sourceNoteId, task.id, pinned);
              await loadOverview();
            }}
          />
          <View style={styles.calendarSection}>
            <Text style={[styles.calendarTitle, { color: colors.text }]}>Calendar</Text>
            <View style={[styles.calendarCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Calendar
                key={`${language}-${theme.mode}`}
                markedDates={markedDates}
                onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
                theme={{
                  arrowColor: colors.accent,
                  backgroundColor: colors.surface,
                  calendarBackground: colors.surface,
                  dayTextColor: colors.text,
                  disabledArrowColor: colors.border,
                  dotColor: colors.accent,
                  indicatorColor: colors.accent,
                  monthTextColor: colors.text,
                  selectedDayBackgroundColor: colors.accent,
                  selectedDayTextColor: theme.mode === "dark" ? colors.background : "#FFFFFF",
                  selectedDotColor: theme.mode === "dark" ? colors.background : "#FFFFFF",
                  textDisabledColor: colors.border,
                  textInactiveColor: colors.border,
                  textSectionTitleColor: colors.textMuted,
                  textSectionTitleDisabledColor: colors.border,
                  todayTextColor: colors.accent,
                }}
              />
              <View style={[styles.agenda, { borderTopColor: colors.border }]}>
                <Text style={[styles.agendaDate, { color: colors.text }]}>{selectedDate}</Text>
                {selectedEvents.length === 0
                  ? <Text style={[styles.agendaEmpty, { color: colors.textMuted }]}>No calendar items for this date.</Text>
                  : selectedEvents.map((event) => <Link key={event.id} href={{ pathname: "/notes/[noteId]", params: { noteId: event.sourceNoteId } }} asChild><Pressable accessibilityRole="button" style={({ pressed }) => [styles.eventRow, { backgroundColor: colors.surfaceMuted }, pressed && styles.pressed]}><View style={[styles.eventDot, { backgroundColor: colors.accent }]} /><View style={styles.eventCopy}><Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text><Text style={[styles.eventKind, { color: colors.textMuted }]}>Task due</Text></View></Pressable></Link>)}
              </View>
            </View>
          </View>
        </>}

      </ScrollView>

      <SafeAreaModal
        androidPresentation="center"
        onRequestClose={() => setOverviewVisible(false)}
        visible={overviewVisible}
      >
        <View style={styles.modalHeader}>
          <View style={styles.modalHeading}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Overview</Text>
          </View>
          <Pressable
            accessibilityLabel="Close overview"
            accessibilityRole="button"
            hitSlop={4}
            onPress={() => setOverviewVisible(false)}
            style={({ pressed }) => [styles.modalClose, { backgroundColor: colors.surfaceMuted }, pressed && styles.pressed]}
          >
            <Text style={[styles.modalCloseText, { color: colors.textMuted }]}>×</Text>
          </Pressable>
        </View>
        {overview.status === "loading" && <LoadingState />}
        {overview.status === "error" && <ErrorState message={overview.message} onRetry={() => void loadOverview()} />}
        {overview.status === "success" && overviewData && (
          <View style={styles.statsGrid}>
            <HomeStatCard label="Total notes" value={overview.notes.length} detail={`+${overviewData.recentNoteCount} this week`} />
            <HomeStatCard label="Pinned" value={overviewData.pinnedCount} detail="Saved for quick access" />
            <HomeStatCard label="Characters" value={overviewData.transcriptCount} detail={`+${formatNumber(overviewData.recentTranscriptCount)} this week`} />
            <HomeStatCard label="Open tasks" value={overviewData.pendingCount} detail="Still needs attention" />
          </View>
        )}
        <AppButton label="Open Library" onPress={openLibrary} variant="secondary" />
      </SafeAreaModal>
    </>
  );
}

function MicrophoneIcon({ color }: { color: string }) {
  return (
    <View style={styles.microphone}>
      <View style={[styles.microphoneCapsule, { borderColor: color }]} />
      <View style={[styles.microphoneCradle, { borderBottomColor: color, borderLeftColor: color, borderRightColor: color }]} />
      <View style={[styles.microphoneStem, { backgroundColor: color }]} />
      <View style={[styles.microphoneBase, { backgroundColor: color }]} />
    </View>
  );
}

function HomeStatCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  const colors = Colors[useTheme().mode];
  return <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    <Text selectable style={[styles.statValue, { color: colors.text }]}>{formatNumber(value)}</Text>
    <Text style={[styles.statDetail, { color: colors.textMuted }]} numberOfLines={2}>{detail}</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: Spacing.md, paddingHorizontal: Spacing.lg },
  hero: { alignItems: "center", flexDirection: "row", gap: Spacing.sm },
  brandMark: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, height: 40, justifyContent: "center", width: 40 },
  brandGlyph: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  heroCopy: { flex: 1, gap: Spacing.xs },
  eyebrow: { fontSize: 20, fontWeight: "800", letterSpacing: 0.6 },
  overviewTrigger: { alignItems: "center", borderCurve: "continuous", borderRadius: 22, borderWidth: 1, boxShadow: Shadows.card, flexDirection: "row", gap: 6, minHeight: 44, paddingHorizontal: Spacing.sm },
  overviewTriggerIcon: { height: 17, width: 17 },
  overviewTriggerLabel: { fontSize: 13, fontWeight: "800" },
  sectionHeading: { gap: Spacing.xs },
  sectionTitle: { fontSize: 20, fontWeight: "800" },
  sectionSubtitle: { fontSize: 14, lineHeight: 20 },
  transcriptionChoices: { gap: Spacing.sm },
  transcriptionCard: { borderCurve: "continuous", borderRadius: Radius.lg, borderWidth: 1, boxShadow: Shadows.card, gap: Spacing.md },
  liveCard: { boxShadow: Shadows.raised, padding: Spacing.lg },
  cardHeader: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  iconTile: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, height: 44, justifyContent: "center", width: 44 },
  liveIconTile: { height: 52, width: 52 },
  cardCopy: { gap: Spacing.xs },
  cardTitle: { fontSize: 18, fontWeight: "800" },
  liveTitle: { fontSize: 21 },
  cardBody: { fontSize: 14, lineHeight: 19 },
  secondaryActionCard: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, boxShadow: Shadows.card, flexDirection: "row", gap: Spacing.md, minHeight: 88, padding: Spacing.md },
  secondaryIcon: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, height: 44, justifyContent: "center", width: 44 },
  secondaryCopy: { flex: 1, gap: 2, minWidth: 0 },
  microphone: { alignItems: "center", height: 30, justifyContent: "flex-start", position: "relative", width: 24 },
  microphoneCapsule: { borderRadius: 7, borderWidth: 2.2, height: 17, width: 11 },
  microphoneCradle: { borderBottomLeftRadius: 9, borderBottomRightRadius: 9, borderBottomWidth: 2.2, borderLeftWidth: 2.2, borderRightWidth: 2.2, height: 12, position: "absolute", top: 7, width: 19 },
  microphoneStem: { borderRadius: 1, height: 6, position: "absolute", top: 18, width: 2.2 },
  microphoneBase: { borderRadius: 2, height: 2.2, position: "absolute", top: 24, width: 12 },
  actionIcon: { fontSize: 26, fontWeight: "700" },
  actionTitle: { fontSize: 17, fontWeight: "800" },
  actionBody: { fontSize: 13, lineHeight: 18 },
  modalHeader: { alignItems: "flex-start", flexDirection: "row", gap: Spacing.md, justifyContent: "space-between" },
  modalHeading: { flex: 1, gap: Spacing.xs, minWidth: 0 },
  modalTitle: { fontSize: 22, fontWeight: "800" },
  modalClose: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  modalCloseText: { fontSize: 26, fontWeight: "500", lineHeight: 28 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  statCard: { borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, boxShadow: Shadows.card, flexBasis: "46%", flexGrow: 1, gap: 2, minHeight: 104, padding: Spacing.md },
  statLabel: { fontSize: 12, fontWeight: "700" },
  statValue: { fontSize: 25, fontVariant: ["tabular-nums"], fontWeight: "800" },
  statDetail: { fontSize: 11, lineHeight: 15 },
  calendarSection: { gap: Spacing.sm },
  calendarTitle: { fontSize: 19, fontWeight: "800" },
  calendarCard: { borderCurve: "continuous", borderRadius: Radius.lg, borderWidth: 1, boxShadow: Shadows.card, overflow: "hidden" },
  agenda: { borderTopWidth: 1, gap: Spacing.sm, padding: Spacing.md },
  agendaDate: { fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "800" },
  agendaEmpty: { fontSize: 13, lineHeight: 18 },
  eventRow: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, flexDirection: "row", gap: Spacing.sm, padding: Spacing.sm },
  eventDot: { borderRadius: 4, height: 8, width: 8 },
  eventCopy: { flex: 1, gap: 2 },
  eventTitle: { fontSize: 14, fontWeight: "700" },
  eventKind: { fontSize: 11 },
  pressed: { opacity: 0.72 },
});
