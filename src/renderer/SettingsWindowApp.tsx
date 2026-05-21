import { ChatSettingsPanel } from "./components/ChatSettingsPanel";
import { AppVersionBadge } from "./components/AppVersionBadge";

export function SettingsWindowApp() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <header className="border-b border-border bg-bg-secondary px-6 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[15px] font-semibold">⚙️ Terminal Settings</h1>
            <AppVersionBadge />
          </div>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Working directory, external terminal, and background color
          </p>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <ChatSettingsPanel />
      </main>
    </div>
  );
}
