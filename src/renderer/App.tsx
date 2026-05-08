import { useCallback, useEffect, useState } from "react";
import type { ProviderEntry } from "./types";
import { Spinner } from "./components/Spinner";
import { OverviewTab } from "./components/OverviewTab";
import { ModelsTab } from "./components/ModelsTab";
import { SkillsTab } from "./components/SkillsTab";
import { McpTab } from "./components/McpTab";
import { ConfigTab } from "./components/ConfigTab";
import { DoctorTab } from "./components/DoctorTab";
import { UpdateTab } from "./components/UpdateTab";

import { ChatTab } from "./components/ChatTab";

type TabId = "overview" | "models" | "skills" | "mcp" | "config" | "doctor" | "update" | "chat";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "📋 Overview" },
  { id: "chat",     label: "💬 Chat" },
  { id: "models",   label: "🧠 Models" },
  { id: "skills",   label: "⚡ Skills" },
  { id: "mcp",      label: "🔌 MCP" },
  { id: "config",   label: "⚙️ Config" },
  { id: "doctor",   label: "🩺 Doctor" },
  { id: "update",   label: "🔄 Update" },
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [data, setData] = useState<ProviderEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setData(null);
    setError(false);
    setModelOverrides({});
    try {
      const entries = await window.api.getInventory();
      setData(entries);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="px-8 pt-6 pb-4 text-center">
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" className="h-8 w-8 shrink-0">
            <rect width="512" height="512" rx="96" fill="#0d0d14"/>
            <rect width="512" height="512" rx="96" fill="url(#appIconGrad)" opacity="0.6"/>
            <rect x="60" y="60" width="392" height="392" rx="48" fill="none" stroke="#1e1e30" strokeWidth="6"/>
            <rect x="172" y="44" width="32" height="20" rx="5" fill="#1e2240"/>
            <rect x="230" y="44" width="52" height="20" rx="5" fill="#1e2240"/>
            <rect x="308" y="44" width="32" height="20" rx="5" fill="#1e2240"/>
            <rect x="172" y="448" width="32" height="20" rx="5" fill="#1e2240"/>
            <rect x="230" y="448" width="52" height="20" rx="5" fill="#1e2240"/>
            <rect x="308" y="448" width="32" height="20" rx="5" fill="#1e2240"/>
            <rect x="44" y="172" width="20" height="32" rx="5" fill="#1e2240"/>
            <rect x="44" y="230" width="20" height="52" rx="5" fill="#1e2240"/>
            <rect x="44" y="308" width="20" height="32" rx="5" fill="#1e2240"/>
            <rect x="448" y="172" width="20" height="32" rx="5" fill="#1e2240"/>
            <rect x="448" y="230" width="20" height="52" rx="5" fill="#1e2240"/>
            <rect x="448" y="308" width="20" height="32" rx="5" fill="#1e2240"/>
            <rect x="88" y="88" width="336" height="336" rx="32" fill="#12121f"/>
            <rect x="88" y="88" width="336" height="52" rx="32" fill="#1a1a2e"/>
            <rect x="88" y="112" width="336" height="28" fill="#1a1a2e"/>
            <circle cx="124" cy="114" r="9" fill="#d97757" opacity="0.9"/>
            <circle cx="152" cy="114" r="9" fill="#e2b55a" opacity="0.9"/>
            <circle cx="180" cy="114" r="9" fill="#57d985" opacity="0.9"/>
            <path d="M116 174 L136 194 L116 214" stroke="#a78bfa" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="148" y="178" width="116" height="12" rx="6" fill="#4f46e5" opacity="0.9"/>
            <rect x="272" y="178" width="60" height="12" rx="6" fill="#6366f1" opacity="0.5"/>
            <path d="M116 234 L136 254 L116 274" stroke="#60a5fa" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
            <rect x="148" y="238" width="144" height="12" rx="6" fill="#3b82f6" opacity="0.7"/>
            <rect x="300" y="238" width="80" height="12" rx="6" fill="#93c5fd" opacity="0.4"/>
            <path d="M116 294 L136 314 L116 334" stroke="#818cf8" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
            <rect x="148" y="298" width="96" height="12" rx="6" fill="#6366f1" opacity="0.5"/>
            <rect x="252" y="298" width="112" height="12" rx="6" fill="#818cf8" opacity="0.3"/>
            <rect x="148" y="354" width="18" height="20" rx="3" fill="#a78bfa" opacity="0.9"/>
            <circle cx="323" cy="364" r="12" fill="#d97757"/>
            <circle cx="355" cy="364" r="12" fill="#6e40c9"/>
            <circle cx="387" cy="364" r="12" fill="#e5e5e5" opacity="0.85"/>
            <defs>
              <linearGradient id="appIconGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1a1a3e"/>
                <stop offset="100%" stopColor="#0a0a14"/>
              </linearGradient>
            </defs>
          </svg>
          AI CLI Inventory
        </h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Models · Skills · MCP Servers · Configs
        </p>
      </header>

      {/* Tabs */}
      <nav className="flex flex-wrap justify-center gap-1 px-8 pb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            disabled={!data && !error}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg border px-4 py-2 font-sans text-[13px] transition-all duration-150 ${
              !data && !error
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

      {/* Content */}
      <main className={`flex-1 ${
        activeTab === "chat"
          ? "flex flex-col overflow-hidden"
          : "overflow-y-auto mx-auto w-full max-w-[1000px] px-8 pb-6"
      }`}>
        {!data && !error && <Spinner label="Detecting AI tools…" />}
        {error && (
          <p className="py-10 text-center text-text-secondary">Failed to load inventory data</p>
        )}
        {data && (
          <>
            {activeTab === "overview" && <OverviewTab data={data} modelOverrides={modelOverrides} />}
            {activeTab === "models" && <ModelsTab data={data} modelOverrides={modelOverrides} onModelChange={setModelOverrides} />}
            {activeTab === "skills" && <SkillsTab data={data} />}
            {activeTab === "mcp" && <McpTab data={data} />}
            {activeTab === "config" && <ConfigTab data={data} />}
            {activeTab === "doctor" && <DoctorTab data={data} />}
            {activeTab === "update" && <UpdateTab />}
            {activeTab === "chat" && <ChatTab data={data} />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-border px-8 py-3 text-xs text-text-secondary">
        <span>AI CLI Inventory v0.1.0</span>
        <button
          onClick={load}
          className="cursor-pointer rounded-lg border border-border bg-bg-secondary px-3.5 py-1.5 font-sans text-xs text-text-primary transition-all duration-150 hover:border-accent hover:bg-bg-card"
        >
          🔄 Refresh
        </button>
      </footer>
    </div>
  );
}
