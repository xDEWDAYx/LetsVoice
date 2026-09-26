import { Stack } from "expo-router";

import { createThemedStackScreenOptions } from "@/constants/themed-stack-options";
import { useTheme } from "@/hooks/use-theme";

export default function AiLayout() {
  const theme = useTheme();

  return (
    <Stack screenOptions={createThemedStackScreenOptions(theme.mode, true)} />
  );
}
