import type { UiLanguage } from "@/localization/i18n";

/** The iOS interface is intentionally English-only. */
export function translateUiCopy(value: string, _language: UiLanguage): string {
  return value;
}
