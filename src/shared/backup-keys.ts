/** localStorage keys included in app backup / restore. */
export const BACKUP_LOCAL_STORAGE_KEYS = [
  "ai-inventory-chat-settings",
  "ai-inventory-sidebar-width",
  "ai-inventory-sidebar-collapsed",
] as const;

export type BackupLocalStorageKey = (typeof BACKUP_LOCAL_STORAGE_KEYS)[number];

export const BACKUP_FORMAT_VERSION = 1;
