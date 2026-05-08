import { useState, useEffect, useRef } from "react";
import type { ProviderEntry } from "../types";
import { ToolLogo } from "./ToolLogo";
import { toolLabel } from "../utils";
import { AuthBadge } from "./Badge";
import { EmbeddedTerminal } from "./EmbeddedTerminal";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ExternalTerminal = "auto" | "wt" | "pwsh" | "powershell" | "cmd";

interface ChatSettings {
  externalTerminal: ExternalTerminal;
  terminalBg: string;
  workingDir: string; // "" = home directory
  dirHistory: string[];
}

interface PaneInfo {
  id: string;
  tool: string;
  sessionId: string;
}

// ─── Settings helpers ──────────────────────────────────────────────────────────

const SETTINGS_KEY = "ai-inventory-chat-settings";

function loadSettings(): ChatSettings {
  try { return { externalTerminal: "auto", terminalBg: "#0c0c0c", workingDir: "", dirHistory: [], ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }; }
  catch { return { externalTerminal: "auto", terminalBg: "#0c0c0c", workingDir: "", dirHistory: [] }; }
}

function saveSettings(s: ChatSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** Read the app's --color-bg-primary CSS variable as fallback */
function getAppBg(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim() || "#0f172a";
}

const BG_PRESETS = [
  { label: "Windows Terminal", value: "#0c0c0c", preview: "#0c0c0c" },
  { label: "App theme",        value: "",        preview: "var(--color-bg-primary)" },
  { label: "Pure black",       value: "#000000", preview: "#000000" },
  { label: "PowerShell blue",  value: "#012456", preview: "#012456" },
  { label: "VS Code",          value: "#1e1e1e", preview: "#1e1e1e" },
];

const TERMINAL_OPTIONS: { value: ExternalTerminal; label: string }[] = [
  { value: "auto",       label: "🔍 Auto detect" },
  { value: "wt",         label: "🪟 Windows Terminal" },
  { value: "pwsh",       label: "🔵 PowerShell 7+ (pwsh)" },
  { value: "powershell", label: "💙 PowerShell 5 (built-in)" },
  { value: "cmd",        label: "⬛ Command Prompt" },
];

const TOOL_DESCRIPTIONS: Record<string, string> = {
  claude:  "Anthropic coding agent — context-rich, file-aware sessions",
  copilot: "GitHub Copilot CLI — explain, suggest and chat",
  cursor:  "Cursor agent — AI pair programmer for your workspace",
};


export function ChatTab({ data }: { data: ProviderEntry[] }) {
  const [panes, setPanes] = useState<PaneInfo[]>([]);
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

  function updateSettings(partial: Partial<ChatSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveSettings(next);
  }

  function removePane(id: string) {
    setPanes((prev) => prev.filter((p) => p.id !== id));
  }

  async function openInApp(tool: string) {
    const result = await window.api.ptySpawn(tool, settings.workingDir || undefined);
    if (result.success && result.sessionId) {
      setPanes((prev) => [...prev, { id: result.sessionId!, tool, sessionId: result.sessionId! }]);
      setActivePaneId(result.sessionId!);
    }
  }

  async function openExternal(tool: string): Promise<{ success: boolean; error?: string }> {
    return window.api.launchInTerminal(tool, settings.externalTerminal, settings.workingDir || undefined);
  }

  async function browsePath() {
    const dir = await window.api.pickFolder(settings.workingDir || undefined);
    if (dir) {
      const history = [dir, ...settings.dirHistory.filter((d) => d !== dir)].slice(0, 10);
      updateSettings({ workingDir: dir, dirHistory: history });
    }
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
      <div className="flex h-full flex-col overflow-y-auto">
        {/* Compact header */}
        <div className="flex items-center gap-3 border-b border-border bg-bg-secondary px-8 py-4">
          <span className="text-[15px] font-semibold text-text-primary">💬 AI Terminal</span>
          <span className="text-[12px] text-text-secondary">Launch an AI assistant in an embedded or external shell</span>
        </div>

        <div className="flex flex-1 flex-col gap-6 px-8 py-6">
          {/* Working directory */}
          <div>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">Working directory</p>
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-bg-secondary px-3 py-2">
                <svg className="h-4 w-4 shrink-0 text-text-tertiary" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                {settings.workingDir ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-text-primary">
                      {settings.workingDir.split(/[\\/]/).filter(Boolean).pop()}
                    </p>
                    <p className="truncate font-mono text-[10px] text-text-tertiary">{settings.workingDir}</p>
                  </div>
                ) : (
                  <span className="text-[12px] text-text-tertiary italic">~ (home directory)</span>
                )}
              </div>
              <button
                onClick={browsePath}
                className="cursor-pointer rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                Browse…
              </button>
              {settings.workingDir && (
                <button
                  onClick={() => updateSettings({ workingDir: "" })}
                  className="cursor-pointer rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary transition-colors hover:border-fail/40 hover:text-fail"
                  title="Reset to home"
                >
                  ✕
                </button>
              )}
            </div>

            {/* History */}
            {settings.dirHistory.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between px-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Recent</span>
                  <button
                    onClick={() => updateSettings({ dirHistory: [], workingDir: "" })}
                    className="cursor-pointer text-[10px] text-text-tertiary transition-colors hover:text-fail"
                  >
                    Clear all
                  </button>
                </div>
                <div className="overflow-hidden rounded-lg border border-border divide-y divide-border">
                  {settings.dirHistory.map((dir) => {
                    const isActive = dir === settings.workingDir;
                    const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
                    return (
                      <div
                        key={dir}
                        onClick={() => updateSettings({ workingDir: dir })}
                        className={`group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-bg-secondary ${isActive ? "bg-accent/5" : ""}`}
                      >
                        <svg
                          className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-accent" : "text-text-tertiary"}`}
                          viewBox="0 0 20 20" fill="currentColor"
                        >
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[12px] font-medium ${isActive ? "text-accent" : "text-text-primary"}`}>
                            {name}
                          </p>
                          <p className="truncate font-mono text-[10px] text-text-tertiary">{dir}</p>
                        </div>
                        {isActive && (
                          <svg className="h-3.5 w-3.5 shrink-0 text-accent" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = settings.dirHistory.filter((d) => d !== dir);
                            updateSettings({ dirHistory: next, ...(isActive ? { workingDir: "" } : {}) });
                          }}
                          className="hidden shrink-0 cursor-pointer rounded p-0.5 text-[11px] text-text-tertiary transition-colors hover:bg-fail/10 hover:text-fail group-hover:flex"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Terminal preference */}
          <div>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              External terminal preference
            </p>
            <div className="flex flex-wrap gap-2">
              {TERMINAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateSettings({ externalTerminal: opt.value })}
                  className={`cursor-pointer rounded-lg border px-4 py-2 text-[13px] transition-all duration-150 ${
                    settings.externalTerminal === opt.value
                      ? "border-accent/60 bg-accent/10 font-medium text-accent"
                      : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Terminal background */}
          <div>
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              Terminal background
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {BG_PRESETS.map((p) => {
                const active = settings.terminalBg === p.value;
                return (
                  <button
                    key={p.label}
                    onClick={() => updateSettings({ terminalBg: p.value })}
                    title={p.label}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition-all duration-150 ${
                      active
                        ? "border-accent/60 bg-accent/10 font-medium text-accent"
                        : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
                    }`}
                  >
                    <span className="inline-block h-3.5 w-3.5 rounded-sm border border-white/20" style={{ background: p.preview }} />
                    {p.label}
                  </button>
                );
              })}
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition-all duration-150 ${
                !BG_PRESETS.some((p) => p.value === settings.terminalBg) && settings.terminalBg
                  ? "border-accent/60 bg-accent/10 font-medium text-accent"
                  : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
              }`}>
                <input
                  type="color"
                  value={settings.terminalBg || getAppBg()}
                  onChange={(e) => updateSettings({ terminalBg: e.target.value })}
                  className="h-3.5 w-3.5 cursor-pointer rounded-sm border-0 bg-transparent p-0 outline-none"
                />
                Custom
              </label>
            </div>
          </div>

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
    );
  }

  return (
    <div className="flex h-full flex-col">
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
                <EmbeddedTerminal sessionId={pane.sessionId} bg={bg} onExit={() => removePane(pane.id)} />
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


