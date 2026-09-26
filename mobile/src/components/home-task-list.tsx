import { UiText as Text } from "@/components/ui-text";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Colors, Radius, Spacing } from "@/constants/theme";
import type { CoreTask } from "@/domain/core-note-insight/core-note-insight";
import { useTheme } from "@/hooks/use-theme";
import { groupHomeTasks, taskEffectiveDate } from "@/services/home-task-groups";

export function HomeTaskList({
  tasks,
  onOpenNote,
  onTaskCompletedChange,
  onTaskPinnedChange,
}: {
  tasks: readonly CoreTask[];
  onOpenNote: (noteId: string) => void;
  onTaskCompletedChange: (task: CoreTask, completed: boolean) => Promise<void>;
  onTaskPinnedChange: (task: CoreTask, pinned: boolean) => Promise<void>;
}) {
  const colors = Colors[useTheme().mode];
  const groups = useMemo(() => groupHomeTasks(tasks), [tasks]);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [completedLimit, setCompletedLimit] = useState(20);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const pendingCount = groups.pending.reduce((sum, group) => sum + group.tasks.length, 0);

  const toggle = async (task: CoreTask, completed: boolean) => {
    if (busyIds.has(task.id)) return;
    setError(null);
    setBusyIds((current) => new Set(current).add(task.id));
    try {
      await onTaskCompletedChange(task, completed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update this task.");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  };

  const togglePinned = async (task: CoreTask) => {
    if (busyIds.has(task.id)) return;
    setError(null);
    setBusyIds((current) => new Set(current).add(task.id));
    try { await onTaskPinnedChange(task, !task.isPinned); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to pin this task."); }
    finally { setBusyIds((current) => { const next = new Set(current); next.delete(task.id); return next; }); }
  };

  const latestCompletedBySeries = useMemo(() => {
    const latest = new Map<string, number>();
    for (const task of groups.completed) if (task.seriesKey) latest.set(task.seriesKey, Math.max(latest.get(task.seriesKey) ?? -1, task.occurrenceIndex ?? 0));
    return latest;
  }, [groups.completed]);

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Tasks</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{pendingCount} open across your Structured Notes</Text>
        </View>
      </View>

      {pendingCount === 0 && (
        <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No open tasks</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>Tasks generated from Structured Notes will appear here.</Text>
        </View>
      )}

      {groups.pending.map((group) => group.tasks.length > 0 && (
        <View key={group.key} style={styles.group}>
          <Text style={[styles.groupTitle, { color: group.key === "overdue" ? colors.danger : colors.textMuted }]}>{group.label}</Text>
          <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {group.tasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                busy={busyIds.has(task.id)}
                divided={index > 0}
                onOpenNote={onOpenNote}
                onToggle={() => void toggle(task, true)}
                onPin={() => void togglePinned(task)}
                canToggle
              />
            ))}
          </View>
        </View>
      ))}

      {groups.completed.length > 0 && (
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: completedExpanded }}
            onPress={() => setCompletedExpanded((current) => !current)}
            style={({ pressed }) => [styles.completedHeader, pressed && styles.pressed]}
          >
            <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{`Completed (${groups.completed.length})`}</Text>
            <Text style={[styles.chevron, { color: colors.textMuted }]}>{completedExpanded ? "⌃" : "⌄"}</Text>
          </Pressable>
          {completedExpanded && (
            <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {groups.completed.slice(0, completedLimit).map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  busy={busyIds.has(task.id)}
                  divided={index > 0}
                  onOpenNote={onOpenNote}
                  onToggle={() => void toggle(task, false)}
                  onPin={() => void togglePinned(task)}
                  canToggle={!task.endedAt && (!task.seriesKey || latestCompletedBySeries.get(task.seriesKey) === (task.occurrenceIndex ?? 0))}
                />
              ))}
              {groups.completed.length > completedLimit && (
                <Pressable accessibilityRole="button" onPress={() => setCompletedLimit((current) => current + 20)} style={({ pressed }) => [styles.showOlder, pressed && styles.pressed]}>
                  <Text style={[styles.taskMeta, { color: colors.accent }]}>Show older</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {error && <Text selectable style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

function TaskRow({ task, busy, divided, onOpenNote, onToggle, onPin, canToggle }: {
  task: CoreTask;
  busy: boolean;
  divided: boolean;
  onOpenNote: (noteId: string) => void;
  onToggle: () => void;
  onPin: () => void;
  canToggle: boolean;
}) {
  const colors = Colors[useTheme().mode];
  const completed = task.status === "completed";
  const effectiveDate = taskEffectiveDate(task);
  const timeLabel = effectiveDate
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(effectiveDate))
    : null;

  return (
    <View style={[styles.row, divided && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${completed ? "Mark incomplete" : "Mark complete"}: ${task.title}`}
        accessibilityState={{ checked: completed, disabled: busy || !canToggle }}
        disabled={busy || !canToggle}
        hitSlop={8}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.checkbox,
          { backgroundColor: completed ? colors.accent : "transparent", borderColor: completed ? colors.accent : colors.border },
          pressed && styles.pressed,
        ]}
      >
        {completed && <Text style={styles.checkmark}>✓</Text>}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open source note for ${task.title}`}
        onPress={() => onOpenNote(task.sourceNoteId)}
        style={({ pressed }) => [styles.rowCopy, pressed && styles.pressed]}
      >
        <Text numberOfLines={2} style={[styles.taskTitle, completed && styles.completedText, { color: completed ? colors.textMuted : colors.text }]}>{task.title}</Text>
        {(task.description || timeLabel) && (
          <Text numberOfLines={2} style={[styles.taskMeta, { color: colors.textMuted }]}>
            {[task.description, timeLabel].filter(Boolean).join(" · ")}
          </Text>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={task.isPinned ? "Unpin task" : "Pin task"} disabled={busy} onPress={onPin} hitSlop={8} style={({ pressed }) => [styles.pin, pressed && styles.pressed]}>
        <Text style={[styles.pinText, { color: colors.accent }]}>{task.isPinned ? "★" : "☆"}</Text>
      </Pressable>
      <Text style={[styles.arrow, { color: colors.accent }]}>›</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  heading: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" },
  headingCopy: { flex: 1, gap: 2 },
  title: { fontSize: 19, fontWeight: "800" },
  subtitle: { fontSize: 12, lineHeight: 17 },
  group: { gap: Spacing.xs },
  groupTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  list: { borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, overflow: "hidden" },
  row: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, minHeight: 68, padding: Spacing.md },
  checkbox: { alignItems: "center", borderRadius: 10, borderWidth: 2, height: 22, justifyContent: "center", width: 22 },
  checkmark: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  taskTitle: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  taskMeta: { fontSize: 12, lineHeight: 17 },
  completedText: { textDecorationLine: "line-through" },
  arrow: { fontSize: 25, fontWeight: "500" },
  pin: { alignItems: "center", justifyContent: "center", minHeight: 32, minWidth: 32 },
  pinText: { fontSize: 20, fontWeight: "700" },
  completedHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 32 },
  chevron: { fontSize: 18, fontWeight: "700" },
  empty: { borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, gap: 3, padding: Spacing.md },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptyBody: { fontSize: 12, lineHeight: 17 },
  error: { fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.68 },
  showOlder: { alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, minHeight: 44, justifyContent: "center" },
});
