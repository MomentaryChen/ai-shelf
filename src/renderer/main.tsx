import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ChatWindowApp } from "./ChatWindowApp";
import { SettingsWindowApp } from "./SettingsWindowApp";
import { LocaleProvider } from "./i18n/LocaleProvider";
import "./index.css";

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
