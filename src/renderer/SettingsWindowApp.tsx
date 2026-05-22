import { ChatSettingsPanel } from "./components/ChatSettingsPanel";
import { useLocale } from "./i18n/LocaleProvider";

export function SettingsWindowApp() {
  const { t } = useLocale();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <header className="border-b border-border bg-bg-secondary px-6 py-4">
        <div>
          <h1 className="text-[15px] font-semibold">⚙️ {t("settings.title")}</h1>
          <p className="mt-0.5 text-[12px] text-text-secondary">{t("settings.subtitle")}</p>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <ChatSettingsPanel />
      </main>
    </div>
  );
}
