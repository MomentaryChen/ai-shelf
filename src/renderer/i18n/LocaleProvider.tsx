import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { applyAppTheme } from "../app-theme.js";
import { loadSettings, saveSettings, SETTINGS_KEY } from "../chat-settings.js";
import {
  DEFAULT_LOCALE,
  detectSystemLocale,
  resolveLocale,
  translate,
  type AppLocale,
  type MessageKey,
  type TranslateParams,
} from "./index.js";

export const LOCALE_CHANGE_EVENT = "aishelf-locale-change";

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readLocaleFromStorage(): AppLocale {
  const stored = loadSettings().locale;
  if (stored) return resolveLocale(stored);
  return detectSystemLocale();
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => readLocaleFromStorage());

  const syncFromStorage = useCallback(() => {
    const settings = loadSettings();
    setLocaleState(resolveLocale(settings.locale));
    applyAppTheme(settings.appTheme);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-Hans" : "en";
  }, [locale]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) syncFromStorage();
    };
    const onLocaleChange = () => syncFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCALE_CHANGE_EVENT, onLocaleChange);
    };
  }, [syncFromStorage]);

  const setLocale = useCallback((next: AppLocale) => {
    const settings = loadSettings();
    saveSettings({ ...settings, locale: next });
    setLocaleState(next);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, params) => translate(DEFAULT_LOCALE, key, params),
    };
  }
  return ctx;
}
