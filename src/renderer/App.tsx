import { useState, useTransition } from "react";
import { Spinner } from "./components/Spinner";
import { OverviewTab } from "./components/OverviewTab";
import { ModelsTab } from "./components/ModelsTab";
import { SkillsTab } from "./components/SkillsTab";
import { McpTab } from "./components/McpTab";
import { ConfigTab } from "./components/ConfigTab";
import { DoctorTab } from "./components/DoctorTab";
import { UpdateTab } from "./components/UpdateTab";
import { ChatTab } from "./components/ChatTab";
import { AppModeSwitch, type AppMode } from "./components/AppModeSwitch";
import { useInventoryScan } from "./hooks/useInventoryScan";

type TabId = "overview" | "models" | "skills" | "mcp" | "config" | "doctor" | "update";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "📋 Overview" },
  { id: "models", label: "🧠 Models" },
  { id: "skills", label: "⚡ Skills" },
  { id: "mcp", label: "🔌 MCP" },
  { id: "config", label: "⚙️ Config" },
  { id: "doctor", label: "🩺 Doctor" },
  { id: "update", label: "🔄 Update" },
];

function AppIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" className={className}>
      <rect width="512" height="512" rx="96" fill="#0d0d14" />
      <rect width="512" height="512" rx="96" fill="url(#appIconGrad)" opacity="0.6" />
      <rect x="60" y="60" width="392" height="392" rx="48" fill="none" stroke="#1e1e30" strokeWidth="6" />
      <rect x="88" y="88" width="336" height="336" rx="32" fill="#12121f" />
      <rect x="88" y="88" width="336" height="52" rx="32" fill="#1a1a2e" />
      <circle cx="124" cy="114" r="9" fill="#d97757" opacity="0.9" />
      <circle cx="152" cy="114" r="9" fill="#e2b55a" opacity="0.9" />
      <circle cx="180" cy="114" r="9" fill="#57d985" opacity="0.9" />
      <defs>
        <linearGradient id="appIconGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a1a3e" />
          <stop offset="100%" stopColor="#0a0a14" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function App() {
  const [appMode, setAppMode] = useState<AppMode>("terminal");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [, startTransition] = useTransition();

  function handleModeChange(mode: AppMode) {
    startTransition(() => setAppMode(mode));
  }

  const {
    data,
    scanning,
    enriching,
    error,
    hasData,
    ready,
    modelOverrides,
    setModelOverrides,
    reload,
  } = useInventoryScan();

  const tabsEnabled = ready;
  const showSpinner = scanning && !hasData && !error;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-bg-secondary px-4 py-2.5">
        <AppModeSwitch mode={appMode} onChange={handleModeChange} disabled={!ready && scanning} />
        <div className="flex items-center gap-2 text-text-secondary">
          <AppIcon className="h-6 w-6 shrink-0" />
          <span className="text-[13px] font-medium text-text-primary">AI CLI Inventory</span>
          {scanning && hasData && <span className="text-[11px]">· detecting…</span>}
          {enriching && <span className="text-[11px]">· loading models…</span>}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {showSpinner && appMode === "terminal" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner label="Detecting AI tools…" />
          </div>
        )}
        {error && !hasData && appMode === "terminal" && (
          <p className="absolute inset-0 flex items-center justify-center text-text-secondary">
            Failed to load inventory data
          </p>
        )}

        {hasData && (
          <main
            className={`absolute inset-0 flex flex-col overflow-hidden ${
              appMode === "terminal" ? "" : "hidden"
            }`}
          >
            <ChatTab data={data} active={appMode === "terminal"} />
          </main>
        )}

        {appMode === "inventory" && (
          <div className="absolute inset-0 flex flex-col overflow-hidden">
            <div className="shrink-0 px-8 pt-4 pb-2 text-center">
              <p className="text-[13px] text-text-secondary">Models · Skills · MCP Servers · Configs</p>
            </div>

            <nav className="flex shrink-0 flex-wrap justify-center gap-1 px-8 pb-4">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  disabled={!tabsEnabled}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg border px-4 py-2 font-sans text-[13px] transition-all duration-150 ${
                    !tabsEnabled
                      ? "cursor-not-allowed border-transparent text-text-secondary opacity-40"
                      : activeTab === tab.id
                        ? "cursor-pointer border-border bg-bg-secondary text-accent"
                        : "cursor-pointer border-transparent text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <main className="mx-auto w-full max-w-[1000px] flex-1 overflow-y-auto px-8 pb-6">
              {showSpinner && <Spinner label="Detecting AI tools…" />}
              {error && !hasData && (
                <p className="py-10 text-center text-text-secondary">Failed to load inventory data</p>
              )}
              {hasData && (
                <>
                  {activeTab === "overview" && <OverviewTab data={data} modelOverrides={modelOverrides} />}
                  {activeTab === "models" && (
                    <ModelsTab data={data} modelOverrides={modelOverrides} onModelChange={setModelOverrides} />
                  )}
                  {activeTab === "skills" && <SkillsTab data={data} />}
                  {activeTab === "mcp" && <McpTab data={data} />}
                  {activeTab === "config" && <ConfigTab data={data} />}
                  {activeTab === "doctor" && <DoctorTab data={data} />}
                  {activeTab === "update" && <UpdateTab />}
                </>
              )}
            </main>

            <footer className="flex shrink-0 items-center justify-between border-t border-border px-8 py-3 text-xs text-text-secondary">
              <span>AI CLI Inventory v0.1.0</span>
              <button
                onClick={reload}
                disabled={scanning && !hasData}
                className="cursor-pointer rounded-lg border border-border bg-bg-secondary px-3.5 py-1.5 font-sans text-xs text-text-primary transition-all duration-150 hover:border-accent hover:bg-bg-card disabled:opacity-50"
              >
                🔄 Refresh
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}