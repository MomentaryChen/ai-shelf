import type { AppLocale } from "../i18n/index.js";

function localeTag(locale: AppLocale): string | undefined {
  return locale === "zh" ? "zh-TW" : undefined;
}

export function formatSyncDateTime(iso: string, locale: AppLocale): string {
  return new Date(iso).toLocaleString(localeTag(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSyncDateTimeShort(iso: string, locale: AppLocale): string {
  return new Date(iso).toLocaleString(localeTag(locale), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
