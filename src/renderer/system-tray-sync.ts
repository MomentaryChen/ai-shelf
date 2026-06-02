import { loadSettings } from "./chat-settings";

/** Push renderer settings to the main process (tray icon + minimize-to-tray behavior). */
export function syncSystemTrayFromSettings(): void {
  void window.api.setSystemTrayEnabled(loadSettings().systemTrayEnabled);
}
