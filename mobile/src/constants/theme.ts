import { Platform } from "react-native";

export const Colors = {
  light: {
    background: "#F3F7F5",
    surface: "rgba(253, 254, 253, 0.88)",
    surfaceMuted: "#EAF2EF",
    text: "#1C2B28",
    textMuted: "#697773",
    border: "rgba(198, 211, 206, 0.62)",
    accent: "#356F68",
    accentSoft: "#DDECE7",
    danger: "#A84242",
  },
  dark: {
    background: "#0B1714",
    surface: "#13231E",
    surfaceMuted: "#1B3029",
    text: "#F1FAF7",
    textMuted: "#9DB5AD",
    border: "#29473E",
    accent: "#82B8AE",
    accentSoft: "#21453E",
    danger: "#F0A4A4",
  },
} as const;

export const Fonts = Platform.select({
  ios: { sans: "system-ui", serif: "ui-serif", mono: "ui-monospace" },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    mono: "var(--font-mono)",
  },
  default: { sans: "normal", serif: "serif", mono: "monospace" },
});

export const Spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 24,
} as const;

export const Shadows = {
  card: "0 2px 12px rgba(51, 78, 70, 0.045)",
  raised: "0 8px 24px rgba(45, 82, 72, 0.085)",
} as const;

export const Backgrounds = {
  light: "radial-gradient(circle at 8% 8%, rgba(202, 226, 218, 0.58) 0%, transparent 40%), radial-gradient(circle at 54% 58%, rgba(242, 236, 213, 0.34) 0%, transparent 36%), radial-gradient(circle at 94% 72%, rgba(214, 229, 233, 0.48) 0%, transparent 44%), linear-gradient(135deg, #EEF5F2 0%, #F8F8F5 54%, #F0F5F6 100%)",
  dark: "linear-gradient(145deg, #0B1714 0%, #10221D 55%, #0C1B1A 100%)",
} as const;
