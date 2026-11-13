import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmbeddedTerminal } from "./components/EmbeddedTerminal";
import { BusyPaneCloseDialog } from "./components/BusyPaneCloseDialog";
import { SplitPaneLayout } from "./components/SplitPaneLayout";
import { TerminalStatusBar } from "./components/TerminalStatusBar";
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

  const applyState = useCallback((next: PaneViewDecl | null) => {
    setView(next);
    setLayout(next?.layout ?? null);
    if (next) {
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

  // A pane of another profile was dropped here: refuse and say why.
  useEffect(
    () =>
      window.api.onPaneViewNotice(() => {
        setNotice(t("pane.view.rejectOtherProfile", { profile: view?.profileName || "?" }));
      }),
    [t, view?.profileName],
  );
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

  const focusPane = useCallback((paneId: string) => {
    setFocusedPaneId(paneId);
    window.api.paneViewAction({ type: "focus", paneId });
  }, []);

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

  const reportCwd = useCallback((sessionId: string, cwd: string) => {
    const trimmed = cwd.trim();
    if (trimmed) window.api.paneViewAction({ type: "cwd", sessionId, cwd: trimmed });
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
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-chrome-border px-3">
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
            <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden />
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
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-1.5">
          <SplitPaneLayout
            node={layout}
            focusedPaneId={focusedPane?.id ?? null}
            bg={bg}
            profileAccentColor={view.accentColor}
            paneLabels={view.labels}
            onFocusPane={focusPane}
            onClosePane={(paneId) => closePane(paneId)}
            onResizeSplit={(splitId, ratio) => {
              setLayout((prev) => (prev ? updateSplitRatio(prev, splitId, ratio) : prev));
              window.api.paneViewAction({ type: "resize", splitId, ratio });
            }}
            onMovePane={(dragPaneId, targetPaneId, zone) =>
              window.api.paneViewAction({ type: "move-in-view", dragPaneId, targetPaneId, zone })
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
        <TerminalStatusBar pane={focusedPane} />
      </div>
      <BusyPaneCloseDialog
        open={confirmCloseView || busyClosePaneId !== null}
        onCancel={() => {
          setConfirmCloseView(false);
          setBusyClosePaneId(null);
        }}
        onConfirm={() => {
          const paneId = busyClosePaneId;
          const wholeView = confirmCloseView;
          setConfirmCloseView(false);
          setBusyClosePaneId(null);
          if (wholeView) window.api.paneViewAction({ type: "close-view" });
          else if (paneId) closePane(paneId, { skipConfirm: true });
        }}
      />
    </TooltipProvider>
  );
}
