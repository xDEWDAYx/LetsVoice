import { StyleSheet, type StyleProp, type TextStyle } from "react-native";

export function scaleTextStyle(
  style: StyleProp<TextStyle>,
  scale: number,
): TextStyle | undefined {
  const flattened = StyleSheet.flatten(style);
  if (!flattened) return undefined;
  const scaled: TextStyle = {};
  if (typeof flattened.fontSize === "number") scaled.fontSize = flattened.fontSize * scale;
  if (typeof flattened.lineHeight === "number") scaled.lineHeight = flattened.lineHeight * scale;
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}
