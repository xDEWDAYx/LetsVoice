import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { UiText as Text } from "@/components/ui-text";
import { Colors, Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { parseInlineMarkdown, parseSafeMarkdown } from "@/services/safe-markdown";

export function SafeMarkdownText({ markdown }: { markdown: string }) {
  const colors = Colors[useTheme().mode];
  const blocks = parseSafeMarkdown(markdown);

  return (
    <View style={styles.document}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "divider") {
          return <View key={key} accessibilityRole="none" style={[styles.divider, { backgroundColor: colors.border }]} />;
        }
        if (block.type === "table-row") {
          return (
            <View key={key} style={[styles.tableRow, { borderColor: colors.border }]}>
              {block.cells.map((cell, cellIndex) => (
                <InlineBlock key={cellIndex} text={cell} style={[styles.tableCell, { color: colors.text }]} />
              ))}
            </View>
          );
        }
        if (block.type === "code") {
          return (
            <View key={key} style={[styles.codeBlock, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
              <View style={styles.codeHeader}>
                <Text style={[styles.codeLanguage, { color: colors.textMuted }]}>{block.language || "Code"}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Copy code" onPress={() => void Clipboard.setStringAsync(block.text)}>
                  <Text style={[styles.copy, { color: colors.accent }]}>Copy</Text>
                </Pressable>
              </View>
              <Text selectable style={[styles.code, { color: colors.text }]}>{block.text}</Text>
            </View>
          );
        }
        if (block.type === "heading") {
          return <InlineBlock key={key} text={block.text} style={[styles.heading, block.level > 2 && styles.smallHeading, { color: colors.text }]} />;
        }
        if (block.type === "quote") {
          return (
            <View key={key} style={[styles.quote, { borderLeftColor: colors.accent }]}>
              <InlineBlock text={block.text} style={[styles.body, styles.quotedText, { color: colors.textMuted }]} />
            </View>
          );
        }
        if (block.type === "list-item") {
          return (
            <View key={key} style={styles.listRow}>
              <Text style={[styles.marker, { color: colors.textMuted }]}>{block.ordered ? `${block.ordinal}.` : "•"}</Text>
              <InlineBlock text={block.text} style={[styles.body, styles.listText, { color: colors.text }]} />
            </View>
          );
        }
        return <InlineBlock key={key} text={block.text} style={[styles.body, { color: colors.text }]} />;
      })}
    </View>
  );
}

function InlineBlock({ text, style }: { text: string; style: object }) {
  const colors = Colors[useTheme().mode];
  const tokens = parseInlineMarkdown(text);
  const openLink = (href: string, domain: string) => {
    Alert.alert(
      "Open external link?",
      `This will open ${domain} outside LetsVoice.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open", onPress: () => void Linking.openURL(href) },
      ],
    );
  };
  return (
    <Text selectable style={style}>
      {tokens.map((token, index) => {
        if (token.type === "strong") return <Text key={index} style={styles.strong}>{token.text}</Text>;
        if (token.type === "emphasis") return <Text key={index} style={styles.emphasis}>{token.text}</Text>;
        if (token.type === "strikethrough") return <Text key={index} style={styles.strikethrough}>{token.text}</Text>;
        if (token.type === "code") return <Text key={index} style={[styles.inlineCode, { backgroundColor: colors.surfaceMuted }]}>{token.text}</Text>;
        if (token.type === "link" && token.href && token.domain) {
          return <Text key={index} accessibilityRole="link" onPress={() => openLink(token.href!, token.domain!)} style={[styles.link, { color: colors.accent }]}>{token.text}</Text>;
        }
        return <Text key={index}>{token.text}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  document: { gap: Spacing.sm },
  body: { fontSize: 16, lineHeight: 25 },
  heading: { fontSize: 20, fontWeight: "800", lineHeight: 26, marginTop: Spacing.xs },
  smallHeading: { fontSize: 17, lineHeight: 23 },
  strong: { fontWeight: "800" },
  emphasis: { fontStyle: "italic" },
  strikethrough: { textDecorationLine: "line-through" },
  inlineCode: { borderRadius: 4, fontFamily: Fonts.mono, fontSize: 14 },
  link: { fontWeight: "700", textDecorationLine: "underline" },
  listRow: { alignItems: "flex-start", flexDirection: "row", gap: Spacing.sm },
  marker: { fontSize: 16, fontWeight: "800", minWidth: 20, textAlign: "right" },
  listText: { flex: 1 },
  quote: { borderLeftWidth: 3, paddingLeft: Spacing.md },
  quotedText: { fontStyle: "italic" },
  codeBlock: { borderRadius: Radius.sm, borderWidth: 1, gap: Spacing.sm, overflow: "hidden", padding: Spacing.md },
  codeHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  codeLanguage: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  copy: { fontSize: 12, fontWeight: "800" },
  code: { fontFamily: Fonts.mono, fontSize: 14, lineHeight: 21 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs, width: "100%" },
  tableRow: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: Spacing.sm, paddingVertical: Spacing.xs },
  tableCell: { flex: 1, fontSize: 14, lineHeight: 20 },
});
