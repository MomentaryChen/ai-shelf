import { useState, useTransition } from "react";
import { Spinner } from "./components/Spinner";
import { OverviewTab } from "./components/OverviewTab";
import { ModelsTab } from "./components/ModelsTab";
import { SkillsTab } from "./components/SkillsTab";
import { McpTab } from "./components/McpTab";
import { ConfigTab } from "./components/ConfigTab";
import { DoctorTab } from "./components/DoctorTab";
import { UpdateTab } from "./components/UpdateTab";
import { AppUpdateModal } from "./components/AppUpdateModal";
import { ChatTab } from "./components/ChatTab";
import { AppModeSwitch, type AppMode } from "./components/AppModeSwitch";
import { useInventoryScan } from "./hooks/useInventoryScan";
import { useLocale } from "./i18n/LocaleProvider";
import type { MessageKey } from "./i18n/messages/en";

type TabId = "overview" | "models" | "skills" | "mcp" | "config" | "doctor" | "update";

const TAB_ICONS: Record<TabId, string> = {
  overview: "📋",
  models: "🧠",
  skills: "⚡",
  mcp: "🔌",
  config: "⚙️",
  doctor: "🩺",
  update: "🔄",
};

const TAB_LABEL_KEYS: Record<TabId, MessageKey> = {
  overview: "app.tab.overview",
  models: "app.tab.models",
  skills: "app.tab.skills",
  mcp: "app.tab.mcp",
  config: "app.tab.config",
  doctor: "app.tab.doctor",
  update: "app.tab.update",
};

const TAB_IDS = Object.keys(TAB_LABEL_KEYS) as TabId[];

export function App() {
  const { t } = useLocale();
  const [appMode, setAppMode] = useState<AppMode>("terminal");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [, startTransition] = useTransition();

  function handleModeChange(mode: AppMode) {
    startTransition(() => setAppMode(mode));
  }

  const {
    data,
    scanning,
    enriching,
    error,
    hasData,
    ready,
    modelOverrides,
    setModelOverrides,
    reload,
  } = useInventoryScan();

  const tabsEnabled = ready;
  const showSpinner = scanning && !hasData && !error;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <AppUpdateModal />
      <header className="flex h-8 shrink-0 items-center border-b border-border bg-bg-primary px-1">
        <AppModeSwitch mode={appMode} onChange={handleModeChange} disabled={!ready && scanning} />

        {appMode === "inventory" && (
          <>
            <div className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              {TAB_IDS.map((tabId) => (
                <button
                  key={tabId}
                  disabled={!tabsEnabled}
                  onClick={() => setActiveTab(tabId)}
                  className={`shrink-0 rounded px-2 py-1 font-sans text-[11px] transition-colors duration-150 ${
                    !tabsEnabled
                      ? "cursor-not-allowed text-text-secondary opacity-40"
                      : activeTab === tabId
                        ? "cursor-pointer bg-bg-secondary font-medium text-accent"
                        : "cursor-pointer text-text-secondary hover:bg-bg-secondary/60 hover:text-text-primary"
                  }`}
                >
                  {TAB_ICONS[tabId]} {t(TAB_LABEL_KEYS[tabId])}
                </button>
              ))}
            </nav>
          </>
        )}

        {appMode === "terminal" && (scanning || enriching) && hasData && (
          <span className="shrink-0 px-3 text-[11px] text-text-secondary">
            {scanning && t("app.detectingShort")}
            {scanning && enriching && " · "}
            {enriching && t("app.loadingModels")}
          </span>
        )}

        {appMode === "inventory" && (
          <div className="ml-auto flex shrink-0 items-center px-3">
            <button
              type="button"
              onClick={reload}
              disabled={scanning && !hasData}
              className="cursor-pointer rounded border border-border bg-bg-secondary px-2.5 py-1 font-sans text-[11px] text-text-primary transition-colors duration-150 hover:border-accent hover:bg-bg-card disabled:opacity-50"
            >
              🔄 {t("app.refresh")}
            </button>
          </div>
        )}
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {showSpinner && appMode === "terminal" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner label={t("app.detecting")} />
          </div>
        )}
        {error && !hasData && appMode === "terminal" && (
          <p className="absolute inset-0 flex items-center justify-center text-text-secondary">
            {t("app.loadInventoryFailed")}
          </p>
        )}

        {hasData && (
          <main
            className={`absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden ${
              appMode === "terminal" ? "" : "hidden"
            }`}
          >
            <ChatTab data={data} active={appMode === "terminal"} inventoryScanning={scanning} />
          </main>
        )}

        {appMode === "inventory" && (
          <div className="absolute inset-0 flex flex-col overflow-hidden">
            <main className="mx-auto w-full max-w-[1000px] flex-1 overflow-y-auto px-8 pb-6 pt-4">
              {showSpinner && <Spinner label={t("app.detecting")} />}
              {error && !hasData && (
                <p className="py-10 text-center text-text-secondary">{t("app.loadInventoryFailed")}</p>
              )}
              {hasData && (
                <>
                  {activeTab === "overview" && <OverviewTab data={data} modelOverrides={modelOverrides} />}
                  {activeTab === "models" && <ModelsTab data={data} />}
                  {activeTab === "skills" && (
                    <SkillsTab data={data} onOpenMcpSync={() => setActiveTab("mcp")} />
                  )}
                  {activeTab === "mcp" && <McpTab data={data} />}
                  {activeTab === "config" && <ConfigTab data={data} />}
                  {activeTab === "doctor" && <DoctorTab data={data} />}
                  {activeTab === "update" && <UpdateTab data={data} />}
                </>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
