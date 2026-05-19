import { useCallback, useEffect, useState } from "react";
import {
  BG_PRESETS,
  TERMINAL_OPTIONS,
  getAppBg,
  loadSettings,
  saveSettings,
  type ChatSettings,
  SETTINGS_KEY,
} from "../chat-settings";

interface ChatSettingsPanelProps {
  compact?: boolean;
}

export function ChatSettingsPanel({ compact = false }: ChatSettingsPanelProps) {
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);

  const updateSettings = useCallback((partial: Partial<ChatSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) setSettings(loadSettings());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function browsePath() {
    const dir = await window.api.pickFolder(settings.workingDir || undefined);
    if (dir) {
      const history = [dir, ...settings.dirHistory.filter((d) => d !== dir)].slice(0, 10);
      updateSettings({ workingDir: dir, dirHistory: history });
    }
  }

  const sectionTitle = compact
    ? "mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
    : "mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary";

  return (
    <div className={compact ? "flex flex-col gap-5" : "flex flex-col gap-6"}>
      {/* Working directory */}
      <div>
        <p className={sectionTitle}>Working directory</p>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-bg-secondary px-3 py-2">
            <svg className="h-4 w-4 shrink-0 text-text-tertiary" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            {settings.workingDir ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-text-primary">
                  {settings.workingDir.split(/[\\/]/).filter(Boolean).pop()}
                </p>
                <p className="truncate font-mono text-[10px] text-text-tertiary">{settings.workingDir}</p>
              </div>
            ) : (
              <span className="text-[12px] text-text-tertiary italic">~ (home directory)</span>
            )}
          </div>
          <button
            onClick={browsePath}
            className="cursor-pointer rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Browse…
          </button>
          {settings.workingDir && (
            <button
              onClick={() => updateSettings({ workingDir: "" })}
              className="cursor-pointer rounded-lg border border-border px-3 py-2 text-[12px] text-text-secondary transition-colors hover:border-fail/40 hover:text-fail"
              title="Reset to home"
            >
              ✕
            </button>
          )}
        </div>

        {/* History */}
        {settings.dirHistory.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between px-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Recent</span>
              <button
                onClick={() => updateSettings({ dirHistory: [], workingDir: "" })}
                className="cursor-pointer text-[10px] text-text-tertiary transition-colors hover:text-fail"
              >
                Clear all
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border divide-y divide-border">
              {settings.dirHistory.map((dir) => {
                const isActive = dir === settings.workingDir;
                const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
                return (
                  <div
                    key={dir}
                    onClick={() => updateSettings({ workingDir: dir })}
                    className={`group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-bg-secondary ${isActive ? "bg-accent/5" : ""}`}
                  >
                    <svg
                      className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-accent" : "text-text-tertiary"}`}
                      viewBox="0 0 20 20" fill="currentColor"
                    >
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[12px] font-medium ${isActive ? "text-accent" : "text-text-primary"}`}>
                        {name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-text-tertiary">{dir}</p>
                    </div>
                    {isActive && (
                      <svg className="h-3.5 w-3.5 shrink-0 text-accent" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = settings.dirHistory.filter((d) => d !== dir);
                        updateSettings({ dirHistory: next, ...(isActive ? { workingDir: "" } : {}) });
                      }}
                      className="hidden shrink-0 cursor-pointer rounded p-0.5 text-[11px] text-text-tertiary transition-colors hover:bg-fail/10 hover:text-fail group-hover:flex"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Terminal preference */}
      <div>
        <p className={sectionTitle}>
          External terminal preference
        </p>
        <div className="flex flex-wrap gap-2">
          {TERMINAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateSettings({ externalTerminal: opt.value })}
              className={`cursor-pointer rounded-lg border px-4 py-2 text-[13px] transition-all duration-150 ${
                settings.externalTerminal === opt.value
                  ? "border-accent/60 bg-accent/10 font-medium text-accent"
                  : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal background */}
      <div>
        <p className={sectionTitle}>
          Terminal background
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {BG_PRESETS.map((p) => {
            const active = settings.terminalBg === p.value;
            return (
              <button
                key={p.label}
                onClick={() => updateSettings({ terminalBg: p.value })}
                title={p.label}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition-all duration-150 ${
                  active
                    ? "border-accent/60 bg-accent/10 font-medium text-accent"
                    : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
                }`}
              >
                <span className="inline-block h-3.5 w-3.5 rounded-sm border border-white/20" style={{ background: p.preview }} />
                {p.label}
              </button>
            );
          })}
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition-all duration-150 ${
            !BG_PRESETS.some((p) => p.value === settings.terminalBg) && settings.terminalBg
              ? "border-accent/60 bg-accent/10 font-medium text-accent"
              : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
          }`}>
            <input
              type="color"
              value={settings.terminalBg || getAppBg()}
              onChange={(e) => updateSettings({ terminalBg: e.target.value })}
              className="h-3.5 w-3.5 cursor-pointer rounded-sm border-0 bg-transparent p-0 outline-none"
            />
            Custom
          </label>
        </div>
      </div>


    </div>
  );
}
