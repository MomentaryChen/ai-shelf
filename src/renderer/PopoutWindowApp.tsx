import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Undo2, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmbeddedTerminal } from "./components/EmbeddedTerminal";
import { BusyPaneCloseDialog } from "./components/BusyPaneCloseDialog";
import { TerminalStatusBar } from "./components/TerminalStatusBar";
import { PaneGitBranch } from "./components/TerminalGitStatus";
import { ToolLogo } from "./components/ToolLogo";
import { applyAppTheme, useAppThemeRevision } from "./app-theme";
import {
  getAppBg,
  isAppThemeTerminalBg,
  loadSettings,
  subscribeSettingsChanges,
  type ChatSettings,
} from "./chat-settings";
import { useLocale } from "./i18n/LocaleProvider";
import { formatPaneCwdShort } from "./utils/pane-cwd";
import { profilePaneHeaderStyle } from "./utils/profile-colors";
import type { PanePopoutInfo } from "./types";
import type { PaneInfo } from "./terminal/split-tree";

const SIDEBAR_COLLAPSED_KEY = "aishelf.popout.sidebarCollapsed";

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** `"window"` = the whole pop-out (window X); otherwise the pane id being closed. */
type ConfirmCloseTarget = "window" | string;

/**
 * Terminal panes popped out of a terminal window (multi-monitor use). The
 * window starts with one pane and can open more ("new terminal"), listed in a
 * collapsible sidebar. PTYs stay in the main process and the origin window
 * keeps owning the panes (layout, persistence); this window attaches to the
 * sessions and owns their size / input until they are docked back or closed.
 */
export function PopoutWindowApp() {
  const { t } = useLocale();
  const [info, setInfo] = useState<PanePopoutInfo | null | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  /** OSC 7 cwd per pane id (fresher than what main pushed with the pane list). */
  const [cwds, setCwds] = useState<Record<string, string>>({});
  const [confirmClose, setConfirmClose] = useState<ConfirmCloseTarget | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useAppThemeRevision();

  useEffect(() => {
    document.documentElement.dataset.surfaceContext = "chrome";
    return () => {
      delete document.documentElement.dataset.surfaceContext;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    /** A push that lands before the first fetch resolves is newer than the fetch. */
    let pushed = false;
    const apply = (next: PanePopoutInfo | null) => {
      setInfo(next);
      if (next?.activePaneId) setActiveId(next.activePaneId);
    };
    void window.api.panePopoutInfo().then((r) => {
      if (!cancelled && !pushed) apply(r);
    });
    const unsub = window.api.onPanePopoutPanes((next) => {
      pushed = true;
      apply(next);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(
    () =>
      subscribeSettingsChanges(() => {
        const next = loadSettings();
        setSettings(next);
        applyAppTheme(next.appTheme);
      }),
    [],
  );

  // Main asks before closing the window while an agent in it is still busy (window X).
  useEffect(() => window.api.onPanePopoutConfirmClose(() => setConfirmClose("window")), []);

  const panes = useMemo(
    () =>
      (info?.panes ?? []).map(({ pane, label }) => ({
        pane: { ...pane, cwd: cwds[pane.id] || pane.cwd } as PaneInfo,
        label,
      })),
    [info, cwds],
  );
  const active = panes.find((p) => p.pane.id === activeId) ?? panes[0] ?? null;
  const activePaneId = active?.pane.id ?? null;

  useEffect(() => {
    if (active) document.title = active.label;
  }, [active]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const pasteConfirm = useMemo(
    () => ({
      enabled: settings.terminalPasteConfirm,
      maxLines: settings.terminalPasteConfirmMaxLines,
      maxChars: settings.terminalPasteConfirmMaxChars,
      alwaysWhenBroadcast: settings.terminalPasteConfirmBroadcast,
    }),
    [
      settings.terminalPasteConfirm,
      settings.terminalPasteConfirmMaxLines,
      settings.terminalPasteConfirmMaxChars,
      settings.terminalPasteConfirmBroadcast,
    ],
  );

  const panesRef = useRef(panes);
  panesRef.current = panes;

  const reportCwd = useCallback((sessionId: string, next: string) => {
    const trimmed = next.trim();
    const paneId = panesRef.current.find((p) => p.pane.sessionId === sessionId)?.pane.id;
    if (!trimmed || !paneId) return;
    setCwds((prev) => (prev[paneId] === trimmed ? prev : { ...prev, [paneId]: trimmed }));
    window.api.panePopoutReportCwd(paneId, trimmed);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable — the choice just does not persist */
      }
      return next;
    });
  };

  const newTerminal = async () => {
    if (adding || !activePaneId) return;
    setAdding(true);
    setNotice(null);
    try {
      const result = await window.api.panePopoutNewPane(activePaneId);
      if (!result.ok) setNotice(result.error ?? t("pane.popout.newFailed"));
    } catch {
      setNotice(t("pane.popout.newFailed"));
    } finally {
      setAdding(false);
    }
  };

  const closePane = async (paneId: string) => {
    const result = await window.api.panePopoutClose(paneId);
    if (!result.ok && result.busy) setConfirmClose(paneId);
  };

  const useAppThemeBg = isAppThemeTerminalBg(settings.terminalBg);
  const bg = useAppThemeBg ? getAppBg() : settings.terminalBg;

  if (info === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-chrome-bg text-[12px] text-chrome-text-dim">
        {t("pane.popout.loading")}
      </div>
    );
  }
  if (!info || !active) {
    return (
      <div className="flex h-screen items-center justify-center bg-chrome-bg text-[12px] text-chrome-text-dim">
        {t("pane.popout.missing")}
      </div>
    );
  }

  const cwdShort = formatPaneCwdShort(active.pane.cwd);
  const iconButton =
    "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-chrome-text-muted transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text disabled:cursor-default disabled:opacity-50";

  return (
    <TooltipProvider>
      <div
        className="flex h-screen flex-col overflow-hidden bg-chrome-bg text-chrome-text"
        data-surface="chrome"
      >
        <div
          className="flex h-9 shrink-0 items-center gap-1.5 border-b px-2"
          style={profilePaneHeaderStyle(info.accentColor, true)}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            className={iconButton}
            title={t(sidebarCollapsed ? "sidebar.expand" : "sidebar.collapse")}
            aria-label={t(
              sidebarCollapsed ? "sidebar.expand" : "sidebar.collapse",
            )}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-chrome-border-subtle bg-chrome-surface-raised">
            <ToolLogo tool={active.pane.tool} size={14} />
          </span>
          <span className="min-w-0 max-w-[45%] shrink truncate text-[12px] font-medium text-chrome-text">
            {active.label}
          </span>
          <PaneGitBranch cwd={active.pane.cwd} />
          <span
            className="min-w-0 flex-1 truncate text-[11px] text-chrome-text-subtle"
            title={active.pane.cwd}
          >
            {cwdShort || "~"}
          </span>
          <button
            type="button"
            onClick={() => void window.api.panePopoutDock(active.pane.id)}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] text-chrome-text-muted transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            {t("pane.popout.dock")}
          </button>
        </div>
        {notice && (
          <div
            role="alert"
            className="flex shrink-0 items-center gap-2 border-b border-chrome-border-subtle bg-chrome-surface-raised px-3 py-1.5 text-[11px] text-chrome-text"
          >
            <span className="min-w-0 flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className={iconButton}
              aria-label={t("pane.popout.dismiss")}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label={t("pane.popout.sidebarLabel")}
            className={`flex shrink-0 flex-col border-r border-chrome-border-subtle bg-chrome-surface ${
              sidebarCollapsed ? "w-10" : "w-44"
            }`}
          >
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
              {panes.map(({ pane, label }) => {
                const isActive = pane.id === active.pane.id;
                return (
                  <li key={pane.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setActiveId(pane.id)}
                      title={sidebarCollapsed ? label : pane.cwd || label}
                      aria-current={isActive ? "true" : undefined}
                      className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md text-left text-[12px] transition-colors ${
                        sidebarCollapsed ? "justify-center px-0" : "px-2 pr-7"
                      } ${
                        isActive
                          ? "bg-chrome-hover text-chrome-text"
                          : "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text"
                      }`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        <ToolLogo tool={pane.tool} size={14} />
                      </span>
                      {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                    </button>
                    {!sidebarCollapsed && (
                      <button
                        type="button"
                        onClick={() => void closePane(pane.id)}
                        title={t("pane.close")}
                        aria-label={`${t("pane.close")}: ${label}`}
                        className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-chrome-text-muted opacity-0 transition-opacity hover:bg-chrome-hover-strong hover:text-chrome-text focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="shrink-0 border-t border-chrome-border-subtle p-1">
              <button
                type="button"
                onClick={() => void newTerminal()}
                disabled={adding}
                title={t("pane.popout.newTerminal")}
                aria-label={t("pane.popout.newTerminal")}
                className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md text-[12px] text-chrome-text-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text disabled:cursor-default disabled:opacity-50 ${
                  sidebarCollapsed ? "justify-center px-0" : "px-2"
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </span>
                {!sidebarCollapsed && (
                  <span className="min-w-0 truncate">{t("pane.popout.newTerminal")}</span>
                )}
              </button>
            </div>
          </nav>
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden" style={{ background: bg }}>
            {/* Every terminal stays mounted at full size (hidden ones are only invisible),
                so switching keeps scrollback / TUI state and never resizes a PTY to zero. */}
            {panes.map(({ pane }) => {
              const isActive = pane.id === active.pane.id;
              return (
                <div
                  key={pane.sessionId}
                  className={`absolute inset-1.5 ${isActive ? "" : "pointer-events-none invisible"}`}
                  aria-hidden={!isActive}
                >
                  <EmbeddedTerminal
                    sessionId={pane.sessionId}
                    bg={useAppThemeBg ? undefined : settings.terminalBg}
                    fontFamily={settings.terminalFontFamily}
                    fontSize={settings.terminalFontSize}
                    scrollback={settings.terminalScrollback}
                    webglEnabled={settings.terminalWebglEnabled}
                    rightClickPaste={settings.terminalRightClickPaste}
                    copyOnSelect={settings.terminalCopyOnSelect}
                    pasteConfirm={pasteConfirm}
                    active={isActive}
                    focused={isActive}
                    onCwdReport={reportCwd}
                    // Same as a pane in the main window: exited + key press closes it.
                    onExit={() => void window.api.panePopoutClose(pane.id, true)}
                    // Session vanished entirely: hand the pane back so the origin can respawn it.
                    onSessionLost={() => void window.api.panePopoutDock(pane.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <TerminalStatusBar pane={active.pane} />
      </div>
      <BusyPaneCloseDialog
        open={confirmClose !== null}
        onCancel={() => setConfirmClose(null)}
        onConfirm={() => {
          const target = confirmClose;
          setConfirmClose(null);
          if (target === "window") void window.api.panePopoutClose();
          else if (target) void window.api.panePopoutClose(target, true);
        }}
      />
    </TooltipProvider>
  );
}
