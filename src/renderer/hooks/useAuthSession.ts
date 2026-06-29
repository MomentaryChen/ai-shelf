import { useCallback, useEffect, useState } from "react";
import {
  buildSessionReport,
  completeGoogleRedirectSignIn,
  isElectronRenderer,
  isFirebaseConfigured,
  probeFirebaseAuthSetup,
  shouldHandleAuthRedirectOnLoad,
  signInWithGoogle,
  signOutGoogle,
  subscribeAuthState,
  waitForAuthReady,
  waitForSignedInUser,
} from "../firebase/auth.js";
import type { AuthErrorReason } from "../firebase/auth-errors.js";
import type { AuthStatePublic } from "../../shared/auth-types.js";
import {
  CONFIGURED_SIGNED_OUT_STATE,
  getAuthSessionSnapshot,
  NOT_CONFIGURED_STATE,
  setAuthSessionSnapshot,
  subscribeAuthSessionSnapshot,
} from "../auth-session-store.js";
import { runCloudSyncAfterSignIn } from "../cloud-sync-runner.js";

export interface AuthErrorState {
  reason: AuthErrorReason;
  detail?: string;
}

async function syncSessionToMain(report: Awaited<ReturnType<typeof buildSessionReport>>): Promise<void> {
  const result = await window.api.authReportSession(report);
  if (result.ok) {
    setAuthSessionSnapshot(result.state);
  }
}

function publishAuthState(state: AuthStatePublic): void {
  setAuthSessionSnapshot(state);
}

async function syncFirebaseUserToMain(user: import("firebase/auth").User | null): Promise<void> {
  if (isElectronRenderer()) {
    if (!user) return;
    await syncSessionToMain(await buildSessionReport(user));
    return;
  }
  await syncSessionToMain(await buildSessionReport(user));
}

/** Keeps the main process in sync with Firebase auth (mount once per window). */
export function useAuthSessionBridge(): void {
  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    let cancelled = false;

    void (async () => {
      if (shouldHandleAuthRedirectOnLoad()) {
        await completeGoogleRedirectSignIn();
      }
      const user = await waitForAuthReady();
      if (cancelled || !user) return;
      await syncSessionToMain(await buildSessionReport(user));
    })();

    const unsub = subscribeAuthState((user) => {
      void (async () => {
        if (cancelled) return;
        await syncFirebaseUserToMain(user);
      })();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
}

export function useAuthSession() {
  const [state, setState] = useState<AuthStatePublic>(() => getAuthSessionSnapshot());
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorState | null>(null);

  useEffect(() => subscribeAuthSessionSnapshot(setState), []);

  const signIn = useCallback(async () => {
    setAuthError(null);
    setBusy(true);

    const probe = await probeFirebaseAuthSetup();
    if (!probe.ok) {
      setAuthError({ reason: probe.reason, detail: probe.detail });
      setBusy(false);
      return;
    }

    try {
      if (isElectronRenderer()) {
        const popup = await window.api.authOpenGoogleWindow();

        if (popup.state?.signedIn) {
          publishAuthState(popup.state);
          setAuthError(null);
        } else {
          for (let i = 0; i < 30; i++) {
            const next = await window.api.authGetState(true);
            if (next.signedIn) {
              publishAuthState(next);
              setAuthError(null);
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }

        const current = getAuthSessionSnapshot();
        if (current.signedIn) {
          const caughtUp = await waitForSignedInUser(5000);
          if (caughtUp) {
            await syncSessionToMain(await buildSessionReport(caughtUp));
          }
          runCloudSyncAfterSignIn();
        } else if (!popup.ok && popup.error && popup.error !== "window_closed") {
          setAuthError({ reason: "unknown", detail: popup.error });
        }

        setBusy(false);
        return;
      }

      const result = await signInWithGoogle();
      if (!result.ok) {
        const user = await waitForAuthReady();
        if (user) {
          runCloudSyncAfterSignIn();
          setBusy(false);
          return;
        }
        const reason = result.reason ?? "unknown";
        if (reason === "internal-error") {
          setBusy(false);
          return;
        }
        setAuthError({ reason, detail: result.error });
        setBusy(false);
        return;
      }
      if (!result.redirecting) {
        runCloudSyncAfterSignIn();
        setBusy(false);
      }
    } catch (err) {
      setAuthError({
        reason: "unknown",
        detail: err instanceof Error ? err.message : String(err),
      });
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    setBusy(true);
    try {
      await signOutGoogle();
      const cleared = await window.api.authClearSession();
      publishAuthState(cleared.ok ? cleared.state : CONFIGURED_SIGNED_OUT_STATE);
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, authError, signIn, signOut };
}
