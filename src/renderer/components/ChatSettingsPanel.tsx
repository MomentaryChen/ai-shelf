import { useCallback, useEffect, useState } from "react";
import {
  BG_PRESETS,
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  SCROLLBACK_PRESETS,
  TERMINAL_OPTIONS,
  getAppBg,
  bumpDirHistory,
  loadSettings,
  saveSettings,
  type ChatSettings,
  SETTINGS_KEY,
  type ExternalTerminal,
} from "../chat-settings";
import { useLocale } from "../i18n/LocaleProvider";
import type { AppLocale } from "../i18n/index";
import type { MessageKey } from "../i18n/messages/en";

interface ChatSettingsPanelProps {
  compact?: boolean;
}

const TERMINAL_LABEL_KEYS: Record<ExternalTerminal, MessageKey> = {
  auto: "terminal.auto",
  wt: "terminal.wt",
  pwsh: "terminal.pwsh",
  powershell: "terminal.powershell",
  cmd: "terminal.cmd",
};

const BG_LABEL_KEYS: Record<string, MessageKey> = {
  "Windows Terminal": "bg.wt",
  "App theme": "bg.appTheme",
  "Pure black": "bg.black",
  "PowerShell blue": "bg.psBlue",
  "VS Code": "bg.vscode",
};

const SCROLLBACK_LABEL_KEYS: Record<number, MessageKey> = {
  5000: "scrollback.5k",
  10000: "scrollback.10k",
  20000: "scrollback.20k",
  50000: "scrollback.50k",
};

const LOCALE_OPTIONS: { value: AppLocale; labelKey: MessageKey }[] = [
  { value: "en", labelKey: "settings.language.en" },
  { value: "zh", labelKey: "settings.language.zh" },
];

function buildDirOptions(workingDir: string, dirHistory: string[]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  const add = (dir: string) => {
    if (!dir || seen.has(dir)) return;
    seen.add(dir);
    options.push(dir);
  };
  add(workingDir);
  for (const dir of dirHistory) add(dir);
  return options;
}

function dirOptionLabel(dir: string): string {
  const name = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
  return `${name} — ${dir}`;
}

export function ChatSettingsPanel({ compact = false }: ChatSettingsPanelProps) {
  const { locale, setLocale, t } = useLocale();
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
      updateSettings({ workingDir: dir, dirHistory: bumpDirHistory(settings.dirHistory, dir, 10) });
    }
  }

  function selectDir(dir: string) {
    if (!dir) {
      updateSettings({ workingDir: "" });
      return;
    }
    updateSettings({ workingDir: dir, dirHistory: bumpDirHistory(settings.dirHistory, dir, 10) });
  }

  const dirOptions = buildDirOptions(settings.workingDir, settings.dirHistory);

  const sectionTitle = compact
    ? "mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
    : "mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary";

  return (
    <div className={compact ? "flex flex-col gap-5" : "flex flex-col gap-6"}>
      {/* Language */}
      <div>
        <p className={sectionTitle}>{t("settings.language")}</p>
        <div className="flex flex-wrap gap-2">
          {LOCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setLocale(opt.value);
                updateSettings({ locale: opt.value });
              }}
              className={`cursor-pointer rounded-lg border px-4 py-2 text-[13px] transition-all duration-150 ${
                locale === opt.value
                  ? "border-accent/60 bg-accent/10 font-medium text-accent"
                  : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Working directory */}
      <div>
        <p className={sectionTitle}>{t("settings.workingDir")}</p>
        <div className="flex items-center gap-2">
          <select
            value={settings.workingDir}
            onChange={(e) => selectDir(e.target.value)}
            className="min-w-0 flex-1 cursor-pointer truncate rounded-lg border border-border bg-bg-secondary px-3 py-2 text-[12px] text-text-primary focus:border-accent/40 focus:outline-none"
            title={settings.workingDir || undefined}
          >
            <option value="">{t("settings.homeDir")}</option>
            {dirOptions.map((dir) => (
              <option key={dir} value={dir}>
                {dirOptionLabel(dir)}
              </option>
            ))}
          </select>
          <button
            onClick={browsePath}
            className="shrink-0 cursor-pointer rounded-lg border border-border px-3.5 py-2 text-[12px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            {t("settings.browse")}
          </button>
        </div>
        {settings.dirHistory.length > 0 && (
          <div className="mt-1.5 flex justify-end px-0.5">
            <button
              onClick={() => updateSettings({ dirHistory: [], workingDir: "" })}
              className="cursor-pointer text-[10px] text-text-tertiary transition-colors hover:text-fail"
            >
              {t("settings.clearHistory")}
            </button>
          </div>
        )}
      </div>

      {/* Terminal preference */}
      <div>
        <p className={sectionTitle}>{t("settings.externalTerminal")}</p>
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
              {opt.value === "auto" ? "🔍 " : ""}
              {opt.value === "wt" ? "🪟 " : ""}
              {opt.value === "pwsh" ? "🔵 " : ""}
              {opt.value === "powershell" ? "💙 " : ""}
              {opt.value === "cmd" ? "⬛ " : ""}
              {t(TERMINAL_LABEL_KEYS[opt.value])}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal background */}
      <div>
        <p className={sectionTitle}>{t("settings.terminalBg")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {BG_PRESETS.map((p) => {
            const active = settings.terminalBg === p.value;
            const labelKey = BG_LABEL_KEYS[p.label];
            return (
              <button
                key={p.label}
                onClick={() => updateSettings({ terminalBg: p.value })}
                title={labelKey ? t(labelKey) : p.label}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition-all duration-150 ${
                  active
                    ? "border-accent/60 bg-accent/10 font-medium text-accent"
                    : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
                }`}
              >
                <span
                  className="inline-block h-3.5 w-3.5 rounded-sm border border-white/20"
                  style={{ background: p.preview }}
                />
                {labelKey ? t(labelKey) : p.label}
              </button>
            );
          })}
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition-all duration-150 ${
              !BG_PRESETS.some((p) => p.value === settings.terminalBg) && settings.terminalBg
                ? "border-accent/60 bg-accent/10 font-medium text-accent"
                : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
            }`}
          >
            <input
              type="color"
              value={settings.terminalBg || getAppBg()}
              onChange={(e) => updateSettings({ terminalBg: e.target.value })}
              className="h-3.5 w-3.5 cursor-pointer rounded-sm border-0 bg-transparent p-0 outline-none"
            />
            {t("settings.custom")}
          </label>
        </div>
      </div>

      {/* Terminal display */}
      <div>
        <p className={sectionTitle}>{t("settings.terminalDisplay")}</p>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[12px] text-text-secondary">{t("settings.fontFamily")}</label>
            <input
              type="text"
              value={settings.terminalFontFamily}
              onChange={(e) => updateSettings({ terminalFontFamily: e.target.value })}
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 font-mono text-[12px] text-text-primary focus:border-accent/40 focus:outline-none"
              title={DEFAULT_TERMINAL_FONT_FAMILY}
            />
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => updateSettings({ terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY })}
                className="cursor-pointer text-[10px] text-text-tertiary transition-colors hover:text-text-primary"
              >
                {t("settings.resetDefault")}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] text-text-secondary">
              {t("settings.fontSize", { size: settings.terminalFontSize })}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={8}
                max={32}
                step={1}
                value={settings.terminalFontSize}
                onChange={(e) => updateSettings({ terminalFontSize: Number(e.target.value) })}
                className="min-w-0 flex-1 cursor-pointer accent-accent"
              />
              <input
                type="number"
                min={8}
                max={32}
                value={settings.terminalFontSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) updateSettings({ terminalFontSize: n });
                }}
                className="w-14 shrink-0 rounded-lg border border-border bg-bg-secondary px-2 py-1.5 text-center font-mono text-[12px] text-text-primary focus:border-accent/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => updateSettings({ terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE })}
                className="shrink-0 cursor-pointer text-[10px] text-text-tertiary transition-colors hover:text-text-primary"
              >
                {DEFAULT_TERMINAL_FONT_SIZE}px
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] text-text-secondary">{t("settings.scrollback")}</label>
            <div className="flex flex-wrap gap-2">
              {SCROLLBACK_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => updateSettings({ terminalScrollback: p.value })}
                  className={`cursor-pointer rounded-lg border px-3.5 py-2 text-[13px] transition-all duration-150 ${
                    settings.terminalScrollback === p.value
                      ? "border-accent/60 bg-accent/10 font-medium text-accent"
                      : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
                  }`}
                >
                  {t(SCROLLBACK_LABEL_KEYS[p.value])}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1000}
                max={100000}
                step={1000}
                value={settings.terminalScrollback}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) updateSettings({ terminalScrollback: n });
                }}
                className="w-28 rounded-lg border border-border bg-bg-secondary px-3 py-2 font-mono text-[12px] text-text-primary focus:border-accent/40 focus:outline-none"
              />
              <span className="text-[11px] text-text-tertiary">{t("settings.scrollbackHint")}</span>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 transition-colors hover:border-accent/40">
            <input
              type="checkbox"
              checked={settings.terminalRightClickPaste}
              onChange={(e) => updateSettings({ terminalRightClickPaste: e.target.checked })}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded accent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-primary">{t("settings.rightClickPaste")}</span>
              <span className="text-[11px] leading-snug text-text-tertiary">{t("settings.rightClickPasteHint")}</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
