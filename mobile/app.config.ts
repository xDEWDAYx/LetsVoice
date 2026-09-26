import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(["./plugins/with-local-notifications-only", "expo-notifications", "expo-sharing"] as const).filter(
      (plugin) => !(config.plugins ?? []).some((configured) =>
        Array.isArray(configured) ? configured[0] === plugin : configured === plugin,
      ),
    ),
  ],
  ios: {
    ...config.ios,
    bundleIdentifier:
      process.env.IOS_BUNDLE_IDENTIFIER?.trim() ||
      config.ios?.bundleIdentifier,
  },
});
