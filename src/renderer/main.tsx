import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { applyAppTheme } from "./app-theme";
import { App } from "./App";
import { loadSettings } from "./chat-settings";
import { syncMainProcessFromSettings } from "./system-tray-sync";
import { LocaleProvider } from "./i18n/LocaleProvider";
import { isFirebaseConfigured } from "./firebase/config";
import "./index.css";

const AuthBridge = lazy(() => import("./AuthBridge").then((m) => ({ default: m.AuthBridge })));

const ChatWindowApp = lazy(() =>
  import("./ChatWindowApp").then((m) => ({ default: m.ChatWindowApp })),
);
const SettingsWindowApp = lazy(() =>
  import("./SettingsWindowApp").then((m) => ({ default: m.SettingsWindowApp })),
);

applyAppTheme(loadSettings().appTheme);
syncMainProcessFromSettings();

const route = window.location.hash.replace(/^#\/?/, "");

function Root() {
  if (route === "chat") {
    return (
      <Suspense fallback={null}>
        <ChatWindowApp />
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
