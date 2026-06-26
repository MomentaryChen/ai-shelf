import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Spinner } from "./components/Spinner";
import { AppModeSwitch, type AppMode } from "./components/AppModeSwitch";
import { InventoryNav, type NavItem } from "./components/InventoryNav";
import type { Command } from "./components/CommandPalette";
import { ViewTransition } from "./components/ViewTransition";
import { useInventoryScan } from "./hooks/useInventoryScan";
import { useHealthMonitor } from "./hooks/useHealthMonitor";
import { useLocale } from "./i18n/LocaleProvider";
import type { MessageKey } from "./i18n/messages/en";
import type { ProviderEntry } from "./types";

const OverviewTab = lazy(() =>
  import("./components/OverviewTab").then((m) => ({ default: m.OverviewTab })),
);
const ModelsTab = lazy(() =>
  import("./components/ModelsTab").then((m) => ({ default: m.ModelsTab })),
);
const SkillsTab = lazy(() =>
  import("./components/SkillsTab").then((m) => ({ default: m.SkillsTab })),
);
const McpTab = lazy(() => import("./components/McpTab").then((m) => ({ default: m.McpTab })));
const ConfigTab = lazy(() =>
  import("./components/ConfigTab").then((m) => ({ default: m.ConfigTab })),
);
const DoctorTab = lazy(() =>
  import("./components/DoctorTab").then((m) => ({ default: m.DoctorTab })),
);
const UpdateTab = lazy(() =>
  import("./components/UpdateTab").then((m) => ({ default: m.UpdateTab })),
);
const UsageTab = lazy(() =>
  import("./components/UsageTab").then((m) => ({ default: m.UsageTab })),
);
const AppUpdateModal = lazy(() =>
  import("./components/AppUpdateModal").then((m) => ({ default: m.AppUpdateModal })),
);
const ChatTab = lazy(() => import("./components/ChatTab").then((m) => ({ default: m.ChatTab })));
const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);

type TabId = "overview" | "models" | "skills" | "mcp" | "config" | "doctor" | "update" | "usage";

const EMPTY_COMMANDS: Command[] = [];

function buildGlobalCommands(
  data: ProviderEntry[],
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  goTo: (tab: TabId) => void,
): Command[] {
  const basename = (p: string) => p.split(/[\\/]/).pop() || p;

  const configSeen = new Set<string>();
  const configCommands: Command[] = [];
  for (const entry of data) {
    const paths = [...entry.config.paths, ...entry.config.instructionFiles, ...entry.mcp.configPaths];
    for (const path of paths) {
      if (configSeen.has(path)) continue;
      configSeen.add(path);
      configCommands.push({
        id: `open-config-${path}`,
        title: t("cmd.openConfig", { name: basename(path) }),
        group: t("cmd.group.config"),
        icon: "📄",
        keywords: `${entry.tool} config ${path}`,
        hideWhenEmpty: true,
        run: () => void window.api.openPath(path),
      });
    }
  }

  const skillSeen = new Set<string>();
  const skillCommands: Command[] = [];
  for (const entry of data) {
    for (const skill of entry.skills) {
      if (skillSeen.has(skill)) continue;
      skillSeen.add(skill);
      skillCommands.push({
        id: `find-skill-${skill}`,
        title: t("cmd.skillSearch", { name: skill }),
        group: t("cmd.group.skills"),
        icon: "⚡",
        keywords: `skill ${skill}`,
        hideWhenEmpty: true,
        run: () => goTo("skills"),
      });
    }
  }

  const mcpSeen = new Set<string>();
  const mcpCommands: Command[] = [];
  for (const entry of data) {
    for (const server of entry.mcp.servers) {
      if (mcpSeen.has(server)) continue;
      mcpSeen.add(server);
      mcpCommands.push({
        id: `find-mcp-${server}`,
        title: t("cmd.mcpSearch", { name: server }),
        group: t("cmd.group.mcp"),
        icon: "🔌",
        keywords: `mcp server ${server}`,
        hideWhenEmpty: true,
        run: () => goTo("mcp"),
      });
    }
  }

  return [...configCommands, ...skillCommands, ...mcpCommands];
}

const TAB_ICONS: Record<TabId, string> = {
  overview: "📋",
  models: "🧠",
  skills: "⚡",
  mcp: "🔌",
  config: "⚙️",
  doctor: "🩺",
  update: "🔄",
  usage: "📊",
};

const TAB_LABEL_KEYS: Record<TabId, MessageKey> = {
  overview: "app.tab.overview",
  models: "app.tab.models",
  skills: "app.tab.skills",
  mcp: "app.tab.mcp",
  config: "app.tab.config",
  doctor: "app.tab.doctor",
  update: "app.tab.update",
  usage: "app.tab.usage",
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
  /** Bumped when the palette opens so `commands` re-reads the latest terminal ref. */
  const [paletteCommandsRev, setPaletteCommandsRev] = useState(0);
  const terminalCommandsRef = useRef<Command[]>([]);
  const registerTerminalCommands = useCallback((cmds: Command[]) => {
    terminalCommandsRef.current = cmds;
  }, []);
  const [, startTransition] = useTransition();

  const openPalette = useCallback(() => {
    setPaletteCommandsRev((r) => r + 1);
    setPaletteOpen(true);
  }, []);

  const togglePalette = useCallback(() => {
    setPaletteOpen((open) => {
      if (!open) setPaletteCommandsRev((r) => r + 1);
      return !open;
    });
  }, []);

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
  const inventoryDataRef = useRef(data);
  inventoryDataRef.current = data;

  const { state: healthState, refresh: refreshHealth } = useHealthMonitor();

  const navBadges = useMemo(() => {
    if (!healthState?.prefs.backgroundChecksEnabled) return undefined;
    const badges: Partial<Record<TabId, number>> = {};
    const doctorCount =
      healthState.doctorSummary.failCount + healthState.doctorSummary.warnCount;
    if (doctorCount > 0) badges.doctor = doctorCount;
    if (healthState.outdatedTools.length > 0) {
      badges.update = healthState.outdatedTools.length;
    }
    return Object.keys(badges).length > 0 ? badges : undefined;
  }, [healthState]);

  const tabsEnabled = ready;
  const showSpinner = scanning && !hasData && !error;

  // Cmd/Ctrl+K toggles the command palette from anywhere (capture so xterm does not eat it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        e.stopPropagation();
        togglePalette();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [togglePalette]);

  useEffect(() => {
    if (appMode === "terminal") {
      document.documentElement.dataset.surfaceContext = "chrome";
    } else {
      delete document.documentElement.dataset.surfaceContext;
    }
    return () => {
      delete document.documentElement.dataset.surfaceContext;
    };
  }, [appMode]);

  const goTo = (tab: TabId) => {
    handleModeChange("inventory");
    startTransition(() => setActiveTab(tab));
  };

  const selectTab = (tab: TabId) => {
    startTransition(() => setActiveTab(tab));
  };

  const inventoryCommands = useMemo<Command[]>(() => {
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
      {
        id: "run-doctor",
        title: t("cmd.action.doctor"),
        group: t("cmd.group.actions"),
        icon: "🩺",
        keywords: "doctor health check",
        run: () => goTo("doctor"),
      },
      {
        id: "mcp-sync",
        title: t("cmd.action.mcpSync"),
        group: t("cmd.group.actions"),
        icon: "🔌",
        keywords: "mcp sync servers",
        run: () => goTo("mcp"),
      },
    ];
    return [...navigate, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const sharedModeCommands = useMemo<Command[]>(
    () => [
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
    ],
    [t],
  );

  // Built only while the palette is open — avoids re-merging commands on every inventory tick.
  const commands = useMemo<Command[]>(() => {
    if (!paletteOpen) return EMPTY_COMMANDS;

    const globalCommands = buildGlobalCommands(inventoryDataRef.current, t, goTo);
    const base =
      appMode === "terminal"
        ? (() => {
            const terminalCommands = terminalCommandsRef.current;
            const terminalIds = new Set(terminalCommands.map((c) => c.id));
            const extras = sharedModeCommands.filter((c) => !terminalIds.has(c.id));
            return [...terminalCommands, ...extras];
          })()
        : inventoryCommands;
    const baseIds = new Set(base.map((c) => c.id));
    return [...base, ...globalCommands.filter((c) => !baseIds.has(c.id))];
  }, [paletteOpen, paletteCommandsRev, appMode, sharedModeCommands, inventoryCommands, t]);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <Suspense fallback={null}>
        <AppUpdateModal />
      </Suspense>
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open commands={commands} onClose={closePalette} />
        </Suspense>
      )}

      <header
        className={`flex h-9 shrink-0 items-center gap-1 border-b px-2 transition-colors duration-300 ${
          appMode === "terminal"
            ? "border-chrome-border bg-chrome-bg text-chrome-text"
            : "border-border bg-bg-primary text-text-primary"
        }`}
      >
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
            onClick={openPalette}
            title={t("app.cmdk")}
            className={`flex cursor-pointer items-center gap-1.5 rounded-[22px] border px-2 py-1 text-[11px] transition-colors duration-150 ${
              appMode === "terminal"
                ? "border-chrome-border-strong bg-chrome-surface text-chrome-text-secondary hover:border-chrome-border-hover hover:bg-chrome-hover hover:text-chrome-text"
                : "border-border bg-bg-secondary text-text-secondary hover:border-border-strong hover:text-text-primary"
            }`}
          >
            <span>{t("app.cmdk")}</span>
            <kbd
              className={`rounded border px-1 text-[10px] ${
                appMode === "terminal"
                  ? "border-chrome-border-subtle bg-chrome-surface-raised text-chrome-text-faint"
                  : "border-border-subtle bg-bg-card text-text-tertiary"
              }`}
            >
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
          <div className="absolute inset-0 flex items-center justify-center bg-chrome-bg">
            <Spinner label={t("app.detecting")} />
          </div>
        )}
        {error && !hasData && appMode === "terminal" && (
          <p className="absolute inset-0 flex items-center justify-center bg-chrome-bg text-chrome-text-muted">
            {t("app.loadInventoryFailed")}
          </p>
        )}

        {ready && (
          <main
            data-active={appMode === "terminal"}
            className="ui-mode-panel absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden"
          >
            <Suspense fallback={<Spinner label={t("app.detecting")} />}>
              <ChatTab
                data={data}
                active={appMode === "terminal"}
                inventoryScanning={scanning}
                onRegisterCommands={registerTerminalCommands}
              />
            </Suspense>
          </main>
        )}

        {ready && (
          <div
            data-active={appMode === "inventory"}
            className="ui-mode-panel absolute inset-0 flex overflow-hidden"
          >
            <InventoryNav
              items={TABS}
              active={activeTab}
              onSelect={selectTab}
              disabled={!tabsEnabled && activeTab !== "usage"}
              badges={navBadges}
            />
            <main className="min-w-0 flex-1 overflow-y-auto px-6 pt-5 pb-10">
              <div className="mx-auto w-full max-w-[1400px]">
                <ViewTransition viewKey={activeTab}>
                  {showSpinner && <Spinner label={t("app.detecting")} />}
                  {error && !hasData && (
                    <p className="py-10 text-center text-text-secondary">
                      {t("app.loadInventoryFailed")}
                    </p>
                  )}
                  {hasData && (
                    <Suspense fallback={<Spinner label={t("app.detecting")} />}>
                      {activeTab === "overview" && (
                        <OverviewTab
                          data={data}
                          modelOverrides={modelOverrides}
                          healthState={healthState}
                          onGoDoctor={() => goTo("doctor")}
                          onGoUpdate={() => goTo("update")}
                          onRefreshHealth={refreshHealth}
                        />
                      )}
                      {activeTab === "models" && <ModelsTab data={data} />}
                      {activeTab === "skills" && (
                        <SkillsTab data={data} onOpenMcpSync={() => selectTab("mcp")} />
                      )}
                      {activeTab === "mcp" && <McpTab data={data} />}
                      {activeTab === "config" && <ConfigTab data={data} onRefresh={reload} />}
                      {activeTab === "doctor" && <DoctorTab data={data} />}
                      {activeTab === "update" && <UpdateTab data={data} />}
                    </Suspense>
                  )}
                  {activeTab === "usage" && (
                    <Suspense fallback={<Spinner label={t("app.detecting")} />}>
                      <UsageTab />
                    </Suspense>
                  )}
                </ViewTransition>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
