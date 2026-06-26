import { SETTINGS_KEY, type ChatSettings } from "../chat-settings.js";
import {
  DEFAULT_LOCALE,
  normalizeLocalePreference,
  resolveLocalePreference,
  translate,
  type AppLocale,
  type MessageKey,
  type TranslateParams,
} from "./index.js";

export function getStoredLocale(): AppLocale {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<ChatSettings>;
    return resolveLocalePreference(normalizeLocalePreference(stored.locale));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function getStoredT(key: MessageKey, params?: TranslateParams): string {
  return translate(getStoredLocale(), key, params);
}
