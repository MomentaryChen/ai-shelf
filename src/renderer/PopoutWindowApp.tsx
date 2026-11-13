import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Undo2, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmbeddedTerminal } from "./components/EmbeddedTerminal";
import { BusyPaneCloseDialog } from "./components/BusyPaneCloseDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { SplitPaneLayout } from "./components/SplitPaneLayout";
import { TerminalStatusBar } from "./components/TerminalStatusBar";
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
import { useTerminalNotifications } from "./hooks/useTerminalNotifications";
import { profileAccentMarkerStyle } from "./utils/profile-colors";
import { collectPanes, findPane, updateSplitRatio, type LayoutNode } from "./terminal/split-tree";
import type { PaneViewDecl } from "./types";

const NOTICE_MS = 4000;
/** "New terminal" stays disabled until the pane shows up, a notice arrives, or this long. */
const NEW_PANE_WAIT_MS = 30_000;
const SIDEBAR_COLLAPSED_KEY = "aishelf.view.sidebarCollapsed";

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
/** Divider drags send the ratio on a trailing timer, not on every mouse move. */
const RESIZE_SEND_MS = 150;

/**
 * A profile view window: some panes of one profile, on their own window
 * (multi-monitor use). The origin window owns the layout; this window renders
 * what main forwards and sends every change back as an action. PTYs stay in
 * the main process — this window attaches to the same sessions and owns their
 * size / input while they are here.
 */
export function PopoutWindowApp() {
  const { t } = useLocale();
  const [view, setView] = useState<PaneViewDecl | null | undefined>(undefined);
  /** Local copy so divider drags feel instant; replaced by every state from the origin. */
  const [layout, setLayout] = useState<LayoutNode | null>(null);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [confirmCloseView, setConfirmCloseView] = useState(false);
  const [busyClosePaneId, setBusyClosePaneId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [windowFocused, setWindowFocused] = useState(() => document.hasFocus());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [adding, setAdding] = useState(false);
  /** Pane ids present when "new terminal" was pressed: the id that appears next gets focus. */
  const pendingNewRef = useRef<Set<string> | null>(null);
  const addingTimerRef = useRef(0);
  useAppThemeRevision();

  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.surfaceContext = "chrome";
    return () => {
      delete document.documentElement.dataset.surfaceContext;
    };
  }, []);

  /** Divider ratio not yet sent to the origin; incoming layouts wait until it is. */
  const pendingResizeRef = useRef<{ splitId: string; ratio: number } | null>(null);
  const resizeTimerRef = useRef(0);

  const applyState = useCallback((next: PaneViewDecl | null) => {
    setView(next);
    // Mid divider drag an older echo would snap the divider back.
    if (!pendingResizeRef.current) setLayout(next?.layout ?? null);
    if (next) {
      // The terminal just created here takes focus (otherwise the current one keeps it).
      const before = pendingNewRef.current;
      const created = before ? collectPanes(next.layout).find((p) => !before.has(p.id)) : null;
      if (created) {
        pendingNewRef.current = null;
        window.clearTimeout(addingTimerRef.current);
        setAdding(false);
        setFocusedPaneId(created.id);
        window.api.paneViewAction({ type: "focus", paneId: created.id });
        return;
      }
      setFocusedPaneId((prev) =>
        prev && findPane(next.layout, prev) ? prev : (next.focusedPaneId ?? null),
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const off = window.api.onPaneViewState((state) => applyState(state));
    void window.api.paneViewGetState().then((state) => {
      if (!cancelled) applyState(state);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [applyState]);

  useEffect(
    () =>
      subscribeSettingsChanges(() => {
        const next = loadSettings();
        setSettings(next);
        applyAppTheme(next.appTheme);
      }),
    [],
  );

  // Window X while an agent here is busy: main asks before closing every pane.
  useEffect(() => window.api.onPaneViewConfirmClose(() => setConfirmCloseView(true)), []);
  useEffect(() => window.api.onPaneViewFocusPane((paneId) => setFocusedPaneId(paneId)), []);

  // A pane of another profile was dropped here (refused), or the origin has something
  // to say, e.g. why a new terminal could not be opened.
  useEffect(
    () =>
      window.api.onPaneViewNotice((incoming) => {
        pendingNewRef.current = null;
        window.clearTimeout(addingTimerRef.current);
        setAdding(false);
        setNotice(
          incoming.kind === "message"
            ? incoming.text
            : t("pane.view.rejectOtherProfile", { profile: view?.profileName || "?" }),
        );
      }),
    [t, view?.profileName],
  );
  useEffect(() => () => window.clearTimeout(addingTimerRef.current), []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (view?.profileName) document.title = view.profileName;
  }, [view?.profileName]);

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

  const focusedPaneIdRef = useRef(focusedPaneId);
  focusedPaneIdRef.current = focusedPaneId;
  const focusPane = useCallback((paneId: string) => {
    if (focusedPaneIdRef.current === paneId) return;
    setFocusedPaneId(paneId);
    window.api.paneViewAction({ type: "focus", paneId });
  }, []);

  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    setLayout((prev) => (prev ? updateSplitRatio(prev, splitId, ratio) : prev));
    pendingResizeRef.current = { splitId, ratio };
    window.clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = window.setTimeout(() => {
      const pending = pendingResizeRef.current;
      pendingResizeRef.current = null;
      if (pending) window.api.paneViewAction({ type: "resize", ...pending });
    }, RESIZE_SEND_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(resizeTimerRef.current), []);

  const closePane = useCallback(
    (paneId: string, opts?: { skipConfirm?: boolean }) => {
      if (!opts?.skipConfirm && view?.busy[paneId]) {
        setBusyClosePaneId(paneId);
        return;
      }
      window.api.paneViewAction({ type: "close-pane", paneId });
    },
    [view],
  );

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable: the choice just does not persist */
      }
      return next;
    });
  };

  /** The origin window spawns it (same profile, next to `anchorPaneId`) and updates this view. */
  const newTerminal = (anchorPaneId: string, paneIds: string[]) => {
    if (adding) return;
    pendingNewRef.current = new Set(paneIds);
    setAdding(true);
    window.clearTimeout(addingTimerRef.current);
    addingTimerRef.current = window.setTimeout(() => {
      pendingNewRef.current = null;
      setAdding(false);
      setNotice(t("pane.popout.newFailed"));
    }, NEW_PANE_WAIT_MS);
    window.api.paneViewAction({ type: "new-pane", anchorPaneId });
  };

  const reportCwd = useCallback((sessionId: string, cwd: string) => {
    const trimmed = cwd.trim();
    if (trimmed) window.api.paneViewAction({ type: "cwd", sessionId, cwd: trimmed });
  }, []);

  const reportTitle = useCallback((sessionId: string, title: string) => {
    window.api.paneViewAction({ type: "title", sessionId, title: title.trim() });
  }, []);

  // Long-command / bell notifications for the terminals shown here (the origin
  // window does not mount them, so it cannot raise these).
  const viewPanes = useMemo(() => (layout ? collectPanes(layout) : []), [layout]);
  const handleTerminalNotify = useTerminalNotifications({
    panes: viewPanes,
    focusedPaneId,
    windowFocused,
    viewActive: true,
    settings,
    t,
  });

  const useAppThemeBg = isAppThemeTerminalBg(settings.terminalBg);
  const bg = useAppThemeBg ? getAppBg() : settings.terminalBg;

  if (view === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-chrome-bg text-[12px] text-chrome-text-dim">
        {t("pane.popout.loading")}
      </div>
    );
  }
  if (!view || !layout) {
    return (
      <div className="flex h-screen items-center justify-center bg-chrome-bg text-[12px] text-chrome-text-dim">
        {t("pane.popout.missing")}
      </div>
    );
  }

  const panes = collectPanes(layout);
  const focusedPane = panes.find((p) => p.id === focusedPaneId) ?? panes[0] ?? null;

  return (
    <TooltipProvider>
      <div
        className="flex h-screen flex-col overflow-hidden bg-chrome-bg text-chrome-text"
        data-surface="chrome"
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-chrome-border px-2">
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-chrome-text-muted transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text"
            title={t(sidebarCollapsed ? "sidebar.expand" : "sidebar.collapse")}
            aria-label={t(sidebarCollapsed ? "sidebar.expand" : "sidebar.collapse")}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-chrome-ui-accent"
            style={view.accentColor ? profileAccentMarkerStyle(view.accentColor, "sm") : undefined}
            aria-hidden
          />
          <span className="min-w-0 truncate text-[12px] font-medium text-chrome-text">
            {view.profileName}
          </span>
          <span className="shrink-0 text-[11px] text-chrome-text-subtle">
            {t("pane.view.paneCount", { count: panes.length })}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => window.api.paneViewAction({ type: "dock-all" })}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] text-chrome-text-muted transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            {t("pane.view.dockAll")}
          </button>
        </div>
        {notice && (
          <div
            role="status"
            className="shrink-0 border-b border-warn/30 bg-warn/10 px-3 py-1.5 text-[12px] text-chrome-text"
          >
            {notice}
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
              {panes.map((pane) => {
                const label = view.labels[pane.id] ?? pane.title ?? pane.tool;
                const isFocused = pane.id === focusedPane?.id;
                return (
                  <li key={pane.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => focusPane(pane.id)}
                      title={sidebarCollapsed ? label : pane.cwd || label}
                      aria-current={isFocused ? "true" : undefined}
                      className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md text-left text-[12px] transition-colors ${
                        sidebarCollapsed ? "justify-center px-0" : "px-2 pr-7"
                      } ${
                        isFocused
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
                        onClick={() => closePane(pane.id)}
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
                onClick={() => {
                  if (focusedPane) {
                    newTerminal(
                      focusedPane.id,
                      panes.map((p) => p.id),
                    );
                  }
                }}
                disabled={adding || !focusedPane}
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
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-1.5">
          <SplitPaneLayout
            node={layout}
            focusedPaneId={focusedPane?.id ?? null}
            bg={bg}
            profileAccentColor={view.accentColor}
            paneLabels={view.labels}
            onFocusPane={focusPane}
            onClosePane={(paneId) => closePane(paneId)}
            onResizeSplit={resizeSplit}
            onMovePane={(dragPaneId, targetPaneId, zone) =>
              window.api.paneViewAction({ type: "move-in-view", dragPaneId, targetPaneId, zone })
            }
            // A terminal dragged from the origin window's sidebar onto a pane here.
            onProfilePaneDrop={(paneId, targetPaneId, zone) =>
              window.api.paneViewAction({ type: "adopt-pane", paneId, targetPaneId, zone })
            }
            onPopOutPane={(paneId, trigger, size) =>
              void window.api.paneViewDragEnd({
                paneId,
                trigger,
                width: size.width,
                height: size.height,
              })
            }
            onDockPane={(paneId) => window.api.paneViewAction({ type: "dock-pane", paneId })}
            renderTerminal={(pane, paneFocused) => (
              <EmbeddedTerminal
                key={pane.sessionId}
                sessionId={pane.sessionId}
                bg={useAppThemeBg ? undefined : settings.terminalBg}
                fontFamily={settings.terminalFontFamily}
                fontSize={settings.terminalFontSize}
                scrollback={settings.terminalScrollback}
                webglEnabled={settings.terminalWebglEnabled}
                rightClickPaste={settings.terminalRightClickPaste}
                copyOnSelect={settings.terminalCopyOnSelect}
                pasteConfirm={pasteConfirm}
                osc52Mode={settings.terminalOsc52}
                cwd={pane.cwd}
                onTerminalNotify={handleTerminalNotify}
                active
                focused={paneFocused}
                onCwdReport={reportCwd}
                onTitleReport={reportTitle}
                // Same as a pane in the main window: exited + key press closes it.
                onExit={() => closePane(pane.id, { skipConfirm: true })}
                // Session vanished entirely: hand it back so the origin can respawn it.
                onSessionLost={() => window.api.paneViewAction({ type: "dock-pane", paneId: pane.id })}
                onOpenInNewWindow={() =>
                  void window.api.paneViewDragEnd({ paneId: pane.id, trigger: "menu" })
                }
              />
            )}
          />
          </div>
        </div>
        <TerminalStatusBar pane={focusedPane} />
      </div>
      <BusyPaneCloseDialog
        open={busyClosePaneId !== null}
        onCancel={() => setBusyClosePaneId(null)}
        onConfirm={() => {
          const paneId = busyClosePaneId;
          setBusyClosePaneId(null);
          if (paneId) closePane(paneId, { skipConfirm: true });
        }}
      />
      {/* Window X closes every terminal here, not one pane. */}
      <ConfirmDialog
        open={confirmCloseView}
        title={t("pane.view.closeBusyTitle")}
        description={t("pane.view.closeBusyConfirm", { count: panes.length })}
        confirmLabel={t("pane.closeBusyAction")}
        confirmVariant="destructive"
        defaultFocus="cancel"
        onCancel={() => setConfirmCloseView(false)}
        onConfirm={() => {
          setConfirmCloseView(false);
          window.api.paneViewAction({ type: "close-view" });
        }}
      />
    </TooltipProvider>
  );
}
