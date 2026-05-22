import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyAppTheme } from "./app-theme";
import { App } from "./App";
import { ChatWindowApp } from "./ChatWindowApp";
import { loadSettings } from "./chat-settings";
import { SettingsWindowApp } from "./SettingsWindowApp";
import { LocaleProvider } from "./i18n/LocaleProvider";
import "./index.css";

applyAppTheme(loadSettings().appTheme);

const route = window.location.hash.replace(/^#\/?/, "");

function Root() {
  if (route === "chat") return <ChatWindowApp />;
  if (route === "settings") return <SettingsWindowApp />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <Root />
    </LocaleProvider>
  </StrictMode>,
);
