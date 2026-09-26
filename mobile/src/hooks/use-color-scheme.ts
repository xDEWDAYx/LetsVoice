import { useTheme } from "@/hooks/use-theme";

export function useColorScheme(): "light" | "dark" {
  return useTheme().mode;
}
