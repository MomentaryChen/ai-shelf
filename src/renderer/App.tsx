import { useEffect, useMemo, useState, useTransition } from "react";
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
import { InventoryNav, type NavItem } from "./components/InventoryNav";
import { CommandPalette, type Command } from "./components/CommandPalette";
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
const TABS: NavItem<TabId>[] = TAB_IDS.map((id) => ({
  id,
  icon: TAB_ICONS[id],
  labelKey: TAB_LABEL_KEYS[id],
}));

const IS_MAC =
  typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");

export function App() {
  const { t } = useLocale();
  const [appMode, setAppMode] = useState<AppMode>("terminal");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  // Cmd/Ctrl+K toggles the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goTo = (tab: TabId) => {
    handleModeChange("inventory");
    setActiveTab(tab);
  };

  const commands = useMemo<Command[]>(() => {
    const navigate: Command[] = TABS.map((it) => ({
      id: `go-${it.id}`,
      title: `${t("cmd.go")} ${t(it.labelKey)}`,
      group: t("cmd.group.navigate"),
      icon: it.icon,
      keywords: it.id,
      run: () => goTo(it.id),
    }));
    const actions: Command[] = [
      {
        id: "mode-terminal",
        title: t("cmd.action.terminal"),
        group: t("cmd.group.actions"),
        icon: "🖥️",
        run: () => handleModeChange("terminal"),
      },
      {
        id: "mode-inventory",
        title: t("cmd.action.inventory"),
        group: t("cmd.group.actions"),
        icon: "📦",
        run: () => handleModeChange("inventory"),
      },
      {
        id: "refresh",
        title: t("cmd.action.refresh"),
        group: t("cmd.group.actions"),
        icon: "🔄",
        run: () => reload(),
      },
    ];
    return [...navigate, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <AppUpdateModal />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-bg-primary px-2">
        <AppModeSwitch mode={appMode} onChange={handleModeChange} disabled={!ready && scanning} />

        {appMode === "terminal" && (scanning || enriching) && hasData && (
          <span className="shrink-0 px-3 text-[11px] text-text-secondary">
            {scanning && t("app.detectingShort")}
            {scanning && enriching && " · "}
            {enriching && t("app.loadingModels")}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title={t("app.cmdk")}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text-primary"
          >
            <span>{t("app.cmdk")}</span>
            <kbd className="rounded border border-border-subtle bg-bg-card px-1 text-[10px] text-text-tertiary">
              {IS_MAC ? "⌘K" : "Ctrl K"}
            </kbd>
          </button>

          {appMode === "inventory" && (
            <button
              type="button"
              onClick={reload}
              disabled={scanning && !hasData}
              className="cursor-pointer rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-[11px] text-text-primary transition-colors duration-150 hover:border-accent hover:bg-bg-card disabled:opacity-50"
            >
              🔄 {t("app.refresh")}
            </button>
          )}
        </div>
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
          <div className="absolute inset-0 flex overflow-hidden">
            {hasData && (
              <InventoryNav
                items={TABS}
                active={activeTab}
                onSelect={setActiveTab}
                disabled={!tabsEnabled}
              />
            )}
            <main className="min-w-0 flex-1 overflow-y-auto px-6 pt-5 pb-10">
              <div className="mx-auto w-full max-w-[1400px]">
                {showSpinner && <Spinner label={t("app.detecting")} />}
                {error && !hasData && (
                  <p className="py-10 text-center text-text-secondary">
                    {t("app.loadInventoryFailed")}
                  </p>
                )}
                {hasData && (
                  <>
                    {activeTab === "overview" && (
                      <OverviewTab data={data} modelOverrides={modelOverrides} />
                    )}
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
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
