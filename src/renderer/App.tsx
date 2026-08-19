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
import {
  BarChart3,
  Compass,
  FileText,
  Monitor,
  Package,
  Plug,
  RefreshCw,
  Stethoscope,
  Wrench,
  Zap,
} from "lucide-react";
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
import { registerShortcutCheatsheetOpener } from "./shortcuts/open-shortcuts";
import { cheatsheetToggleKeys } from "./shortcuts/shortcut-registry";
import {
  buildGlobalSearchCommands,
  mergePaletteCommands,
} from "./commands/build-global-search-commands";
import { shouldIgnoreShortcutForIme } from "./terminal/ime-keys";

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
const CodecToolsTab = lazy(() =>
  import("./components/CodecToolsTab").then((m) => ({ default: m.CodecToolsTab })),
);
const CryptoToolsTab = lazy(() =>
  import("./components/CryptoToolsTab").then((m) => ({ default: m.CryptoToolsTab })),
);
const TimeToolsTab = lazy(() =>
  import("./components/TimeToolsTab").then((m) => ({ default: m.TimeToolsTab })),
);
const CronToolsTab = lazy(() =>
  import("./components/CronToolsTab").then((m) => ({ default: m.CronToolsTab })),
);
const RegexToolsTab = lazy(() =>
  import("./components/RegexToolsTab").then((m) => ({ default: m.RegexToolsTab })),
);
const JsonToolsTab = lazy(() =>
  import("./components/JsonToolsTab").then((m) => ({ default: m.JsonToolsTab })),
);
const MarkdownToolsTab = lazy(() =>
  import("./components/MarkdownToolsTab").then((m) => ({ default: m.MarkdownToolsTab })),
);
const YamlJsonToolsTab = lazy(() =>
  import("./components/YamlJsonToolsTab").then((m) => ({ default: m.YamlJsonToolsTab })),
);
const JwtToolsTab = lazy(() =>
  import("./components/JwtToolsTab").then((m) => ({ default: m.JwtToolsTab })),
);
const UuidToolsTab = lazy(() =>
  import("./components/UuidToolsTab").then((m) => ({ default: m.UuidToolsTab })),
);
const DiffToolsTab = lazy(() =>
  import("./components/DiffToolsTab").then((m) => ({ default: m.DiffToolsTab })),
);
const PortsToolsTab = lazy(() =>
  import("./components/PortsToolsTab").then((m) => ({ default: m.PortsToolsTab })),
);
const SystemToolsTab = lazy(() =>
  import("./components/SystemToolsTab").then((m) => ({ default: m.SystemToolsTab })),
);
const AppUpdateModal = lazy(() =>
  import("./components/AppUpdateModal").then((m) => ({ default: m.AppUpdateModal })),
);
const OnboardingModal = lazy(() =>
  import("./components/OnboardingModal").then((m) => ({ default: m.OnboardingModal })),
);
const ChatTab = lazy(() => import("./components/ChatTab").then((m) => ({ default: m.ChatTab })));
const FlowTab = lazy(() => import("./components/FlowTab").then((m) => ({ default: m.FlowTab })));
const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);
const ShortcutCheatsheet = lazy(() =>
  import("./components/ShortcutCheatsheet").then((m) => ({ default: m.ShortcutCheatsheet })),
);

type TabId =
  | "overview"
  | "models"
  | "skills"
  | "mcp"
  | "config"
  | "doctor"
  | "update"
  | "usage";

type ToolId =
  | "codec"
  | "crypto"
  | "time"
  | "cron"
  | "regex"
  | "json"
  | "markdown"
  | "yaml"
  | "jwt"
  | "uuid"
  | "diff"
  | "system"
  | "ports";

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
        icon: <FileText className="h-4 w-4" />,
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
        icon: <Zap className="h-4 w-4" />,
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
        icon: <Plug className="h-4 w-4" />,
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
  icon: <span className="text-[14px] leading-none">{TAB_ICONS[id]}</span>,
  labelKey: TAB_LABEL_KEYS[id],
}));

const TOOL_ICONS: Record<ToolId, string> = {
  codec: "🔐",
  crypto: "🗝️",
  time: "🕒",
  cron: "⏰",
  regex: "🔤",
  json: "{}",
  markdown: "📝",
  yaml: "📄",
  jwt: "🪪",
  uuid: "🆔",
  diff: "≠",
  system: "💻",
  ports: "🔌",
};

const TOOL_LABEL_KEYS: Record<ToolId, MessageKey> = {
  codec: "tools.tab.codec",
  crypto: "tools.tab.crypto",
  time: "tools.tab.time",
  cron: "tools.tab.cron",
  regex: "tools.tab.regex",
  json: "tools.tab.json",
  markdown: "tools.tab.markdown",
  yaml: "tools.tab.yaml",
  jwt: "tools.tab.jwt",
  uuid: "tools.tab.uuid",
  diff: "tools.tab.diff",
  system: "tools.tab.system",
  ports: "tools.tab.ports",
};

const TOOL_IDS = Object.keys(TOOL_LABEL_KEYS) as ToolId[];
const TOOLS: NavItem<ToolId>[] = TOOL_IDS.map((id) => ({
  id,
  icon: <span className="text-[14px] leading-none">{TOOL_ICONS[id]}</span>,
  labelKey: TOOL_LABEL_KEYS[id],
}));

const IS_MAC =
  typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");

export function App() {
  const { t } = useLocale();
  const [appMode, setAppMode] = useState<AppMode>("terminal");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [activeTool, setActiveTool] = useState<ToolId>("codec");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  /** Bumped when the palette opens so `commands` re-reads the latest terminal ref. */
  const [paletteCommandsRev, setPaletteCommandsRev] = useState(0);
  const paletteOpenRef = useRef(false);
  paletteOpenRef.current = paletteOpen;
  const terminalCommandsRef = useRef<Command[]>([]);
  const registerTerminalCommands = useCallback((cmds: Command[]) => {
    terminalCommandsRef.current = cmds;
    if (paletteOpenRef.current) setPaletteCommandsRev((r) => r + 1);
  }, []);
  const [, startTransition] = useTransition();

  const openPalette = useCallback(() => {
    setCheatsheetOpen(false);
    setPaletteCommandsRev((r) => r + 1);
    setPaletteOpen(true);
  }, []);

  const togglePalette = useCallback(() => {
    setPaletteOpen((open) => {
      if (!open) {
        setCheatsheetOpen(false);
        setPaletteCommandsRev((r) => r + 1);
      }
      return !open;
    });
  }, []);

  const openCheatsheet = useCallback(() => {
    setPaletteOpen(false);
    setCheatsheetOpen(true);
  }, []);

  const closeCheatsheet = useCallback(() => setCheatsheetOpen(false), []);

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

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void window.api.getOnboardingCompleted().then((res) => {
      if (cancelled) return;
      if (res.success && !res.completed) setOnboardingOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const dismissOnboarding = useCallback(() => setOnboardingOpen(false), []);

  // Cmd/Ctrl+K toggles the command palette; Cmd/Ctrl+/ opens the shortcuts cheatsheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcutForIme(e)) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        e.stopPropagation();
        togglePalette();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        e.stopPropagation();
        openCheatsheet();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [togglePalette, openCheatsheet]);

  useEffect(() => {
    registerShortcutCheatsheetOpener(openCheatsheet);
    return () => registerShortcutCheatsheetOpener(null);
  }, [openCheatsheet]);

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

  const goToTool = (tool: ToolId) => {
    handleModeChange("tools");
    startTransition(() => setActiveTool(tool));
  };

  const selectTab = (tab: TabId) => {
    startTransition(() => setActiveTab(tab));
  };

  const selectTool = (tool: ToolId) => {
    startTransition(() => setActiveTool(tool));
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
        icon: <Monitor className="h-4 w-4" />,
        run: () => handleModeChange("terminal"),
      },
      {
        id: "mode-inventory",
        title: t("cmd.action.inventory"),
        group: t("cmd.group.actions"),
        icon: <Package className="h-4 w-4" />,
        run: () => handleModeChange("inventory"),
      },
      {
        id: "mode-tools",
        title: t("cmd.action.tools"),
        group: t("cmd.group.actions"),
        icon: <Wrench className="h-4 w-4" />,
        keywords:
          "tools codec crypto time cron regex json markdown yaml yml jwt uuid nanoid diff compare text hash base64 image aes rsa ecdsa md5 timestamp unix timezone schedule regexp match replace format minify pretty beautify mermaid flowchart preview convert ports listen system cpu memory gpu",
        run: () => handleModeChange("tools"),
      },
      {
        id: "mode-flow",
        title: t("cmd.action.flow"),
        group: t("cmd.group.actions"),
        icon: <Compass className="h-4 w-4" />,
        run: () => handleModeChange("flow"),
      },
      {
        id: "refresh",
        title: t("cmd.action.refresh"),
        group: t("cmd.group.actions"),
        icon: <RefreshCw className="h-4 w-4" />,
        run: () => reload(),
      },
      {
        id: "run-doctor",
        title: t("cmd.action.doctor"),
        group: t("cmd.group.actions"),
        icon: <Stethoscope className="h-4 w-4" />,
        keywords: "doctor health check",
        run: () => goTo("doctor"),
      },
      {
        id: "mcp-sync",
        title: t("cmd.action.mcpSync"),
        group: t("cmd.group.actions"),
        icon: <Plug className="h-4 w-4" />,
        keywords: "mcp sync servers",
        run: () => goTo("mcp"),
      },
      {
        id: "show-shortcuts",
        title: t("cmd.action.shortcuts"),
        group: t("cmd.group.actions"),
        icon: "⌨️",
        keywords: "keyboard shortcuts cheatsheet help",
        shortcut: cheatsheetToggleKeys(),
        run: () => openCheatsheet(),
      },
    ];
    return [...navigate, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, openCheatsheet]);

  const toolsCommands = useMemo<Command[]>(() => {
    const navigate: Command[] = TOOLS.map((it) => ({
      id: `go-tool-${it.id}`,
      title: `${t("cmd.go")} ${t(it.labelKey)}`,
      group: t("cmd.group.navigate"),
      icon: it.icon,
      keywords:
        it.id === "time"
          ? "time timestamp unix timezone utc epoch ms us ns iso"
          : it.id === "crypto"
            ? "crypto aes rsa ecdsa encrypt decrypt sign verify key pem"
            : it.id === "cron"
              ? "cron schedule expression timezone preset"
              : it.id === "regex"
                ? "regex regexp match replace flags capture preset pattern"
                : it.id === "json"
                  ? "json format minify pretty beautify validate sort keys"
                  : it.id === "markdown"
                    ? "markdown md preview mermaid flowchart diagram gfm"
                    : it.id === "yaml"
                      ? "yaml yml json convert config indent sort keys minify pretty"
                      : it.id === "jwt"
                        ? "jwt token decode verify encode hs256 rs256 es256 bearer claim"
                        : it.id === "uuid"
                          ? "uuid nanoid ulid generate validate v4 v7"
                          : it.id === "diff"
                            ? "diff compare text unified patch lines whitespace"
                            : it.id === "system"
                              ? "system info cpu memory ram network gpu nvidia host meter usage analyze report"
                              : it.id === "ports"
                                ? "port ports listen listener netstat lsof pid kill occupy 3000"
                                : "codec hash base64 image md5 tools",
      run: () => goToTool(it.id),
    }));
    const actions: Command[] = [
      {
        id: "mode-terminal",
        title: t("cmd.action.terminal"),
        group: t("cmd.group.actions"),
        icon: <Monitor className="h-4 w-4" />,
        run: () => handleModeChange("terminal"),
      },
      {
        id: "mode-inventory",
        title: t("cmd.action.inventory"),
        group: t("cmd.group.actions"),
        icon: <Package className="h-4 w-4" />,
        run: () => handleModeChange("inventory"),
      },
      {
        id: "mode-tools",
        title: t("cmd.action.tools"),
        group: t("cmd.group.actions"),
        icon: <Wrench className="h-4 w-4" />,
        keywords:
          "tools codec crypto time cron regex json markdown yaml yml jwt uuid nanoid diff compare text hash base64 image aes rsa ecdsa md5 timestamp unix timezone schedule regexp match replace format minify pretty beautify mermaid flowchart preview convert token decode verify ports listen system cpu memory gpu",
        run: () => handleModeChange("tools"),
      },
      {
        id: "mode-flow",
        title: t("cmd.action.flow"),
        group: t("cmd.group.actions"),
        icon: <Compass className="h-4 w-4" />,
        run: () => handleModeChange("flow"),
      },
      {
        id: "show-shortcuts",
        title: t("cmd.action.shortcuts"),
        group: t("cmd.group.actions"),
        icon: "⌨️",
        keywords: "keyboard shortcuts cheatsheet help",
        shortcut: cheatsheetToggleKeys(),
        run: () => openCheatsheet(),
      },
    ];
    return [...navigate, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, openCheatsheet]);

  const sharedModeCommands = useMemo<Command[]>(
    () => [
      {
        id: "mode-terminal",
        title: t("cmd.action.terminal"),
        group: t("cmd.group.actions"),
        icon: <Monitor className="h-4 w-4" />,
        run: () => handleModeChange("terminal"),
      },
      {
        id: "mode-inventory",
        title: t("cmd.action.inventory"),
        group: t("cmd.group.actions"),
        icon: <Package className="h-4 w-4" />,
        run: () => handleModeChange("inventory"),
      },
      {
        id: "mode-tools",
        title: t("cmd.action.tools"),
        group: t("cmd.group.actions"),
        icon: <Wrench className="h-4 w-4" />,
        keywords:
          "tools codec crypto time cron regex json markdown yaml yml jwt uuid nanoid diff compare text hash base64 image aes rsa ecdsa md5 timestamp unix timezone schedule regexp match replace format minify pretty beautify mermaid flowchart preview convert ports listen system cpu memory gpu",
        run: () => handleModeChange("tools"),
      },
      {
        id: "mode-flow",
        title: t("cmd.action.flow"),
        group: t("cmd.group.actions"),
        icon: <Compass className="h-4 w-4" />,
        run: () => handleModeChange("flow"),
      },
      {
        id: "show-shortcuts",
        title: t("cmd.action.shortcuts"),
        group: t("cmd.group.actions"),
        icon: "⌨️",
        keywords: "keyboard shortcuts cheatsheet help",
        shortcut: cheatsheetToggleKeys(),
        run: () => openCheatsheet(),
      },
    ],
    [t, openCheatsheet],
  );

  const requestTerminalMode = useCallback(() => {
    handleModeChange("terminal");
  }, []);

  // Built only while the palette is open — inventory search + profiles in every mode.
  const commands = useMemo<Command[]>(() => {
    if (!paletteOpen) return EMPTY_COMMANDS;

    const globalSearch = buildGlobalSearchCommands(inventoryDataRef.current, t, goTo);
    const terminalCommands = terminalCommandsRef.current;
    const modeBase =
      appMode === "terminal"
        ? mergePaletteCommands(
            terminalCommands,
            sharedModeCommands.filter(
              (c) => !terminalCommands.some((tc) => tc.id === c.id),
            ),
          )
        : appMode === "tools"
          ? mergePaletteCommands(toolsCommands, terminalCommands)
          : mergePaletteCommands(inventoryCommands, terminalCommands);

    return mergePaletteCommands(modeBase, globalSearch);
  }, [
    paletteOpen,
    paletteCommandsRev,
    appMode,
    sharedModeCommands,
    inventoryCommands,
    toolsCommands,
    t,
  ]);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <Suspense fallback={null}>
        <AppUpdateModal />
      </Suspense>
      {onboardingOpen && (
        <Suspense fallback={null}>
          <OnboardingModal
            open
            data={data}
            onComplete={dismissOnboarding}
            onSwitchMode={handleModeChange}
          />
        </Suspense>
      )}
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open commands={commands} onClose={closePalette} />
        </Suspense>
      )}
      {cheatsheetOpen && (
        <Suspense fallback={null}>
          <ShortcutCheatsheet
            open
            tone={appMode === "terminal" ? "chrome" : "default"}
            onClose={closeCheatsheet}
          />
        </Suspense>
      )}

      <header
        className={`flex h-9 shrink-0 items-center gap-1 border-b px-2 transition-colors duration-300 ${
          appMode === "terminal"
            ? "border-chrome-border bg-chrome-bg text-chrome-text"
            : "border-border bg-bg-primary text-text-primary"
        }`}
      >
        <AppModeSwitch mode={appMode} onChange={handleModeChange} />

        {appMode === "terminal" && (scanning || enriching) && (
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
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-[11px] text-text-primary transition-colors duration-150 hover:border-accent hover:bg-bg-card disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden
                className={`h-3 w-3 text-text-secondary ${scanning && hasData ? "animate-spin" : ""}`}
              />
              {t("app.refresh")}
            </button>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <main
          data-active={appMode === "terminal"}
          className="ui-mode-panel absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden"
        >
          <Suspense fallback={<Spinner label={t("profile.loading")} />}>
            <ChatTab
              data={data}
              active={appMode === "terminal"}
              inventoryScanning={scanning}
              onRegisterCommands={registerTerminalCommands}
              onRequestTerminalMode={requestTerminalMode}
            />
          </Suspense>
        </main>

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
          <main className="@container min-w-0 flex-1 overflow-y-auto px-3 pt-4 pb-8 sm:px-5 sm:pt-5 sm:pb-10 lg:px-6">
            <div className="mx-auto w-full max-w-[1400px]">
              <ViewTransition viewKey={activeTab}>
                {showSpinner && activeTab !== "usage" && <Spinner label={t("app.detecting")} />}
                {error && !hasData && activeTab !== "usage" && (
                  <p className="py-10 text-center text-text-secondary">
                    {t("app.loadInventoryFailed")}
                  </p>
                )}
                {hasData && (
                  <Suspense fallback={<Spinner label={t("profile.loading")} />}>
                    {activeTab === "overview" && (
                      <OverviewTab
                        data={data}
                        modelOverrides={modelOverrides}
                        healthState={healthState}
                        onGoDoctor={() => goTo("doctor")}
                        onGoUpdate={() => goTo("update")}
                        onRefreshHealth={refreshHealth}
                        onRefresh={reload}
                      />
                    )}
                    {activeTab === "models" && <ModelsTab data={data} />}
                    {activeTab === "skills" && (
                      <SkillsTab data={data} onOpenMcpSync={() => selectTab("mcp")} />
                    )}
                    {activeTab === "mcp" && <McpTab data={data} />}
                    {activeTab === "config" && <ConfigTab data={data} onRefresh={reload} />}
                    {activeTab === "doctor" && <DoctorTab data={data} onRefresh={reload} />}
                    {activeTab === "update" && <UpdateTab data={data} onRefresh={reload} />}
                  </Suspense>
                )}
                {activeTab === "usage" && (
                  <Suspense fallback={<Spinner label={t("profile.loading")} />}>
                    <UsageTab />
                  </Suspense>
                )}
              </ViewTransition>
            </div>
          </main>
        </div>

        <div
          data-active={appMode === "tools"}
          className="ui-mode-panel absolute inset-0 flex overflow-hidden"
        >
          <InventoryNav
            items={TOOLS}
            active={activeTool}
            onSelect={selectTool}
            sectionLabelKey="app.nav.tools"
          />
          <main className="@container min-w-0 flex-1 overflow-y-auto px-3 pt-4 pb-8 sm:px-5 sm:pt-5 sm:pb-10 lg:px-6">
            <div className="mx-auto w-full max-w-[1400px]">
              <ViewTransition viewKey={activeTool}>
                <Suspense fallback={<Spinner label={t("profile.loading")} />}>
                  {activeTool === "codec" && <CodecToolsTab />}
                  {activeTool === "crypto" && <CryptoToolsTab />}
                  {activeTool === "time" && <TimeToolsTab />}
                  {activeTool === "cron" && <CronToolsTab />}
                  {activeTool === "regex" && <RegexToolsTab />}
                  {activeTool === "json" && <JsonToolsTab />}
                  {activeTool === "markdown" && <MarkdownToolsTab />}
                  {activeTool === "yaml" && <YamlJsonToolsTab />}
                  {activeTool === "jwt" && <JwtToolsTab />}
                  {activeTool === "uuid" && <UuidToolsTab />}
                  {activeTool === "diff" && <DiffToolsTab />}
                  {activeTool === "system" && <SystemToolsTab active={appMode === "tools"} />}
                  {activeTool === "ports" && <PortsToolsTab active={appMode === "tools"} />}
                </Suspense>
              </ViewTransition>
            </div>
          </main>
        </div>

        <div
          data-active={appMode === "flow"}
          className="ui-mode-panel absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden"
        >
          <Suspense fallback={<Spinner label={t("flow.loading")} />}>
            <FlowTab />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
