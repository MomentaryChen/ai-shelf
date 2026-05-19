import { useState, useEffect, useRef, useCallback } from "react";
import type { ProviderEntry } from "../types";
import { ToolLogo } from "./ToolLogo";
import { toolLabel } from "../utils";
import { AuthBadge } from "./Badge";
import { EmbeddedTerminal } from "./EmbeddedTerminal";
import { WorkspaceSidebar, type WorkspaceSelection } from "./WorkspaceSidebar";
import {
  TERMINAL_OPTIONS,
  getAppBg,
  loadSettings,
  saveSettings,
  type ChatSettings,
  type ExternalTerminal,
  SETTINGS_KEY,
} from "../chat-settings";

interface PaneInfo {
  id: string;
  tool: string;
  sessionId: string;
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  claude:  "Anthropic coding agent — context-rich, file-aware sessions",
  copilot: "GitHub Copilot CLI — explain, suggest and chat",
  cursor:  "Cursor agent — AI pair programmer for your workspace",
};


export function ChatTab({ data, active = true }: { data: ProviderEntry[]; active?: boolean }) {
  const [panes, setPanes] = useState<PaneInfo[]>([]);
  const [wsSelection, setWsSelection] = useState<WorkspaceSelection | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [splitDir, setSplitDir] = useState<"lr" | "tb">("lr");
  const [paneWidths,  setPaneWidths]  = useState<number[]>([]);
  const [paneHeights, setPaneHeights] = useState<number[]>([]);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eq = panes.map(() => 100 / Math.max(panes.length, 1));
    setPaneWidths([...eq]);
    setPaneHeights([...eq]);
  }, [panes.length]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) setSettings(loadSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateSettings = useCallback((partial: Partial<ChatSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  function removePane(id: string) {
    setPanes((prev) => prev.filter((p) => p.id !== id));
  }

  async function openInApp(tool: string, cwd?: string) {
    const workDir = cwd ?? (settings.workingDir || undefined);
    const result = await window.api.ptySpawn(tool, workDir);
    if (result.success && result.sessionId) {
      setPanes((prev) => [...prev, { id: result.sessionId!, tool, sessionId: result.sessionId! }]);
    }
  }

  function handleWorkspaceSelect(sel: WorkspaceSelection | null) {
    setWsSelection(sel);
    if (sel) {
      updateSettings({ workingDir: sel.session.cwd });
    }
  }

  async function openExternal(tool: string): Promise<{ success: boolean; error?: string }> {
    return window.api.launchInTerminal(tool, settings.externalTerminal, settings.workingDir || undefined);
  }

  function startDragCol(dividerIndex: number, e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const containerWidth = terminalContainerRef.current?.clientWidth ?? 1;
    const snapshot = [...paneWidths];
    function onMove(ev: MouseEvent) {
      const delta = ((ev.clientX - startX) / containerWidth) * 100;
      const next = [...snapshot];
      next[dividerIndex]     = Math.max(10, snapshot[dividerIndex]     + delta);
      next[dividerIndex + 1] = Math.max(10, snapshot[dividerIndex + 1] - delta);
      setPaneWidths(next);
    }
    function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  function startDragRow(dividerIndex: number, e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const containerHeight = terminalContainerRef.current?.clientHeight ?? 1;
    const snapshot = [...paneHeights];
    function onMove(ev: MouseEvent) {
      const delta = ((ev.clientY - startY) / containerHeight) * 100;
      const next = [...snapshot];
      next[dividerIndex]     = Math.max(10, snapshot[dividerIndex]     + delta);
      next[dividerIndex + 1] = Math.max(10, snapshot[dividerIndex + 1] - delta);
      setPaneHeights(next);
    }
    function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (panes.length === 0) {
    return (
      <div className="flex h-full overflow-hidden">
        <WorkspaceSidebar
          onSelect={handleWorkspaceSelect}
          onLaunchTool={(tool, cwd) => void openInApp(tool, cwd)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Compact header */}
        <div className="flex items-center gap-3 border-b border-border bg-bg-secondary px-8 py-4">
          <span className="text-[15px] font-semibold text-text-primary">💬 AI Terminal</span>
          <span className="text-[12px] text-text-secondary">Launch an AI assistant in an embedded or external shell</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {wsSelection && (
              <span className="max-w-[240px] truncate text-[11px] text-accent">
                {wsSelection.workspace.name} / {wsSelection.group.name} / {wsSelection.session.name}
              </span>
            )}
            <button
              onClick={() => void window.api.openSettingsWindow()}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              title="Terminal settings"
            >
              ⚙️ Settings
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6 px-8 py-6">
          {/* Tool cards */}
          <div>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Available tools
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.filter((e) => e.available).map((e) => (
                <ToolCard
                  key={e.tool}
                  entry={e}
                  onInApp={() => openInApp(e.tool)}
                  onExternal={() => openExternal(e.tool)}
                />
              ))}
              {data.filter((e) => !e.available).map((e) => (
                <ToolCard key={e.tool} entry={e} disabled />
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <WorkspaceSidebar
        onSelect={handleWorkspaceSelect}
        onLaunchTool={(tool, cwd) => void openInApp(tool, cwd)}
      />
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border bg-bg-secondary px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {panes.map((pane) => (
            <div key={pane.id} className="flex shrink-0 items-center gap-2 rounded-md bg-bg-card px-3.5 py-2 text-[13px] text-text-primary shadow-sm">
              <ToolLogo tool={pane.tool} size={14} />
              <span>{toolLabel(pane.tool)}</span>
              <span
                role="button"
                onClick={() => removePane(pane.id)}
                className="ml-0.5 cursor-pointer rounded px-0.5 text-[11px] opacity-40 transition-opacity hover:opacity-100 hover:text-fail"
              >✕</span>
            </div>
          ))}
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-2">
          <AddPaneMenu data={data} onAdd={(tool) => openInApp(tool)} />
          <div className="h-4 w-px bg-border" />
          <TerminalSelector
            value={settings.externalTerminal}
            onChange={(v) => updateSettings({ externalTerminal: v })}
          />
          <button
            onClick={() => void window.api.openSettingsWindow()}
            className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
            title="Terminal settings"
          >
            ⚙️
          </button>
          <button
            onClick={() => setPanes([])}
            className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-fail/50 hover:text-fail"
          >
            ✕ Close all
          </button>
        </div>
      </div>

      {/* Terminal area — drag divider to resize; hover divider icon to flip direction */}
      <div ref={terminalContainerRef}
        className={`flex flex-1 gap-2 overflow-hidden p-2 ${splitDir === "tb" ? "flex-col" : ""}`}>
        {panes.flatMap((pane, i) => {
          const bg  = settings.terminalBg || getAppBg();
          const isLr = splitDir === "lr";
          const sizeStyle = isLr
            ? { flex: `${paneWidths[i]  ?? 100 / panes.length}`, minWidth: 0 }
            : { flex: `${paneHeights[i] ?? 100 / panes.length}`, minHeight: 0 };
          const paneClass = "flex flex-col overflow-hidden rounded-xl border border-border/40";

          const parts: React.ReactNode[] = [
            <div key={pane.id} style={{ ...sizeStyle, background: bg }} className={paneClass}>
              <PaneTitle pane={pane} onClose={removePane} />
              <div className="flex-1 overflow-hidden">
                <EmbeddedTerminal
                  sessionId={pane.sessionId}
                  bg={bg}
                  active={active}
                  onExit={() => removePane(pane.id)}
                />
              </div>
            </div>,
          ];

          if (i < panes.length - 1) {
            const onDrag = isLr
              ? (e: React.MouseEvent) => startDragCol(i, e)
              : (e: React.MouseEvent) => startDragRow(i, e);
            const divClass = isLr
              ? "group relative z-10 flex w-3 shrink-0 cursor-col-resize items-center justify-center"
              : "group relative z-10 flex h-3 shrink-0 cursor-row-resize flex-col items-center justify-center";
            const lineClass = isLr
              ? "h-12 w-0.5 rounded-full bg-border transition-colors group-hover:bg-accent/70"
              : "h-0.5 w-12 rounded-full bg-border transition-colors group-hover:bg-accent/70";

            parts.push(
              <div key={`div-${i}`} onMouseDown={onDrag} className={divClass}>
                <div className={lineClass} />
                {/* Direction toggle — appears on hover, does NOT start a drag */}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setSplitDir(isLr ? "tb" : "lr"); }}
                  title={isLr ? "Switch to top / bottom" : "Switch to left / right"}
                  className="absolute flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-border bg-bg-card text-[11px] text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 hover:border-accent/50 hover:text-accent"
                >
                  {isLr ? "↕" : "↔"}
                </button>
              </div>
            );
          }
          return parts;
        })}
      </div>
    </div>
    </div>
  );
}

// ─── PaneTitle ─────────────────────────────────────────────────────────────────

function PaneTitle({ pane, onClose }: { pane: PaneInfo; onClose: (id: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-black/20 px-3 py-1 text-[11px] text-text-secondary">
      <ToolLogo tool={pane.tool} size={11} />
      <span className="flex-1">{toolLabel(pane.tool)}</span>
      <span role="button" onClick={() => onClose(pane.id)} className="cursor-pointer rounded px-0.5 opacity-40 transition-opacity hover:opacity-100 hover:text-fail">✕</span>
    </div>
  );
}

// ─── ToolCard ──────────────────────────────────────────────────────────────────

function ToolCard({
  entry,
  disabled = false,
  onInApp,
  onExternal,
}: {
  entry: ProviderEntry;
  disabled?: boolean;
  onInApp?: () => void;
  onExternal?: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [extBusy,   setExtBusy]   = useState(false);
  const [inAppBusy, setInAppBusy] = useState(false);
  const [err,       setErr]       = useState("");

  async function handleExternal() {
    if (!onExternal) return;
    setExtBusy(true); setErr("");
    const r = await onExternal();
    setExtBusy(false);
    if (!r.success) setErr(r.error ?? "Failed to launch terminal");
  }

  async function handleInApp() {
    setInAppBusy(true); setErr("");
    await onInApp?.();
    setInAppBusy(false);
  }

  return (
    <div className={`flex flex-col gap-4 rounded-xl border p-6 transition-colors ${
      disabled ? "border-border bg-bg-secondary opacity-50" : "border-border bg-bg-card hover:border-accent/40"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-secondary">
          <ToolLogo tool={entry.tool} size={28} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-text-primary">{toolLabel(entry.tool)}</span>
            {entry.version && <span className="text-[11px] text-text-secondary">v{entry.version}</span>}
          </div>
          <AuthBadge auth={disabled ? "missing" : entry.auth} />
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-text-secondary">
        {TOOL_DESCRIPTIONS[entry.tool] ?? "AI coding assistant"}
      </p>

      {err && <p className="rounded-md bg-fail/10 px-3 py-2 text-[12px] text-fail">{err}</p>}

      {disabled ? (
        <p className="text-center text-[13px] text-text-secondary">Not installed</p>
      ) : (
        <div className="mt-auto grid grid-cols-2 gap-3">
          <button
            disabled={extBusy}
            onClick={handleExternal}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-[13px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {extBusy ? <span className="animate-spin">⟳</span> : "🖥️"} External
          </button>
          <button
            disabled={inAppBusy}
            onClick={handleInApp}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-accent/60 bg-accent/10 py-2.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inAppBusy ? <span className="animate-spin">⟳</span> : "⌨️"} In-App
          </button>
        </div>
      )}
    </div>
  );
}

// ─── AddPaneMenu ───────────────────────────────────────────────────────────────

function AddPaneMenu({ data, onAdd }: { data: ProviderEntry[]; onAdd: (tool: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const available = data.filter((e) => e.available);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
      >
        + Add
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-xl border border-border bg-bg-card shadow-xl">
          {available.length === 0 && (
            <p className="px-4 py-3 text-[12px] text-text-secondary">No tools available</p>
          )}
          {available.map((e) => (
            <button
              key={e.tool}
              onClick={() => { onAdd(e.tool); setOpen(false); }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-[12px] text-text-primary transition-colors hover:bg-bg-secondary first:rounded-t-xl last:rounded-b-xl"
            >
              <ToolLogo tool={e.tool} size={14} />
              {toolLabel(e.tool)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TerminalSelector ──────────────────────────────────────────────────────────

function TerminalSelector({ value, onChange }: {
  value: ExternalTerminal;
  onChange: (v: ExternalTerminal) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ExternalTerminal)}
      className="cursor-pointer rounded-md border border-border bg-bg-secondary px-2 py-1 font-sans text-[12px] text-text-secondary transition-colors hover:border-accent/50 focus:outline-none"
    >
      {TERMINAL_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}


