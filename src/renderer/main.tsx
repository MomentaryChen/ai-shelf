import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyAppTheme } from "./app-theme";
import { App } from "./App";
import { loadSettings } from "./chat-settings";
import { syncMainProcessFromSettings } from "./system-tray-sync";
import { LocaleProvider } from "./i18n/LocaleProvider";
import { isFirebaseConfigured } from "./firebase/config";
import { completeGoogleRedirectSignIn, shouldHandleAuthRedirectOnLoad } from "./firebase/auth.js";
import { ensureAuthSessionSync } from "./auth-session-sync.js";
import "./index.css";

const AuthBridge = lazy(() => import("./AuthBridge").then((m) => ({ default: m.AuthBridge })));

const ChatWindowApp = lazy(() =>
  import("./ChatWindowApp").then((m) => ({ default: m.ChatWindowApp })),
);
const SettingsWindowApp = lazy(() =>
  import("./SettingsWindowApp").then((m) => ({ default: m.SettingsWindowApp })),
);
const AuthGoogleWindow = lazy(() =>
  import("./AuthGoogleWindow").then((m) => ({ default: m.AuthGoogleWindow })),
);

applyAppTheme(loadSettings().appTheme);
syncMainProcessFromSettings();

function parseAppRoute(): string {
  if (window.location.pathname.includes("/__/auth/")) return "auth-google";
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return "";
  // Firebase OAuth callback — keep auth window mounted until redirect is consumed.
  if (hash.startsWith("__/auth/")) return "auth-google";
  if (hash.includes("access_token") || hash.includes("id_token")) return "auth-google";
  return hash.split("?")[0] ?? "";
}

function Root() {
  const [route, setRoute] = useState(parseAppRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(parseAppRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route === "chat") {
    return (
      <Suspense fallback={null}>
        <ChatWindowApp />
      </Suspense>
    );
  }
  if (route === "auth-google") {
    return (
      <Suspense fallback={null}>
        <AuthGoogleWindow />
      </Suspense>
    );
  }
  if (route === "settings") {
    return (
      <Suspense fallback={null}>
        <SettingsWindowApp />
      </Suspense>
    );
  }
  return <App />;
}

async function bootstrap() {
  if (shouldHandleAuthRedirectOnLoad()) {
    await completeGoogleRedirectSignIn();
  }

  ensureAuthSessionSync();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <LocaleProvider>
        {isFirebaseConfigured() && (
          <Suspense fallback={null}>
            <AuthBridge />
          </Suspense>
        )}
        <Root />
      </LocaleProvider>
    </StrictMode>,
  );
}

void bootstrap();
