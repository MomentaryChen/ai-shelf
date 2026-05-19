export type ExternalTerminal = "auto" | "wt" | "pwsh" | "powershell" | "cmd";

export interface ChatSettings {
  externalTerminal: ExternalTerminal;
  terminalBg: string;
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

export function loadSettings(): ChatSettings {
  try {
    return {
      externalTerminal: "auto",
      terminalBg: "#0c0c0c",
      workingDir: "",
      dirHistory: [],
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"),
    };
  } catch {
    return { externalTerminal: "auto", terminalBg: "#0c0c0c", workingDir: "", dirHistory: [] };
  }
}

export function saveSettings(s: ChatSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function getAppBg(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-bg-primary").trim() || "#0f172a";
}
