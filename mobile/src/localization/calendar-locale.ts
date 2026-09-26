import { LocaleConfig } from "react-native-calendars";

import type { UiLanguage } from "@/localization/i18n";

const configuredLocales = new Set<UiLanguage>();

export function configureCalendarLocale(language: UiLanguage): void {
  if (!configuredLocales.has(language)) {
    const monthFormatter = new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" });
    const shortMonthFormatter = new Intl.DateTimeFormat(language, { month: "short", timeZone: "UTC" });
    const dayFormatter = new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" });
    const shortDayFormatter = new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" });

    LocaleConfig.locales[language] = {
      monthNames: Array.from({ length: 12 }, (_, month) => monthFormatter.format(new Date(Date.UTC(2020, month, 1)))),
      monthNamesShort: Array.from({ length: 12 }, (_, month) => shortMonthFormatter.format(new Date(Date.UTC(2020, month, 1)))),
      dayNames: Array.from({ length: 7 }, (_, day) => dayFormatter.format(new Date(Date.UTC(2020, 7, 2 + day)))),
      dayNamesShort: Array.from({ length: 7 }, (_, day) => shortDayFormatter.format(new Date(Date.UTC(2020, 7, 2 + day)))),
    };
    configuredLocales.add(language);
  }

  LocaleConfig.defaultLocale = language;
}
