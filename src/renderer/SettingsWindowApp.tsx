import { useEffect, useRef, useState } from "react";
import { Archive, Bell, Keyboard, Palette, Settings, Terminal } from "lucide-react";
import {
  ChatSettingsPanel,
  SETTINGS_CATEGORIES,
  type SettingsCategoryId,
} from "./components/ChatSettingsPanel";
import { useLocale } from "./i18n/LocaleProvider";

const SETTINGS_PANEL_ID = "settings-category-panel";

const CATEGORY_ICONS = {
  appearance: Palette,
  terminal: Terminal,
  shortcuts: Keyboard,
  alerts: Bell,
  backup: Archive,
} as const;

export function SettingsWindowApp() {
  const { t } = useLocale();
  const [category, setCategory] = useState<SettingsCategoryId>("appearance");
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [category]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <header className="border-b border-sand bg-bg-secondary px-5 py-5">
        <div>
          <h1 className="flex items-center gap-2 text-[17px] font-semibold">
            <Settings aria-hidden className="h-[18px] w-[18px] text-accent" />
            {t("settings.title")}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">{t("settings.subtitle")}</p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          className="flex w-[148px] shrink-0 flex-col gap-1 border-r border-sand bg-bg-secondary px-2 py-3"
          role="tablist"
          aria-label={t("settings.categories")}
        >
          {SETTINGS_CATEGORIES.map((item) => {
            const Icon = CATEGORY_ICONS[item.id];
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`settings-tab-${item.id}`}
                aria-controls={SETTINGS_PANEL_ID}
                aria-selected={active}
                onClick={() => {
                  setCategory(item.id);
                }}
                className={`flex min-h-9 items-center gap-2 rounded-[22px] px-3 text-left text-[13px] font-medium whitespace-nowrap transition-colors duration-200 ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:bg-sand hover:text-text-primary"
                }`}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>
        <main
          ref={panelRef}
          id={SETTINGS_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`settings-tab-${category}`}
          className="flex-1 overflow-y-auto px-5 py-6"
        >
          <ChatSettingsPanel category={category} />
        </main>
      </div>
    </div>
  );
}
