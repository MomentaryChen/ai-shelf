import {
  checkSyncDailyLimit,
  checkSyncRateLimit,
  encodeSyncLimitError,
  nextSyncDailyMeta,
  validateSyncBundle,
} from "../shared/sync-limits.js";
import { planSyncAction } from "../shared/sync-compare.js";
import type { SyncConflictPreference, SyncStatus } from "../shared/sync-types.js";
import { loadSettings } from "./chat-settings.js";
import {
  ensureFirebaseAuthForSync,
  isElectronRenderer,
  isFirebaseConfigured,
} from "./firebase/auth.js";
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

export interface RunCloudSyncOptions {
  /** Skip success/no-op toasts (e.g. sign-in background sync). */
  silent?: boolean;
  /**
   * Conflict preference for this run.
   * Manual sync UI defaults to `local`; silent sign-in sync keeps `merge`.
   */
  prefer?: SyncConflictPreference;
}

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

function notifySyncAlreadyInSync(): void {
  const message = getStoredT("settings.accountSyncAlreadyInSync" satisfies MessageKey);
  showSyncToast(message, "success");
}

function notifySyncFailure(message: string): void {
  const body = getStoredT("settings.accountSyncFailed", { error: message });
  showSyncToast(body, "error");
}

export async function runCloudSync(
  options: RunCloudSyncOptions = {},
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
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
    const exported = await window.api.syncExportLocal();
    if (!exported.ok) {
      throw new Error("Failed to export local data");
    }
    const local = exported.bundle;

    const remoteState = await pullRemoteSyncState(uid);
    const prefer = options.prefer ?? (options.silent ? "merge" : "local");
    const plan = planSyncAction(local, remoteState?.bundle ?? null, prefer);
    const checkedAt = new Date().toISOString();
    setSyncStatus({ compareState: plan.compareState, compareCheckedAt: checkedAt });

    if (plan.action === "noop") {
      if (!options.silent) {
        notifySyncAlreadyInSync();
      }
      setSyncStatus({ syncing: false });
      return { ok: true, skipped: true };
    }

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

    await ensureSyncUserRegistered(uid, {
      hasExistingRemoteSync: remoteState != null,
    });

    // Prefer local/cloud overwrites the other side — only validate the winning bundle.
    // Merge still validates the merged payload (not each side independently).
    const winningLimit = validateSyncBundle(plan.merged);
    if (!winningLimit.ok) {
      throw new Error(encodeSyncLimitError(winningLimit.code, winningLimit.detail));
    }

    if (plan.action === "apply_only" || plan.action === "apply_and_push") {
      const applied = await window.api.syncApplyBundle(plan.merged, {
        replace: prefer === "cloud",
      });
      if (!applied.ok) {
        throw new Error(applied.error ?? "Failed to apply sync bundle");
      }
    }

    if (plan.action === "push_only" || plan.action === "apply_and_push") {
      const nextRevision = (remoteState?.revision ?? 0) + 1;
      // Prefer-local must push the planned local winner, not a re-export that could
      // still reflect stale merge leftovers. After prefer-cloud apply+replace, re-export
      // matches remote; for merge apply_and_push, re-export picks up applied state.
      const refreshed =
        prefer === "local" ? null : await window.api.syncExportLocal();
      const toPush =
        prefer === "local"
          ? plan.merged
          : refreshed?.ok
            ? refreshed.bundle
            : plan.merged;

      const pushLimit = validateSyncBundle(toPush);
      if (!pushLimit.ok) {
        throw new Error(encodeSyncLimitError(pushLimit.code, pushLimit.detail));
      }

      await pushRemoteSyncState(uid, toPush, nextRevision);
    }

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
    setSyncStatus({
      lastSyncAt: now,
      lastError: null,
      syncing: false,
      compareState: "in_sync",
      compareCheckedAt: now,
      syncDay: dailyMeta.syncDay,
      syncCountToday: dailyMeta.syncCountToday,
    });
    if (!options.silent) {
      notifySyncSuccess(now);
    }
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
  void runCloudSync({ silent: true });
}
