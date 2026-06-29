import { useEffect, useState } from "react";
import { useLocale } from "./i18n/LocaleProvider";
import {
  buildSessionReport,
  clearGoogleRedirectPending,
  completeAuthFromNavigationUrl,
  completeGoogleRedirectSignIn,
  getFirebaseAuth,
  isFirebaseConfigured,
  isReturningFromGoogleRedirect,
  signInWithGoogle,
  subscribeAuthState,
  waitForAuthPersistence,
  waitForSignedInUser,
} from "./firebase/auth.js";
import type { User } from "firebase/auth";

export function AuthGoogleWindow() {
  const { t } = useLocale();
  const [message, setMessage] = useState(() => t("settings.accountSigningIn"));

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      void window.api.authFinishGoogleWindow({ ok: false, error: "not_configured" });
      return;
    }

    let cancelled = false;
    let finished = false;

    const finish = (result: { ok: boolean; error?: string; state?: Awaited<ReturnType<typeof window.api.authGetState>> }) => {
      if (cancelled || finished) return;
      finished = true;
      clearGoogleRedirectPending();
      void window.api.authFinishGoogleWindow(result);
    };

    const completeSignedIn = async (user: User) => {
      try {
        setMessage(t("settings.accountSignInSuccess"));
        const report = await buildSessionReport(user);
        const reported = await window.api.authReportSession(report);
        if (!reported.ok || !reported.state.signedIn) {
          finish({
            ok: false,
            error: reported.ok ? "session_not_signed_in" : reported.error,
          });
          return;
        }
        finish({ ok: true, state: reported.state });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setMessage(t("settings.accountSignInFailed", { error: detail }));
        finish({ ok: false, error: detail });
      }
    };

    const unsubAuth = subscribeAuthState((user) => {
      if (!cancelled && !finished && user) {
        void completeSignedIn(user);
      }
    });

    const unsubNav = window.api.onAuthOAuthNavigated((url) => {
      void (async () => {
        if (cancelled || finished) return;
        setMessage(t("settings.accountSigningInRedirect"));
        const user = await completeAuthFromNavigationUrl(url);
        if (user) await completeSignedIn(user);
      })();
    });

    void (async () => {
      try {
        if (isReturningFromGoogleRedirect()) {
          setMessage(t("settings.accountSigningInRedirect"));
          const redirect = await completeGoogleRedirectSignIn();
          await waitForAuthPersistence();
          const user =
            redirect.user ?? getFirebaseAuth()?.currentUser ?? (await waitForSignedInUser(15_000));
          if (user) {
            await completeSignedIn(user);
            return;
          }
          setMessage(t("settings.accountSignInFailed", { error: redirect.error ?? "redirect_failed" }));
          finish({ ok: false, error: redirect.error ?? "redirect_failed" });
          return;
        }

        setMessage(t("settings.accountSigningIn"));
        const result = await signInWithGoogle();
        if (cancelled || finished) return;

        if (result.ok && result.redirecting) {
          setMessage(t("settings.accountSigningInRedirect"));
          const user = await waitForSignedInUser(60_000);
          if (user) await completeSignedIn(user);
          return;
        }

        if (result.ok && result.user) {
          await completeSignedIn(result.user);
          return;
        }

        if (!result.ok) {
          setMessage(t("settings.accountSignInFailed", { error: result.error }));
          finish({ ok: false, error: result.error });
        }
      } catch (err) {
        if (cancelled || finished) return;
        const detail = err instanceof Error ? err.message : String(err);
        setMessage(t("settings.accountSignInFailed", { error: detail }));
        finish({ ok: false, error: detail });
      }
    })();

    return () => {
      cancelled = true;
      unsubAuth();
      unsubNav();
    };
  }, [t]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg-primary px-6 text-center text-text-primary">
      <p className="text-[15px]">{message}</p>
      <p className="text-[12px] text-text-tertiary">{t("settings.accountSigningInHint")}</p>
    </div>
  );
}
