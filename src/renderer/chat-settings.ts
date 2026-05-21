export type ExternalTerminal = "auto" | "wt" | "pwsh" | "powershell" | "cmd";

export const DEFAULT_TERMINAL_FONT_FAMILY =
  "'CaskaydiaCove Nerd Font', 'CaskaydiaMono Nerd Font', 'Cascadia Code NF', 'FiraCode Nerd Font', 'JetBrainsMono Nerd Font', 'MesloLGS NF', 'Hack Nerd Font', 'Consolas', 'Courier New', monospace";

export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const DEFAULT_TERMINAL_SCROLLBACK = 20_000;

const MIN_TERMINAL_FONT_SIZE = 8;
const MAX_TERMINAL_FONT_SIZE = 32;
const MIN_TERMINAL_SCROLLBACK = 1_000;
const MAX_TERMINAL_SCROLLBACK = 100_000;

export interface ChatSettings {
  externalTerminal: ExternalTerminal;
  terminalBg: string;
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalScrollback: number;
  workingDir: string;
  dirHistory: string[];
}

export const SETTINGS_KEY = "ai-inventory-chat-settings";

export const TERMINAL_OPTIONS: { value: ExternalTerminal; label: string }[] = [
  { value: "auto", label: "🔍 Auto detect" },
  { value: "wt", label: "🪟 Windows Terminal" },
  { value: "pwsh", label: "🔵 PowerShell 7+ (pwsh)" },
  { value: "powershell", label: "💙 PowerShell 5 (built-in)" },
  { value: "cmd", label: "⬛ Command Prompt" },
];

export const BG_PRESETS = [
  { label: "Windows Terminal", value: "#0c0c0c", preview: "#0c0c0c" },
  { label: "App theme", value: "", preview: "var(--color-bg-primary)" },
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

const DEFAULTS: ChatSettings = {
  externalTerminal: "auto",
  terminalBg: "#0c0c0c",
  terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalScrollback: DEFAULT_TERMINAL_SCROLLBACK,
  workingDir: "",
  dirHistory: [],
};

export function loadSettings(): ChatSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<ChatSettings>;
    return {
      ...DEFAULTS,
      ...stored,
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
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: ChatSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function bumpDirHistory(history: string[], dir: string, max = 12): string[] {
  const d = dir.trim();
  if (!d) return history;
  return [d, ...history.filter((x) => x !== d)].slice(0, max);
}

export function getAppBg(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim() || "#0f172a";
}
