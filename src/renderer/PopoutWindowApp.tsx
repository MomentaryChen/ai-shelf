import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
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

/**
 * A single terminal pane popped out of a terminal window (multi-monitor use).
 * The PTY stays in the main process; this window attaches to the same session
 * and owns its size / input until it is docked back or closed.
 */
export function PopoutWindowApp() {
  const { t } = useLocale();
  const [info, setInfo] = useState<PanePopoutInfo | null | undefined>(undefined);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [cwd, setCwd] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  useAppThemeRevision();

  useEffect(() => {
    document.documentElement.dataset.surfaceContext = "chrome";
    return () => {
      delete document.documentElement.dataset.surfaceContext;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.api.panePopoutInfo().then((r) => {
      if (cancelled) return;
      setInfo(r);
      if (r) setCwd(r.pane.cwd);
    });
    return () => {
      cancelled = true;
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

  // Main asks before closing a pane whose agent is still busy (window X).
  useEffect(() => window.api.onPanePopoutConfirmClose(() => setConfirmClose(true)), []);

  useEffect(() => {
    if (info) document.title = info.label;
  }, [info]);

  const pane = useMemo<PaneInfo | null>(
    () => (info ? { ...info.pane, cwd: cwd || info.pane.cwd } : null),
    [info, cwd],
  );

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

  const dock = useCallback(() => {
    void window.api.panePopoutDock();
  }, []);

  const reportCwd = useCallback((_sessionId: string, next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    setCwd(trimmed);
    window.api.panePopoutReportCwd(trimmed);
  }, []);

  const useAppThemeBg = isAppThemeTerminalBg(settings.terminalBg);
  const bg = useAppThemeBg ? getAppBg() : settings.terminalBg;

  if (info === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-chrome-bg text-[12px] text-chrome-text-dim">
        {t("pane.popout.loading")}
      </div>
    );
  }
  if (!info || !pane) {
    return (
      <div className="flex h-screen items-center justify-center bg-chrome-bg text-[12px] text-chrome-text-dim">
        {t("pane.popout.missing")}
      </div>
    );
  }

  const cwdShort = formatPaneCwdShort(pane.cwd);

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
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-chrome-border-subtle bg-chrome-surface-raised">
            <ToolLogo tool={pane.tool} size={14} />
          </span>
          <span className="min-w-0 max-w-[45%] shrink truncate text-[12px] font-medium text-chrome-text">
            {info.label}
          </span>
          <PaneGitBranch cwd={pane.cwd} />
          <span className="min-w-0 flex-1 truncate text-[11px] text-chrome-text-subtle" title={pane.cwd}>
            {cwdShort || "~"}
          </span>
          <button
            type="button"
            onClick={dock}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] text-chrome-text-muted transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden />
            {t("pane.popout.dock")}
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden p-1.5" style={{ background: bg }}>
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
            active
            focused
            onCwdReport={reportCwd}
            // Same as a pane in the main window: exited + key press closes it.
            onExit={() => void window.api.panePopoutClose()}
            // Session vanished entirely: hand the pane back so the origin can respawn it.
            onSessionLost={dock}
          />
        </div>
        <TerminalStatusBar pane={pane} />
      </div>
      <BusyPaneCloseDialog
        open={confirmClose}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          void window.api.panePopoutClose();
        }}
      />
    </TooltipProvider>
  );
}
