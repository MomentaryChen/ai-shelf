import { en, type MessageKey } from "./messages/en.js";
import { zh } from "./messages/zh.js";

export type AppLocale = "en" | "zh";

export type LocalePreference = "system" | AppLocale;

export const DEFAULT_LOCALE: AppLocale = "en";

export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = "system";

const MESSAGES: Record<AppLocale, Record<MessageKey, string>> = { en, zh };

export function normalizeLocalePreference(raw: unknown): LocalePreference {
  if (raw === "system" || raw === "en" || raw === "zh") return raw;
  return DEFAULT_LOCALE_PREFERENCE;
}

export function resolveLocalePreference(pref: LocalePreference): AppLocale {
  if (pref === "system") return detectSystemLocale();
  return pref;
}

/** @deprecated Use normalizeLocalePreference + resolveLocalePreference. */
export function resolveLocale(raw: unknown): AppLocale {
  return resolveLocalePreference(normalizeLocalePreference(raw));
}

export function detectSystemLocale(): AppLocale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

export type TranslateParams = Record<string, string | number>;

export function translate(locale: AppLocale, key: MessageKey, params?: TranslateParams): string {
  let text = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export type { MessageKey };
