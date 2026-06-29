import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncStatus } from "../../shared/sync-types.js";
import {
  ensureFirebaseAuthForSync,
  getFirebaseAuth,
  isElectronRenderer,
  isFirebaseConfigured,
} from "../firebase/auth.js";
import { mergeSyncBundles } from "../firebase/sync-merge.js";
import { pullRemoteSyncState, pushRemoteSyncState } from "../firebase/sync-remote.js";
import { loadSettings } from "../chat-settings.js";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  setSyncStatus,
  showSyncToast,
  subscribeSyncStatus,
} from "../sync-status-store.js";
import { formatSyncDateTime } from "../utils/format-sync-time.js";

async function loadMeta(): Promise<Pick<SyncStatus, "lastSyncAt" | "lastError">> {
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

export function useCloudSync() {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState<SyncStatus>(() => ({
    lastSyncAt: null,
    lastError: null,
    syncing: false,
  }));

  useEffect(() => subscribeSyncStatus(setStatus), []);

  useEffect(() => {
    void loadMeta().then((meta) => {
      setSyncStatus({ ...meta, syncing: false });
    });
  }, []);

  const formatSyncError = useCallback(
    (err: unknown): string => {
      if (isFirestorePermissionError(err)) {
        return t("settings.accountSyncFirestoreDenied" satisfies MessageKey);
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message === "not_signed_in") {
        return t("settings.accountSyncNotSignedIn" satisfies MessageKey);
      }
      return message;
    },
    [t],
  );

  const notifySyncSuccess = useCallback(
    (syncedAt: string) => {
      const time = formatSyncDateTime(syncedAt, locale);
      const message = t("settings.accountSyncSuccess", { time });
      showSyncToast(message, "success");
      const settings = loadSettings();
      if (!settings.paneAgentNotifySystem) return;
      void window.api.showPaneAgentNotification({
        title: t("settings.accountSyncSuccessTitle"),
        body: message,
        silent: !settings.paneAgentNotifySound,
      });
    },
    [locale, t],
  );

  const notifySyncFailure = useCallback(
    (message: string) => {
      const body = t("settings.accountSyncFailed", { error: message });
      showSyncToast(body, "error");
    },
    [t],
  );

  const runSync = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!isFirebaseConfigured()) {
      return { ok: false, error: "not_configured" };
    }

    const uid = await resolveSyncUid();
    if (!uid) {
      const message = t("settings.accountSyncNotSignedIn" satisfies MessageKey);
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
      const merged = remoteState ? mergeSyncBundles(local, remoteState.bundle) : local;

      const applied = await window.api.syncApplyBundle(merged);
      if (!applied.ok) {
        throw new Error(applied.error ?? "Failed to apply sync bundle");
      }

      const nextRevision = (remoteState?.revision ?? 0) + 1;
      const refreshed = await window.api.syncExportLocal();
      const toPush = refreshed.ok ? refreshed.bundle : merged;
      await pushRemoteSyncState(uid, toPush, nextRevision);

      const now = new Date().toISOString();
      await window.api.syncSetMeta({ lastSyncAt: now, lastError: null });
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
  }, [formatSyncError, notifySyncFailure, notifySyncSuccess, t]);

  return { status, runSync };
}

/** Pull and push once after the user signs in. */
export function useCloudSyncOnSignIn(): void {
  const { runSync } = useCloudSync();
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;
  const syncedUidRef = useRef<string | null>(null);

  const trySyncForUid = useCallback((uid: string) => {
    if (syncedUidRef.current === uid) return;
    syncedUidRef.current = uid;
    void runSyncRef.current();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    let cancelled = false;
    let unsubFirebase: (() => void) | undefined;

    const unsubMain = window.api.onAuthStateChanged((state) => {
      if (state.signedIn && state.user?.uid) {
        trySyncForUid(state.user.uid);
      } else {
        syncedUidRef.current = null;
      }
    });

    if (!isElectronRenderer()) {
      void (async () => {
        const { onAuthStateChanged } = await import("firebase/auth");
        if (cancelled) return;
        const auth = getFirebaseAuth();
        if (!auth) return;

        unsubFirebase = onAuthStateChanged(auth, (user) => {
          if (!user) {
            syncedUidRef.current = null;
            return;
          }
          trySyncForUid(user.uid);
        });
      })();
    }

    return () => {
      cancelled = true;
      unsubFirebase?.();
      unsubMain();
    };
  }, [trySyncForUid]);
}
