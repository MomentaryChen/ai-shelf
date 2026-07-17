import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { APP_THEME_OPTIONS, applyAppTheme } from "../app-theme";
import { applyImportedLocalStorage, collectLocalStorageForBackup } from "../backup-storage";
import {
  APP_THEME_TERMINAL_BG,
  BG_PRESETS,
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  PTY_BUFFER_PRESETS,
  SCROLLBACK_PRESETS,
  TERMINAL_OPTIONS,
  UNIX_PREFERRED_SHELL_OPTIONS,
  WINDOWS_PREFERRED_SHELL_OPTIONS,
  getAppBg,
  isAppThemeTerminalBg,
  bumpDirHistory,
  loadSettings,
  saveSettings,
  subscribeSettingsChanges,
  type ChatSettings,
  type ExternalTerminal,
  type PreferredShell,
} from "../chat-settings";
import { useLocale } from "../i18n/LocaleProvider";
import { PaneShortcutBindingsEditor } from "./PaneShortcutBindingsEditor";
import { ToolLaunchArgsEditor } from "./ToolLaunchArgsEditor";
import type { AppColorTheme } from "../app-theme";
import type { LocalePreference } from "../i18n/index";
import type { MessageKey } from "../i18n/messages/en";
import { syncMainProcessFromSettings } from "../system-tray-sync";
import { useHealthMonitor } from "../hooks/useHealthMonitor";
import { installPlatform } from "../utils/install-platform";

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

const SHELL_LABEL_KEYS: Record<PreferredShell, MessageKey> = {
  auto: "shell.auto",
  pwsh: "terminal.pwsh",
  powershell: "terminal.powershell",
  cmd: "terminal.cmd",
  bash: "shell.bash",
  zsh: "shell.zsh",
  fish: "shell.fish",
  sh: "shell.sh",
};

const BG_LABEL_KEYS: Record<string, MessageKey> = {
  "Warm ink": "bg.warmInk",
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

const PTY_BUFFER_LABEL_KEYS: Record<number, MessageKey> = {
  [256 * 1024]: "ptyBuffer.256k",
  [1024 * 1024]: "ptyBuffer.1m",
  [4 * 1024 * 1024]: "ptyBuffer.4m",
  [16 * 1024 * 1024]: "ptyBuffer.16m",
  [64 * 1024 * 1024]: "ptyBuffer.64m",
};

const LOCALE_OPTIONS: { value: LocalePreference; labelKey: MessageKey }[] = [
  { value: "system", labelKey: "settings.language.system" },
  { value: "en", labelKey: "settings.language.en" },
  { value: "zh", labelKey: "settings.language.zh" },
];

const THEME_LABEL_KEYS: Record<AppColorTheme, MessageKey> = {
  system: "settings.theme.system",
  warm: "settings.theme.warm",
  light: "settings.theme.light",
  dark: "settings.theme.dark",
  contrast: "settings.theme.contrast",
};

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
  const { localePreference, setLocale, t } = useLocale();
  const { state: healthState, setPrefs: setHealthPrefs } = useHealthMonitor();
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [backupBusy, setBackupBusy] = useState<"export" | "import" | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const updateSettings = useCallback((partial: Partial<ChatSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      if (partial.appTheme !== undefined) applyAppTheme(next.appTheme);
      if (partial.systemTrayEnabled !== undefined) {
        void window.api.setSystemTrayEnabled(next.systemTrayEnabled);
      }
      if (partial.terminalPtyBufferChars !== undefined) {
        void window.api.setPtyBufferMaxChars(next.terminalPtyBufferChars);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    syncMainProcessFromSettings();
  }, []);

  useEffect(() => {
    return subscribeSettingsChanges(() => {
      const next = loadSettings();
      setSettings(next);
      applyAppTheme(next.appTheme);
      syncMainProcessFromSettings();
    });
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

  async function handleExportBackup() {
    setBackupMessage(null);
    setBackupBusy("export");
    try {
      const result = await window.api.exportBackup(collectLocalStorageForBackup());
      if ("canceled" in result && result.canceled) return;
      if (result.success) {
        setBackupMessage({ kind: "ok", text: t("settings.exportSuccess", { path: result.path }) });
      } else {
        setBackupMessage({
          kind: "err",
          text: t("settings.exportFailed", { error: result.error ?? "unknown" }),
        });
      }
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleImportBackup() {
    if (!window.confirm(t("settings.importConfirm"))) return;

    setBackupMessage(null);
    setBackupBusy("import");
    try {
      const result = await window.api.importBackup();
      if ("canceled" in result && result.canceled) return;
      if (!result.success) {
        setBackupMessage({
          kind: "err",
          text: t("settings.importFailed", { error: result.error ?? "unknown" }),
        });
        return;
      }

      applyImportedLocalStorage(result.localStorage);
      const date = new Date(result.exportedAt).toLocaleString();
      setBackupMessage({ kind: "ok", text: t("settings.importSuccess", { date }) });
      window.setTimeout(() => {
        void window.api.relaunchApp();
      }, 1200);
    } finally {
      setBackupBusy(null);
    }
  }

  const sectionTitle = compact
    ? "mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
    : "mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary";

  return (
    <div className={compact ? "flex flex-col gap-5" : "flex flex-col gap-6"}>
      {/* Language */}
      <div>
        <p className={sectionTitle}>{t("settings.language")}</p>
        <ToggleGroup
          type="single"
          value={localePreference}
          onValueChange={(value) => {
            if (!value) return;
            setLocale(value as LocalePreference);
            updateSettings({ locale: value as LocalePreference });
          }}
        >
          {LOCALE_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* App color theme */}
      <div>
        <p className={sectionTitle}>{t("settings.theme")}</p>
        <ToggleGroup
          type="single"
          value={settings.appTheme}
          onValueChange={(value) => {
            if (value) updateSettings({ appTheme: value as AppColorTheme });
          }}
        >
          {APP_THEME_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value} className="gap-2">
              <span
                className="inline-flex h-3.5 w-3.5 shrink-0 overflow-hidden rounded-sm border border-border"
                aria-hidden
              >
                <span className="h-full w-1/2" style={{ background: opt.preview.bg }} />
                <span className="h-full w-1/2" style={{ background: opt.preview.accent }} />
              </span>
              {t(THEME_LABEL_KEYS[opt.value])}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="mt-1.5 text-[11px] text-text-tertiary">{t("settings.themeHint")}</p>
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={browsePath}
            className="shrink-0 text-[12px]"
          >
            {t("settings.browse")}
          </Button>
        </div>
        {settings.dirHistory.length > 0 && (
          <div className="mt-1.5 flex justify-end px-0.5">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => updateSettings({ dirHistory: [], workingDir: "" })}
              className="h-auto p-0 text-[10px] text-text-tertiary hover:text-fail"
            >
              {t("settings.clearHistory")}
            </Button>
          </div>
        )}
      </div>

      {/* Terminal preference */}
      <div>
        <p className={sectionTitle}>{t("settings.externalTerminal")}</p>
        <ToggleGroup
          type="single"
          value={settings.externalTerminal}
          onValueChange={(value) => {
            if (value) updateSettings({ externalTerminal: value as ExternalTerminal });
          }}
        >
          {TERMINAL_OPTIONS.map((opt) => (
            <ToggleGroupItem key={opt.value} value={opt.value}>
              {opt.value === "auto" ? "🔍 " : ""}
              {opt.value === "wt" ? "🪟 " : ""}
              {opt.value === "pwsh" ? "🔵 " : ""}
              {opt.value === "powershell" ? "💙 " : ""}
              {opt.value === "cmd" ? "⬛ " : ""}
              {t(TERMINAL_LABEL_KEYS[opt.value])}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Embedded PTY shell preference */}
      <div>
        <p className={sectionTitle}>{t("settings.preferredShell")}</p>
        <p className="mb-3 text-[11px] leading-snug text-text-tertiary">
          {t("settings.preferredShellHint")}
        </p>
        <ToggleGroup
          type="single"
          value={settings.preferredShell}
          onValueChange={(value) => {
            if (value) updateSettings({ preferredShell: value as PreferredShell });
          }}
        >
          {(installPlatform() === "win32"
            ? WINDOWS_PREFERRED_SHELL_OPTIONS
            : UNIX_PREFERRED_SHELL_OPTIONS
          ).map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {t(SHELL_LABEL_KEYS[value])}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Tool launch arguments */}
      <div>
        <p className={sectionTitle}>{t("settings.toolLaunchArgs.title")}</p>
        <p className="mb-3 text-[11px] leading-snug text-text-tertiary">
          {t("settings.toolLaunchArgs.subtitle")}
        </p>
        <ToolLaunchArgsEditor
          compact={compact}
          args={settings.toolLaunchArgs}
          onChange={(toolLaunchArgs) => updateSettings({ toolLaunchArgs })}
        />
      </div>

      {/* Terminal background */}
      <div>
        <p className={sectionTitle}>{t("settings.terminalBg")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={
              BG_PRESETS.some((p) => p.value === settings.terminalBg)
                ? settings.terminalBg
                : undefined
            }
            onValueChange={(value) => {
              if (value !== undefined) updateSettings({ terminalBg: value });
            }}
          >
            {BG_PRESETS.map((p) => {
              const labelKey = BG_LABEL_KEYS[p.label];
              return (
                <ToggleGroupItem
                  key={p.label}
                  value={p.value}
                  title={labelKey ? t(labelKey) : p.label}
                  className="gap-2"
                >
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-sm border border-white/20"
                    style={{ background: p.preview }}
                  />
                  {labelKey ? t(labelKey) : p.label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
          <Label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-normal transition-all duration-150 ${
              !BG_PRESETS.some((p) => p.value === settings.terminalBg) &&
              !isAppThemeTerminalBg(settings.terminalBg)
                ? "border-accent/60 bg-accent/10 font-medium text-accent"
                : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
            }`}
          >
            <input
              type="color"
              value={
                isAppThemeTerminalBg(settings.terminalBg) ? getAppBg() : settings.terminalBg
              }
              onChange={(e) => updateSettings({ terminalBg: e.target.value })}
              className="h-3.5 w-3.5 cursor-pointer rounded-sm border-0 bg-transparent p-0 outline-none"
            />
            {t("settings.custom")}
          </Label>
        </div>
      </div>

      {/* Pane shortcuts */}
      <div>
        <p className={sectionTitle}>{t("settings.paneShortcut.title")}</p>
        <p className="mb-3 text-[11px] leading-snug text-text-tertiary">
          {t("settings.paneShortcut.subtitle")}
        </p>
        <PaneShortcutBindingsEditor
          compact={compact}
          bindings={settings.paneShortcuts}
          onChange={(paneShortcuts) => updateSettings({ paneShortcuts })}
        />
      </div>

      {/* Terminal display */}
      <div>
        <p className={sectionTitle}>{t("settings.terminalDisplay")}</p>
        <div className="flex flex-col gap-4">
          <div>
            <Label className="mb-1.5 block text-[12px] font-normal text-text-secondary">
              {t("settings.fontFamily")}
            </Label>
            <Input
              type="text"
              value={settings.terminalFontFamily}
              onChange={(e) => updateSettings({ terminalFontFamily: e.target.value })}
              spellCheck={false}
              className="border-border bg-bg-secondary font-mono text-[12px] focus-visible:border-accent/40"
              title={DEFAULT_TERMINAL_FONT_FAMILY}
            />
            <div className="mt-1.5 flex justify-end">
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => updateSettings({ terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY })}
                className="h-auto p-0 text-[10px] text-text-tertiary hover:text-text-primary"
              >
                {t("settings.resetDefault")}
              </Button>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-[12px] font-normal text-text-secondary">
              {t("settings.fontSize", { size: settings.terminalFontSize })}
            </Label>
            <div className="flex items-center gap-3">
              <Slider
                min={8}
                max={32}
                step={1}
                value={[settings.terminalFontSize]}
                onValueChange={([n]) => {
                  if (n !== undefined) updateSettings({ terminalFontSize: n });
                }}
                className="min-w-0 flex-1"
              />
              <Input
                type="number"
                min={8}
                max={32}
                value={settings.terminalFontSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) updateSettings({ terminalFontSize: n });
                }}
                className="w-14 shrink-0 border-border bg-bg-secondary px-2 py-1.5 text-center font-mono text-[12px] focus-visible:border-accent/40"
              />
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => updateSettings({ terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE })}
                className="h-auto shrink-0 p-0 text-[10px] text-text-tertiary hover:text-text-primary"
              >
                {DEFAULT_TERMINAL_FONT_SIZE}px
              </Button>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-[12px] font-normal text-text-secondary">
              {t("settings.scrollback")}
            </Label>
            <ToggleGroup
              type="single"
              value={String(settings.terminalScrollback)}
              onValueChange={(value) => {
                if (value) updateSettings({ terminalScrollback: Number(value) });
              }}
            >
              {SCROLLBACK_PRESETS.map((p) => (
                <ToggleGroupItem key={p.value} value={String(p.value)} size="sm">
                  {t(SCROLLBACK_LABEL_KEYS[p.value]!)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                min={1000}
                max={100000}
                step={1000}
                value={settings.terminalScrollback}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) updateSettings({ terminalScrollback: n });
                }}
                className="w-28 border-border bg-bg-secondary font-mono text-[12px] focus-visible:border-accent/40"
              />
              <span className="text-[11px] text-text-tertiary">{t("settings.scrollbackHint")}</span>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-[12px] font-normal text-text-secondary">
              {t("settings.ptyBuffer")}
            </Label>
            <ToggleGroup
              type="single"
              value={String(settings.terminalPtyBufferChars)}
              onValueChange={(value) => {
                if (value) updateSettings({ terminalPtyBufferChars: Number(value) });
              }}
            >
              {PTY_BUFFER_PRESETS.map((p) => (
                <ToggleGroupItem key={p.value} value={String(p.value)} size="sm">
                  {t(PTY_BUFFER_LABEL_KEYS[p.value]!)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                min={256 * 1024}
                max={64 * 1024 * 1024}
                step={256 * 1024}
                value={settings.terminalPtyBufferChars}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) updateSettings({ terminalPtyBufferChars: n });
                }}
                className="w-28 border-border bg-bg-secondary font-mono text-[12px] focus-visible:border-accent/40"
              />
              <span className="text-[11px] text-text-tertiary">{t("settings.ptyBufferHint")}</span>
            </div>
          </div>

          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
            <Checkbox
              checked={settings.terminalRightClickPaste}
              onCheckedChange={(v) => updateSettings({ terminalRightClickPaste: v === true })}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-primary">{t("settings.rightClickPaste")}</span>
              <span className="text-[11px] leading-snug text-text-tertiary">
                {t("settings.rightClickPasteHint")}
              </span>
            </span>
          </Label>

          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
            <Checkbox
              checked={settings.terminalCopyOnSelect}
              onCheckedChange={(v) => updateSettings({ terminalCopyOnSelect: v === true })}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-primary">{t("settings.copyOnSelect")}</span>
              <span className="text-[11px] leading-snug text-text-tertiary">
                {t("settings.copyOnSelectHint")}
              </span>
            </span>
          </Label>

          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
            <Checkbox
              checked={settings.terminalWebglEnabled}
              onCheckedChange={(v) => updateSettings({ terminalWebglEnabled: v === true })}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-primary">{t("settings.webgl")}</span>
              <span className="text-[11px] leading-snug text-text-tertiary">
                {t("settings.webglHint")}
              </span>
            </span>
          </Label>
        </div>
      </div>

      {/* Environment health monitor */}
      <div>
        <p className={sectionTitle}>{t("healthMonitor.settingsTitle")}</p>
        <p className="mb-3 text-[11px] leading-snug text-text-tertiary">
          {t("healthMonitor.settingsHint")}
        </p>
        <div className="space-y-2">
          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
            <Checkbox
              checked={healthState?.prefs.backgroundChecksEnabled ?? true}
              onCheckedChange={(v) => void setHealthPrefs({ backgroundChecksEnabled: v === true })}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-primary">{t("healthMonitor.backgroundChecks")}</span>
              <span className="text-[11px] leading-snug text-text-tertiary">
                {t("healthMonitor.backgroundChecksHint")}
              </span>
            </span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
            <Checkbox
              checked={healthState?.prefs.trayBadgeEnabled ?? true}
              onCheckedChange={(v) => void setHealthPrefs({ trayBadgeEnabled: v === true })}
              className="mt-0.5"
              disabled={!healthState?.prefs.backgroundChecksEnabled}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-primary">{t("healthMonitor.trayBadge")}</span>
              <span className="text-[11px] leading-snug text-text-tertiary">
                {t("healthMonitor.trayBadgeHint")}
              </span>
            </span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
            <Checkbox
              checked={healthState?.prefs.weeklyDoctorSummary ?? false}
              onCheckedChange={(v) => void setHealthPrefs({ weeklyDoctorSummary: v === true })}
              className="mt-0.5"
              disabled={!healthState?.prefs.backgroundChecksEnabled}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-primary">{t("healthMonitor.weeklySummary")}</span>
              <span className="text-[11px] leading-snug text-text-tertiary">
                {t("healthMonitor.weeklySummaryHint")}
              </span>
            </span>
          </Label>
        </div>
      </div>

      {/* System tray */}
      <div>
        <p className={sectionTitle}>{t("settings.systemTray")}</p>
        <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
          <Checkbox
            checked={settings.systemTrayEnabled}
            onCheckedChange={(v) => updateSettings({ systemTrayEnabled: v === true })}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] text-text-primary">{t("settings.systemTrayEnable")}</span>
            <span className="text-[11px] leading-snug text-text-tertiary">
              {t("settings.systemTrayHint")}
            </span>
          </span>
        </Label>
      </div>

      {/* Pane agent awareness */}
      <div>
        <p className={sectionTitle}>{t("settings.paneAgentAwareness")}</p>
        <p className="mb-3 text-[11px] leading-snug text-text-tertiary">
          {t("settings.paneAgentAwarenessHint")}
        </p>
        <div className="flex flex-col gap-2">
          <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
            <Checkbox
              checked={settings.paneAgentAwarenessEnabled}
              onCheckedChange={(v) => updateSettings({ paneAgentAwarenessEnabled: v === true })}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] text-text-primary">
                {t("settings.paneAgentAwarenessEnable")}
              </span>
            </span>
          </Label>

          {settings.paneAgentAwarenessEnabled && (
            <>
              <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
                <Checkbox
                  checked={!settings.paneAgentNotifySound}
                  onCheckedChange={(v) => updateSettings({ paneAgentNotifySound: v !== true })}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-text-primary">
                    {t("settings.paneAgentNotifySound")}
                  </span>
                  <span className="text-[11px] leading-snug text-text-tertiary">
                    {t("settings.paneAgentNotifySoundHint")}
                  </span>
                </span>
              </Label>
              <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
                <Checkbox
                  checked={!settings.paneAgentNotifySystem}
                  onCheckedChange={(v) => updateSettings({ paneAgentNotifySystem: v !== true })}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-text-primary">
                    {t("settings.paneAgentNotifySystem")}
                  </span>
                  <span className="text-[11px] leading-snug text-text-tertiary">
                    {t("settings.paneAgentNotifySystemHint")}
                  </span>
                </span>
              </Label>
              <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
                <Checkbox
                  checked={settings.paneAgentNotifyTrayBadge}
                  onCheckedChange={(v) => updateSettings({ paneAgentNotifyTrayBadge: v === true })}
                  className="mt-0.5"
                />
                <span className="text-[13px] text-text-primary">{t("settings.paneAgentNotifyTrayBadge")}</span>
              </Label>
              <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 font-normal transition-colors hover:border-accent/40">
                <Checkbox
                  checked={settings.paneAgentNotifyUnfocusedOnly}
                  onCheckedChange={(v) =>
                    updateSettings({ paneAgentNotifyUnfocusedOnly: v === true })
                  }
                  className="mt-0.5"
                />
                <span className="text-[13px] text-text-primary">
                  {t("settings.paneAgentNotifyUnfocusedOnly")}
                </span>
              </Label>

              <div className="rounded-lg border border-border px-3.5 py-3">
                <p className="mb-2 text-[13px] text-text-primary">
                  {t("settings.paneAgentStallTimeout")}
                </p>
                <ToggleGroup
                  type="single"
                  value={String(settings.paneAgentStallTimeoutSec)}
                  onValueChange={(v) => {
                    if (!v) return;
                    updateSettings({ paneAgentStallTimeoutSec: Number(v) });
                  }}
                  className="flex flex-wrap justify-start gap-1"
                >
                  <ToggleGroupItem value="0" size="sm" className="text-xs">
                    {t("settings.paneAgentStallOff")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="60" size="sm" className="text-xs">
                    {t("settings.paneAgentStallMin", { minutes: 1 })}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="120" size="sm" className="text-xs">
                    {t("settings.paneAgentStallMin", { minutes: 2 })}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="300" size="sm" className="text-xs">
                    {t("settings.paneAgentStallMin", { minutes: 5 })}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Data backup & restore */}
      <div>
        <p className={sectionTitle}>{t("settings.backup")}</p>
        <p className="mb-3 text-[11px] leading-snug text-text-tertiary">{t("settings.backupHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExportBackup()}
            disabled={backupBusy !== null}
          >
            {backupBusy === "export" ? "…" : t("settings.exportBackup")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleImportBackup()}
            disabled={backupBusy !== null}
          >
            {backupBusy === "import" ? "…" : t("settings.importBackup")}
          </Button>
        </div>
        {backupMessage && (
          <p
            className={`mt-2 text-[11px] leading-snug ${
              backupMessage.kind === "ok" ? "text-ok" : "text-fail"
            }`}
          >
            {backupMessage.text}
          </p>
        )}
      </div>
    </div>
  );
}
