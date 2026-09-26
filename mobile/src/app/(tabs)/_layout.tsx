import { Tabs } from "expo-router";
import {
  SymbolView,
  type AndroidSymbol,
  type SFSymbol,
} from "expo-symbols";
import androidRegular from "expo-symbols/androidWeights/regular";
import androidSemiBold from "expo-symbols/androidWeights/semiBold";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export default function TabsLayout() {
  const theme = useTheme();
  const colors = Colors[theme.mode];
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: 56 + bottomInset,
          paddingBottom: bottomInset + 2,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              color={color}
              focused={focused}
              name={{
                ios: "rectangle.grid.2x2",
                android: "dashboard",
                web: "dashboard",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              color={color}
              focused={focused}
              name={{ ios: "books.vertical", android: "folder", web: "folder" }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "AI",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              color={color}
              focused={focused}
              name={{
                ios: "cube",
                android: "deployed_code",
                web: "deployed_code",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              color={color}
              focused={focused}
              name={{ ios: "gearshape", android: "settings", web: "settings" }}
            />
          ),
        }}
      />
    </Tabs>
  );
}

function TabBarIcon({
  color,
  focused,
  name,
}: {
  color: ColorValue;
  focused: boolean;
  name: { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol };
}) {
  return (
    <SymbolView
      name={name}
      resizeMode="scaleAspectFit"
      size={22}
      tintColor={color}
      weight={{
        ios: focused ? "semibold" : "regular",
        android: focused ? androidSemiBold : androidRegular,
      }}
    />
  );
}
