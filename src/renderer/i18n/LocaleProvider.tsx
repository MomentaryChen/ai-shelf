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
import { subscribeSystemAppearance } from "../system-appearance.js";
import {
  DEFAULT_LOCALE,
  normalizeLocalePreference,
  resolveLocalePreference,
  translate,
  type AppLocale,
  type LocalePreference,
  type MessageKey,
  type TranslateParams,
} from "./index.js";

export const LOCALE_CHANGE_EVENT = "aishelf-locale-change";

interface LocaleContextValue {
  /** Resolved locale used for copy and `t()`. */
  locale: AppLocale;
  /** Stored preference including "system". */
  localePreference: LocalePreference;
  setLocale: (preference: LocalePreference) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readLocalePreferenceFromStorage(): LocalePreference {
  return normalizeLocalePreference(loadSettings().locale);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [localePreference, setLocalePreference] = useState<LocalePreference>(() =>
    readLocalePreferenceFromStorage(),
  );
  const [appearanceTick, setAppearanceTick] = useState(0);

  const locale = useMemo(
    () => resolveLocalePreference(localePreference),
    [localePreference, appearanceTick],
  );

  const syncFromStorage = useCallback(() => {
    const settings = loadSettings();
    setLocalePreference(normalizeLocalePreference(settings.locale));
    applyAppTheme(settings.appTheme);
  }, []);

  useEffect(() => {
    return subscribeSystemAppearance(() => {
      setAppearanceTick((n) => n + 1);
      const settings = loadSettings();
      if (settings.appTheme === "system") applyAppTheme("system");
    });
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

  const setLocale = useCallback((next: LocalePreference) => {
    const settings = loadSettings();
    saveSettings({ ...settings, locale: next });
    setLocalePreference(next);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      localePreference,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, localePreference, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      localePreference: "system",
      setLocale: () => {},
      t: (key, params) => translate(DEFAULT_LOCALE, key, params),
    };
  }
  return ctx;
}
