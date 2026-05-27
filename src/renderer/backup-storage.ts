import { BACKUP_LOCAL_STORAGE_KEYS } from "../shared/backup-keys.js";

export const SIDEBAR_WIDTH_KEY = "ai-inventory-sidebar-width";
export const SIDEBAR_COLLAPSED_KEY = "ai-inventory-sidebar-collapsed";

export { BACKUP_LOCAL_STORAGE_KEYS };

export function collectLocalStorageForBackup(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of BACKUP_LOCAL_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

export function applyImportedLocalStorage(data: Record<string, string>): void {
  for (const key of BACKUP_LOCAL_STORAGE_KEYS) {
    const value = data[key];
    if (value !== undefined) window.localStorage.setItem(key, value);
  }
}
