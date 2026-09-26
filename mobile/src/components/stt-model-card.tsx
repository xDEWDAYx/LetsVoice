import { UiText as Text } from "@/components/ui-text";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { formatBytes } from "@/utils/format-bytes";

export type SttModelCardStatus =
  | "not-installed"
  | "downloading"
  | "installed"
  | "active";

type SttModelCardProps = {
  name: string;
  description: string;
  languageLabel: string;
  recommendedForChinese: boolean;
  format: string;
  quantization: string | null;
  sizeBytes: number;
  status: SttModelCardStatus;
  progress: { bytesWritten: number; totalBytes: number } | null;
  isBusy: boolean;
  errorMessage: string | null;
  onDownload: () => void;
  onUse: () => void;
  onUninstall: () => void;
};

export function SttModelCard({
  name,
  description,
  languageLabel,
  recommendedForChinese,
  format,
  quantization,
  sizeBytes,
  status,
  progress,
  isBusy,
  errorMessage,
  onDownload,
  onUse,
  onUninstall,
}: SttModelCardProps) {
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const progressRatio =
    progress && progress.totalBytes > 0
      ? Math.min(progress.bytesWritten / progress.totalBytes, 1)
      : null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {format}
            {quantization ? ` · ${quantization}` : ""} ·{" "}
            {formatBytes(sizeBytes)}
          </Text>
          <View style={styles.languageRow}>
            <View style={[styles.languageBadge, { backgroundColor: recommendedForChinese ? colors.accentSoft : colors.surfaceMuted }]}>
              <Text style={[styles.languageBadgeText, { color: recommendedForChinese ? colors.accent : colors.textMuted }]}>
                {recommendedForChinese ? `Recommended · ${languageLabel}` : languageLabel}
              </Text>
            </View>
          </View>
          <Text style={[styles.description, { color: colors.textMuted }]}>
            {description}
          </Text>
        </View>
        {status === "active" && (
          <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.badgeLabel, { color: colors.accent }]}>
              Active
            </Text>
          </View>
        )}
      </View>

      {status === "downloading" && (
        <View style={styles.progressSection}>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.surfaceMuted },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.round((progressRatio ?? 0) * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
            {progressRatio !== null
              ? `Downloading… ${Math.round(progressRatio * 100)}%`
              : "Downloading…"}
          </Text>
        </View>
      )}

      {errorMessage && (
        <Text style={[styles.error, { color: colors.danger }]}>
          {errorMessage}
        </Text>
      )}

      <View style={styles.actions}>
        {status === "not-installed" && (
          <AppButton
            label="Download"
            variant="secondary"
            onPress={onDownload}
          />
        )}
        {status === "downloading" && (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.busyLabel, { color: colors.textMuted }]}>
              Downloading
            </Text>
          </View>
        )}
        {status === "installed" && (
          <>
            <AppButton
              label={isBusy ? "Working…" : "Use"}
              accessibilityLabel={`Use ${name}`}
              disabled={isBusy}
              onPress={onUse}
            />
            <AppButton
              label="Uninstall"
              variant="quiet"
              disabled={isBusy}
              onPress={onUninstall}
            />
          </>
        )}
        {status === "active" && (
          <Text style={[styles.activeHint, { color: colors.textMuted }]}>
            In use — uninstall another model to switch away from this one.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: "continuous",
    borderRadius: Radius.md,
    borderWidth: 1,
    boxShadow: Shadows.card,
    gap: Spacing.md,
    padding: Spacing.md,
  },
  header: {
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "space-between",
  },
  info: {
    flex: 1,
    gap: Spacing.xs,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
  },
  meta: {
    fontSize: 13,
    fontWeight: "600",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  languageRow: { alignItems: "flex-start", flexDirection: "row" },
  languageBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  languageBadgeText: { fontSize: 12, fontWeight: "800" },
  badge: {
    alignSelf: "flex-start",
    borderRadius: Radius.sm,
    flexShrink: 0,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  progressSection: {
    gap: Spacing.xs,
  },
  progressTrack: {
    borderRadius: Radius.sm,
    height: 6,
    overflow: "hidden",
  },
  progressFill: {
    borderRadius: Radius.sm,
    height: "100%",
  },
  progressLabel: {
    fontSize: 12,
  },
  error: {
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  busyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  busyLabel: {
    fontSize: 14,
  },
  activeHint: {
    flex: 1,
    fontSize: 13,
  },
});
