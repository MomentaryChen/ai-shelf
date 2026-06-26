import { useCallback, useEffect, useState } from "react";
import {
  buildSessionReport,
  isFirebaseConfigured,
  signInWithGoogle,
  signOutGoogle,
  subscribeAuthState,
} from "../firebase/auth.js";
import type { AuthStatePublic } from "../../shared/auth-types.js";

const NOT_CONFIGURED: AuthStatePublic = {
  configured: false,
  signedIn: false,
  user: null,
};

async function syncSessionToMain(report: Awaited<ReturnType<typeof buildSessionReport>>): Promise<void> {
  await window.api.authReportSession(report);
}

/** Keeps the main process in sync with Firebase auth (mount once per window). */
export function useAuthSessionBridge(): void {
  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    let cancelled = false;

    const unsub = subscribeAuthState((user) => {
      void (async () => {
        const report = await buildSessionReport(user);
        if (cancelled) return;
        await syncSessionToMain(report);
      })();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
}

export function useAuthSession() {
  const [state, setState] = useState<AuthStatePublic>(() =>
    isFirebaseConfigured()
      ? { configured: true, signedIn: false, user: null }
      : NOT_CONFIGURED,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setState(NOT_CONFIGURED);
      return;
    }

    let cancelled = false;

    const unsub = subscribeAuthState((user) => {
      void (async () => {
        const report = await buildSessionReport(user);
        if (cancelled) return;
        setState({
          configured: true,
          signedIn: report.signedIn,
          user: report.user,
        });
        await syncSessionToMain(report);
      })();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      if (!result.ok) {
        if (result.error === "not_configured") {
          setError("not_configured");
        } else {
          setError(result.error);
        }
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await signOutGoogle();
      await window.api.authClearSession();
      setState({ configured: true, signedIn: false, user: null });
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, signIn, signOut };
}
