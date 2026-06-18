import { loadSettings } from "./chat-settings";

/** Push renderer settings to the main process (tray icon, PTY buffer cap, etc.). */
export function syncMainProcessFromSettings(): void {
  const s = loadSettings();
  void window.api.setSystemTrayEnabled(s.systemTrayEnabled);
  void window.api.setPtyBufferMaxChars(s.terminalPtyBufferChars);
}

/** @deprecated Use syncMainProcessFromSettings */
export function syncSystemTrayFromSettings(): void {
  syncMainProcessFromSettings();
}
