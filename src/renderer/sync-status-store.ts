import type { SyncStatus } from "../shared/sync-types.js";

export type SyncToastVariant = "success" | "error";

export interface SyncToast {
  id: number;
  message: string;
  variant: SyncToastVariant;
}

const DEFAULT_STATUS: SyncStatus = {
  lastSyncAt: null,
  lastError: null,
  syncDay: null,
  syncCountToday: 0,
  syncing: false,
  compareState: "unknown",
  compareCheckedAt: null,
};

type StatusListener = (status: SyncStatus) => void;
type ToastListener = (toast: SyncToast | null) => void;

let status: SyncStatus = { ...DEFAULT_STATUS };
const statusListeners = new Set<StatusListener>();
const toastListeners = new Set<ToastListener>();
let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function getSyncStatus(): SyncStatus {
  return status;
}

export function setSyncStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch };
  for (const listener of statusListeners) {
    listener(status);
  }
}

export function subscribeSyncStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
}

export function showSyncToast(message: string, variant: SyncToastVariant): void {
  const toast: SyncToast = { id: ++toastSeq, message, variant };
  for (const listener of toastListeners) {
    listener(toast);
  }
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastTimer = null;
    for (const listener of toastListeners) {
      listener(null);
    }
  }, 4200);
}

export function subscribeSyncToast(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}
