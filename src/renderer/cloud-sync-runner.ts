import {
  checkSyncDailyLimit,
  checkSyncRateLimit,
  encodeSyncLimitError,
  nextSyncDailyMeta,
  validateSyncBundle,
} from "../shared/sync-limits.js";
import type { SyncStatus } from "../shared/sync-types.js";
import { loadSettings } from "./chat-settings.js";
import {
  ensureFirebaseAuthForSync,
  isElectronRenderer,
  isFirebaseConfigured,
} from "./firebase/auth.js";
import { mergeSyncBundles } from "./firebase/sync-merge.js";
import { ensureSyncUserRegistered } from "./firebase/sync-registry.js";
import { pullRemoteSyncState, pushRemoteSyncState } from "./firebase/sync-remote.js";
import { formatStoredSyncLimitError } from "./firebase/sync-limit-messages.js";
import type { MessageKey } from "./i18n/messages/en";
import { getStoredLocale, getStoredT } from "./i18n/stored-locale.js";
import {
  setSyncStatus,
  showSyncToast,
} from "./sync-status-store.js";
import { formatSyncDateTime } from "./utils/format-sync-time.js";

async function loadMeta(): Promise<Pick<SyncStatus, "lastSyncAt" | "lastError" | "syncDay" | "syncCountToday">> {
  return window.api.syncGetMeta();
}

function isFirestorePermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: string }).code) : "";
  const message = "message" in err ? String((err as { message: string }).message) : String(err);
  return (
    code === "permission-denied" ||
    /insufficient permissions/i.test(message) ||
    /Firestore denied access/i.test(message)
  );
}

async function resolveSyncUid(): Promise<string | null> {
  if (isElectronRenderer()) {
    const auth = await window.api.authGetState(true);
    return auth.signedIn && auth.user ? auth.user.uid : null;
  }
  const user = await ensureFirebaseAuthForSync();
  return user?.uid ?? null;
}

function formatSyncError(err: unknown): string {
  if (isFirestorePermissionError(err)) {
    return getStoredT("settings.accountSyncFirestoreDenied" satisfies MessageKey);
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message === "not_signed_in") {
    return getStoredT("settings.accountSyncNotSignedIn" satisfies MessageKey);
  }
  return formatStoredSyncLimitError(message);
}

function notifySyncSuccess(syncedAt: string): void {
  const locale = getStoredLocale();
  const time = formatSyncDateTime(syncedAt, locale);
  const message = getStoredT("settings.accountSyncSuccess", { time });
  showSyncToast(message, "success");
  const settings = loadSettings();
  if (!settings.paneAgentNotifySystem) return;
  void window.api.showPaneAgentNotification({
    title: getStoredT("settings.accountSyncSuccessTitle"),
    body: message,
    silent: !settings.paneAgentNotifySound,
  });
}

function notifySyncFailure(message: string): void {
  const body = getStoredT("settings.accountSyncFailed", { error: message });
  showSyncToast(body, "error");
}

export async function runCloudSync(): Promise<{ ok: boolean; error?: string }> {
  if (!isFirebaseConfigured()) {
    return { ok: false, error: "not_configured" };
  }

  const uid = await resolveSyncUid();
  if (!uid) {
    const message = getStoredT("settings.accountSyncNotSignedIn" satisfies MessageKey);
    notifySyncFailure(message);
    return { ok: false, error: message };
  }

  setSyncStatus({ syncing: true, lastError: null });
  try {
    const meta = await loadMeta();
    const dailyLimit = checkSyncDailyLimit({
      syncDay: meta.syncDay ?? null,
      syncCountToday: meta.syncCountToday ?? 0,
    });
    if (!dailyLimit.ok) {
      throw new Error(encodeSyncLimitError(dailyLimit.code, dailyLimit.detail));
    }

    const rateLimit = checkSyncRateLimit(meta.lastSyncAt);
    if (!rateLimit.ok) {
      throw new Error(encodeSyncLimitError(rateLimit.code, rateLimit.detail));
    }

    const exported = await window.api.syncExportLocal();
    if (!exported.ok) {
      throw new Error("Failed to export local data");
    }
    const local = exported.bundle;

    const localLimit = validateSyncBundle(local);
    if (!localLimit.ok) {
      throw new Error(encodeSyncLimitError(localLimit.code, localLimit.detail));
    }

    const remoteState = await pullRemoteSyncState(uid);
    await ensureSyncUserRegistered(uid, {
      hasExistingRemoteSync: remoteState != null,
    });

    if (remoteState) {
      const remoteLimit = validateSyncBundle(remoteState.bundle);
      if (!remoteLimit.ok) {
        throw new Error(encodeSyncLimitError(remoteLimit.code, remoteLimit.detail));
      }
    }

    const merged = remoteState ? mergeSyncBundles(local, remoteState.bundle) : local;

    const mergedLimit = validateSyncBundle(merged);
    if (!mergedLimit.ok) {
      throw new Error(encodeSyncLimitError(mergedLimit.code, mergedLimit.detail));
    }

    const applied = await window.api.syncApplyBundle(merged);
    if (!applied.ok) {
      throw new Error(applied.error ?? "Failed to apply sync bundle");
    }

    // Revision is bookkeeping only (not CAS). Concurrent pushes are last-write-wins.
    const nextRevision = (remoteState?.revision ?? 0) + 1;
    const refreshed = await window.api.syncExportLocal();
    const toPush = refreshed.ok ? refreshed.bundle : merged;

    const pushLimit = validateSyncBundle(toPush);
    if (!pushLimit.ok) {
      throw new Error(encodeSyncLimitError(pushLimit.code, pushLimit.detail));
    }

    await pushRemoteSyncState(uid, toPush, nextRevision);

    const now = new Date().toISOString();
    const dailyMeta = nextSyncDailyMeta({
      syncDay: meta.syncDay ?? null,
      syncCountToday: meta.syncCountToday ?? 0,
    });
    await window.api.syncSetMeta({
      lastSyncAt: now,
      lastError: null,
      syncDay: dailyMeta.syncDay,
      syncCountToday: dailyMeta.syncCountToday,
    });
    setSyncStatus({ lastSyncAt: now, lastError: null, syncing: false });
    notifySyncSuccess(now);
    return { ok: true };
  } catch (err) {
    const message = formatSyncError(err);
    await window.api.syncSetMeta({ lastError: message });
    setSyncStatus({ syncing: false, lastError: message });
    notifySyncFailure(message);
    return { ok: false, error: message };
  }
}

/** Run once after the user completes a fresh Google sign-in. */
export function runCloudSyncAfterSignIn(): void {
  void runCloudSync();
}
