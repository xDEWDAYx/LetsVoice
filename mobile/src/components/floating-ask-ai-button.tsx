import { UiText as Text } from "@/components/ui-text";
import { type Href, usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, useWindowDimensions, View,  } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const BUTTON_SIZE = 72;
const EDGE_PADDING = 16;

export function FloatingAskAiButton() {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const minX = EDGE_PADDING + insets.left;
  const maxX = Math.max(
    minX,
    width - BUTTON_SIZE - insets.right - EDGE_PADDING,
  );
  const minY = EDGE_PADDING + insets.top;
  const maxY = Math.max(
    minY,
    height - BUTTON_SIZE - insets.bottom - EDGE_PADDING,
  );
  const [position, setPosition] = useState({
    x: maxX,
    y: Math.max(minY, height - BUTTON_SIZE - insets.bottom - 112),
  });
  const positionRef = useRef(position);
  const dragStart = useRef(position);
  const didDrag = useRef(false);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    setPosition((previous) => clampPosition(previous.x, previous.y));
  }, [width, height, insets.left, insets.right, insets.top, insets.bottom]);

  const hidden =
    pathname === "/getting-started" ||
    pathname === "/ask-ai" ||
    pathname === "/transcription" ||
    (pathname.startsWith("/notes/") && pathname !== "/notes/search") ||
    pathname.startsWith("/ai/");

  const clampPosition = (x: number, y: number) => ({
    x: Math.min(Math.max(minX, x), maxX),
    y: Math.min(Math.max(minY, y), maxY),
  });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        dragStart.current = positionRef.current;
        didDrag.current = false;
      },
      onPanResponderMove: (_, gesture) => {
        didDrag.current = true;
        setPosition(
          clampPosition(
            dragStart.current.x + gesture.dx,
            dragStart.current.y + gesture.dy,
          ),
        );
      },
      onPanResponderRelease: () => undefined,
    }),
  ).current;

  if (hidden) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.layer,
        {
          left: position.x,
          top: position.y,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Ask AI"
        onPress={() => {
          if (!didDrag.current) {
            router.push("/ask-ai" as Href);
          }
          didDrag.current = false;
        }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.accent,
            borderColor: colors.surface,
          },
          pressed && styles.pressed,
        ]}
      >
        <Text numberOfLines={1} style={[styles.aiLabel, { color: colors.surface }]}>AI</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    zIndex: 20,
  },
  button: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 2,
    flex: 1,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  aiLabel: {
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
});
