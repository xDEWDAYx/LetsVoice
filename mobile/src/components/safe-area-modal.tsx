import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type KeyboardAvoidingViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type SafeAreaModalProps = {
  androidKeyboardBehavior?: KeyboardAvoidingViewProps["behavior"];
  androidPresentation?: "center" | "sheet";
  children: ReactNode;
  dismissDisabled?: boolean;
  dismissOnBackdropPress?: boolean;
  onRequestClose: () => void;
  visible: boolean;
};

/**
 * The only blocking modal presentation used by the app.
 *
 * Every iOS overlay is centered inside the visible safe area and scrolls
 * internally when its content is too tall. The whole overlay fades so the
 * backdrop never travels with the card. Android may retain a centered or
 * bottom-sheet layout per screen.
 */
export function SafeAreaModal({
  androidKeyboardBehavior,
  androidPresentation = "sheet",
  children,
  dismissDisabled = false,
  dismissOnBackdropPress = true,
  onRequestClose,
  visible,
}: SafeAreaModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const isCentered = Platform.OS === "ios" || androidPresentation === "center";
  const requestClose = () => {
    if (!dismissDisabled) onRequestClose();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={requestClose}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : androidKeyboardBehavior}
        style={[styles.backdrop, !isCentered && styles.sheetBackdrop]}
      >
        <ScrollView
          contentContainerStyle={[
            isCentered ? styles.centeredViewport : styles.sheetViewport,
            isCentered && {
              paddingBottom: Spacing.lg + insets.bottom,
              paddingTop: Spacing.lg + insets.top,
            },
          ]}
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={!isCentered ? styles.sheetScroll : undefined}
        >
          <Pressable
            accessible={false}
            disabled={!dismissOnBackdropPress || dismissDisabled}
            onPress={requestClose}
            style={[
              styles.dismissArea,
              isCentered ? styles.centeredDismissArea : styles.sheetDismissArea,
            ]}
          >
            <Pressable
              accessible={false}
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={[
                styles.card,
                isCentered ? styles.centeredCard : styles.sheetCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
                !isCentered && { paddingBottom: Spacing.lg + insets.bottom },
              ]}
            >
              {children}
            </Pressable>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.36)",
    flex: 1,
  },
  dismissArea: { flexGrow: 1, width: "100%" },
  centeredDismissArea: { justifyContent: "center" },
  sheetDismissArea: { justifyContent: "flex-end" },
  sheetBackdrop: { justifyContent: "flex-end" },
  centeredViewport: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  sheetViewport: {
    flexGrow: 1,
  },
  sheetScroll: { maxHeight: "92%" },
  card: {
    gap: Spacing.md,
    padding: Spacing.lg,
    width: "100%",
  },
  centeredCard: {
    alignSelf: "center",
    borderCurve: "continuous",
    borderRadius: Radius.lg,
    borderWidth: 1,
    boxShadow: Shadows.raised,
    maxWidth: 560,
  },
  sheetCard: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
});
