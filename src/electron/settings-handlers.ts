import { BrowserWindow, ipcMain } from "electron";

function broadcastSettingsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("settings-changed");
    }
  }
}

export function registerSettingsHandlers(): void {
  ipcMain.handle("notify-settings-changed", () => {
    broadcastSettingsChanged();
    return { ok: true as const };
  });
}
