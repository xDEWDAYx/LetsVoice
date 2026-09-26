import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type UndoRequest = { message: string; undo: () => Promise<void> };
type TrashUndoContextValue = { showTrashUndo: (request: UndoRequest) => void };

const TrashUndoContext = createContext<TrashUndoContextValue | null>(null);

export function TrashUndoProvider({ children }: { children: ReactNode }) {
  const colors = Colors[useTheme().mode];
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState<UndoRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRequest(null);
    setBusy(false);
  }, []);

  const showTrashUndo = useCallback((next: UndoRequest) => {
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
    setRequest(next);
    timer.current = setTimeout(() => {
      timer.current = null;
      setRequest(null);
    }, 5_000);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <TrashUndoContext.Provider value={{ showTrashUndo }}>
      {children}
      {request && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              backgroundColor: colors.text,
              bottom: insets.bottom + 72,
            },
          ]}
        >
          <Text numberOfLines={2} style={[styles.message, { color: colors.background }]}>{request.message}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void request.undo().then(dismiss, () => setBusy(false));
            }}
            style={({ pressed }) => [styles.undo, pressed && styles.pressed]}
          >
            <Text style={[styles.undoText, { color: colors.accent }]}>{busy ? "Restoring…" : "Undo"}</Text>
          </Pressable>
        </View>
      )}
    </TrashUndoContext.Provider>
  );
}

export function useTrashUndo(): TrashUndoContextValue {
  const value = useContext(TrashUndoContext);
  if (!value) throw new Error("useTrashUndo must be used inside TrashUndoProvider.");
  return value;
}

const styles = StyleSheet.create({
  toast: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: Radius.md,
    boxShadow: Shadows.raised,
    flexDirection: "row",
    gap: Spacing.md,
    left: Spacing.lg,
    minHeight: 54,
    paddingHorizontal: Spacing.md,
    position: "absolute",
    right: Spacing.lg,
  },
  message: { flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  undo: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  undoText: { fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.7 },
});
