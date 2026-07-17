import { DEFAULT_APP_THEME, normalizeAppTheme, type AppColorTheme } from "./app-theme";
import {
  DEFAULT_LOCALE_PREFERENCE,
  normalizeLocalePreference,
  type AppLocale,
  type LocalePreference,
} from "./i18n/index.js";
import {
  normalizeToolLaunchArgs,
  type ToolLaunchArgs,
} from "../tool-launch.js";
import {
  DEFAULT_PANE_SHORTCUT_BINDINGS,
  normalizePaneShortcutBindings,
  type PaneShortcutBindings,
} from "./terminal/pane-key-bindings";

export type { AppColorTheme, AppLocale, LocalePreference };

export type ExternalTerminal = "auto" | "wt" | "pwsh" | "powershell" | "cmd";

/** In-app PTY shell preference (platform-specific options shown in settings). */
export type PreferredShell =
  | "auto"
  | "pwsh"
  | "powershell"
  | "cmd"
  | "bash"
  | "zsh"
  | "fish"
  | "sh";

export const DEFAULT_TERMINAL_FONT_FAMILY =
  "'CaskaydiaCove Nerd Font', 'CaskaydiaMono Nerd Font', 'Cascadia Code NF', 'FiraCode Nerd Font', 'JetBrainsMono Nerd Font', 'MesloLGS NF', 'Hack Nerd Font', 'Consolas', 'Courier New', monospace";

export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const DEFAULT_TERMINAL_SCROLLBACK = 20_000;
/** PTY output buffer for export, search, and pty-logs mirror (chars, not lines). */
export const DEFAULT_TERMINAL_PTY_BUFFER_CHARS = 4 * 1024 * 1024;

const MIN_TERMINAL_FONT_SIZE = 8;
const MAX_TERMINAL_FONT_SIZE = 32;
const MIN_TERMINAL_SCROLLBACK = 1_000;
const MAX_TERMINAL_SCROLLBACK = 100_000;
const MIN_TERMINAL_PTY_BUFFER_CHARS = 256 * 1024;
const MAX_TERMINAL_PTY_BUFFER_CHARS = 64 * 1024 * 1024;

export interface ChatSettings {
  locale: LocalePreference;
  /** App UI color theme (light / dark / high contrast). */
  appTheme: AppColorTheme;
  externalTerminal: ExternalTerminal;
  /** Preferred shell for embedded PTY panes (`auto` uses $SHELL on Unix / pwsh-first on Windows). */
  preferredShell: PreferredShell;
  terminalBg: string;
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalScrollback: number;
  /** Rolling PTY transcript cap (export / search / pty-logs). */
  terminalPtyBufferChars: number;
  /** Right-click pastes clipboard; with selection, copies first. Shift+right-click opens menu. */
  terminalRightClickPaste: boolean;
  /** Copy the selection to the clipboard as soon as a mouse drag finishes. */
  terminalCopyOnSelect: boolean;
  /** Prefer WebGL terminal renderer; falls back to canvas if unavailable. */
  terminalWebglEnabled: boolean;
  workingDir: string;
  dirHistory: string[];
  /** Pane split / focus shortcuts (Ctrl/Cmd combinations). */
  paneShortcuts: PaneShortcutBindings;
  /** Minimize to system tray and keep running when all windows are closed. */
  systemTrayEnabled: boolean;
  /** Show per-pane agent status and completion alerts in multi-pane layouts. */
  paneAgentAwarenessEnabled: boolean;
  /** Desktop notification when an unfocused pane needs attention or finishes. Uncheck "Disable notifications" to turn off. */
  paneAgentNotifySystem: boolean;
  /** Tray tooltip / badge count for panes needing attention. */
  paneAgentNotifyTrayBadge: boolean;
  /** In-app chime and system notification sound. Uncheck "Mute sound" to turn off. */
  paneAgentNotifySound: boolean;
  /** Only alert for panes that are not currently focused. */
  paneAgentNotifyUnfocusedOnly: boolean;
  /** Seconds without output before marking a busy pane as stalled; 0 disables. */
  paneAgentStallTimeoutSec: number;
  /** Extra CLI flags appended when launching each AI tool (e.g. `--model opus`). */
  toolLaunchArgs: ToolLaunchArgs;
}

export type { PaneShortcutBindings, ToolLaunchArgs };

export const SETTINGS_KEY = "ai-inventory-chat-settings";

/** Same-window notification when saveSettings runs (see subscribeSettingsChanges). */
export const SETTINGS_CHANGE_EVENT = "ai-shelf-settings-change";

export const TERMINAL_OPTIONS: { value: ExternalTerminal; label: string }[] = [
  { value: "auto", label: "Auto detect" },
  { value: "wt", label: "Windows Terminal" },
  { value: "pwsh", label: "🔵 PowerShell 7+ (pwsh)" },
  { value: "powershell", label: "💙 PowerShell 5 (built-in)" },
  { value: "cmd", label: "⬛ Command Prompt" },
];

const PREFERRED_SHELL_SET = new Set<string>([
  "auto",
  "pwsh",
  "powershell",
  "cmd",
  "bash",
  "zsh",
  "fish",
  "sh",
]);

export const WINDOWS_PREFERRED_SHELL_OPTIONS: PreferredShell[] = [
  "auto",
  "pwsh",
  "powershell",
  "cmd",
];

export const UNIX_PREFERRED_SHELL_OPTIONS: PreferredShell[] = [
  "auto",
  "bash",
  "zsh",
  "fish",
  "sh",
];

function normalizePreferredShell(raw: unknown): PreferredShell {
  if (typeof raw === "string" && PREFERRED_SHELL_SET.has(raw)) {
    return raw as PreferredShell;
  }
  return "auto";
}

/** Stored in settings when terminal background should follow the active app theme. */
export const APP_THEME_TERMINAL_BG = "@app-theme";

export function isAppThemeTerminalBg(terminalBg: string): boolean {
  return terminalBg === APP_THEME_TERMINAL_BG || terminalBg === "";
}

function normalizeTerminalBg(raw: unknown): string {
  if (isAppThemeTerminalBg(typeof raw === "string" ? raw : "")) return APP_THEME_TERMINAL_BG;
  if (typeof raw === "string" && raw.trim()) return raw;
  return "#2c2420";
}

export const BG_PRESETS = [
  { label: "Warm ink", value: "#2c2420", preview: "#2c2420" },
  { label: "App theme", value: APP_THEME_TERMINAL_BG, preview: "var(--color-terminal-bg)" },
  { label: "Windows Terminal", value: "#0c0c0c", preview: "#0c0c0c" },
  { label: "Pure black", value: "#000000", preview: "#000000" },
  { label: "PowerShell blue", value: "#012456", preview: "#012456" },
  { label: "VS Code", value: "#1e1e1e", preview: "#1e1e1e" },
];

export const SCROLLBACK_PRESETS = [
  { label: "5K lines", value: 5_000 },
  { label: "10K lines", value: 10_000 },
  { label: "20K lines", value: 20_000 },
  { label: "50K lines", value: 50_000 },
] as const;

export const PTY_BUFFER_PRESETS = [
  { label: "256 KB", value: 256 * 1024 },
  { label: "1 MB", value: 1024 * 1024 },
  { label: "4 MB", value: 4 * 1024 * 1024 },
  { label: "16 MB", value: 16 * 1024 * 1024 },
  { label: "64 MB", value: 64 * 1024 * 1024 },
] as const;

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function normalizeFontFamily(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_TERMINAL_FONT_FAMILY;
  const t = raw.trim();
  return t || DEFAULT_TERMINAL_FONT_FAMILY;
}

function normalizeRightClickPaste(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  return true;
}

function normalizeCopyOnSelect(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  return true;
}

function normalizeWebglEnabled(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  return true;
}

const MIN_PANE_AGENT_STALL_SEC = 0;
const MAX_PANE_AGENT_STALL_SEC = 600;
const DEFAULT_PANE_AGENT_STALL_SEC = 120;

function normalizePaneAgentBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  return fallback;
}

function normalizePaneAgentStallSec(raw: unknown): number {
  const v = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(v)) return DEFAULT_PANE_AGENT_STALL_SEC;
  return Math.min(MAX_PANE_AGENT_STALL_SEC, Math.max(MIN_PANE_AGENT_STALL_SEC, Math.round(v)));
}

function normalizeSystemTrayEnabled(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  return true;
}

const DEFAULTS: ChatSettings = {
  locale: DEFAULT_LOCALE_PREFERENCE,
  appTheme: DEFAULT_APP_THEME,
  externalTerminal: "auto",
  preferredShell: "auto",
  terminalBg: "#2c2420",
  terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalScrollback: DEFAULT_TERMINAL_SCROLLBACK,
  terminalPtyBufferChars: DEFAULT_TERMINAL_PTY_BUFFER_CHARS,
  terminalRightClickPaste: true,
  terminalCopyOnSelect: true,
  terminalWebglEnabled: true,
  workingDir: "",
  dirHistory: [],
  paneShortcuts: { ...DEFAULT_PANE_SHORTCUT_BINDINGS },
  systemTrayEnabled: true,
  paneAgentAwarenessEnabled: true,
  paneAgentNotifySystem: true,
  paneAgentNotifyTrayBadge: true,
  paneAgentNotifySound: false,
  paneAgentNotifyUnfocusedOnly: true,
  paneAgentStallTimeoutSec: DEFAULT_PANE_AGENT_STALL_SEC,
  toolLaunchArgs: {},
};

export function loadSettings(): ChatSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<ChatSettings>;
    return {
      ...DEFAULTS,
      ...stored,
      locale: normalizeLocalePreference(stored.locale ?? DEFAULTS.locale),
      appTheme: normalizeAppTheme(stored.appTheme),
      preferredShell: normalizePreferredShell(stored.preferredShell),
      terminalBg: normalizeTerminalBg(stored.terminalBg),
      terminalFontFamily: normalizeFontFamily(stored.terminalFontFamily),
      terminalFontSize: clampInt(
        stored.terminalFontSize,
        MIN_TERMINAL_FONT_SIZE,
        MAX_TERMINAL_FONT_SIZE,
        DEFAULT_TERMINAL_FONT_SIZE,
      ),
      terminalScrollback: clampInt(
        stored.terminalScrollback,
        MIN_TERMINAL_SCROLLBACK,
        MAX_TERMINAL_SCROLLBACK,
        DEFAULT_TERMINAL_SCROLLBACK,
      ),
      terminalPtyBufferChars: clampInt(
        stored.terminalPtyBufferChars,
        MIN_TERMINAL_PTY_BUFFER_CHARS,
        MAX_TERMINAL_PTY_BUFFER_CHARS,
        DEFAULT_TERMINAL_PTY_BUFFER_CHARS,
      ),
      terminalRightClickPaste: normalizeRightClickPaste(stored.terminalRightClickPaste),
      terminalCopyOnSelect: normalizeCopyOnSelect(stored.terminalCopyOnSelect),
      terminalWebglEnabled: normalizeWebglEnabled(stored.terminalWebglEnabled),
      paneShortcuts: normalizePaneShortcutBindings(stored.paneShortcuts),
      systemTrayEnabled: normalizeSystemTrayEnabled(stored.systemTrayEnabled),
      paneAgentAwarenessEnabled: normalizePaneAgentBool(stored.paneAgentAwarenessEnabled, true),
      paneAgentNotifySystem: normalizePaneAgentBool(stored.paneAgentNotifySystem, true),
      paneAgentNotifyTrayBadge: normalizePaneAgentBool(stored.paneAgentNotifyTrayBadge, true),
      paneAgentNotifySound: normalizePaneAgentBool(stored.paneAgentNotifySound, false),
      paneAgentNotifyUnfocusedOnly: normalizePaneAgentBool(stored.paneAgentNotifyUnfocusedOnly, true),
      paneAgentStallTimeoutSec: normalizePaneAgentStallSec(stored.paneAgentStallTimeoutSec),
      toolLaunchArgs: normalizeToolLaunchArgs(stored.toolLaunchArgs),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: ChatSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
  void window.api?.notifySettingsChanged?.();
}

/** Reload when settings change in this window, another BrowserWindow, or via IPC. */
export function subscribeSettingsChanges(onChange: () => void): () => void {
  const onCustom = () => onChange();
  const onStorage = (e: StorageEvent) => {
    if (e.key === SETTINGS_KEY) onChange();
  };
  const offIpc = window.api?.onSettingsChanged?.(onChange) ?? (() => {});
  window.addEventListener(SETTINGS_CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SETTINGS_CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
    offIpc();
  };
}

export function bumpDirHistory(history: string[], dir: string, max = 12): string[] {
  const d = dir.trim();
  if (!d) return history;
  return [d, ...history.filter((x) => x !== d)].slice(0, max);
}

export function getAppBg(): string {
  const terminalBg = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-terminal-bg")
    .trim();
  if (terminalBg) return terminalBg;
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim() ||
    "#2c2420"
  );
}
