import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Braces, Check, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  REGEX_BUILTIN_PRESETS,
  REGEX_FLAG_ORDER,
  createUserPreset,
  flagsToString,
  loadSavedPresets,
  parseFlags,
  replaceRegex,
  saveSavedPresets,
  testRegex,
  type RegexBuiltinPresetId,
  type RegexFlag,
  type RegexFlags,
  type RegexPreset,
} from "../utils/regex-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

type Mode = "test" | "replace";

const FLAG_LABEL_KEYS: Record<RegexFlag, MessageKey> = {
  g: "regex.flag.g",
  i: "regex.flag.i",
  m: "regex.flag.m",
  s: "regex.flag.s",
  u: "regex.flag.u",
};

const PRESET_LABEL_KEYS: Record<RegexBuiltinPresetId, MessageKey> = {
  email: "regex.preset.email",
  url: "regex.preset.url",
  ipv4: "regex.preset.ipv4",
  uuid: "regex.preset.uuid",
  hexColor: "regex.preset.hexColor",
  whitespace: "regex.preset.whitespace",
  quoted: "regex.preset.quoted",
  digits: "regex.preset.digits",
};

const monoField =
  "h-[160px] resize-none rounded-[22px] border-border bg-bg-primary font-mono text-[13px] text-text-primary placeholder:text-text-tertiary [field-sizing:fixed]";

const monoInput =
  "h-10 rounded-[22px] border-border bg-bg-primary font-mono text-[13px] text-text-primary placeholder:text-text-tertiary";

function CopyButton({ value, copyKey, copiedKey }: { value: string; copyKey: MessageKey; copiedKey: MessageKey }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!value}
      title={copied ? t(copiedKey) : t(copyKey)}
      className="h-8 shrink-0 px-2 text-[12px]"
      onClick={() => {
        void (async () => {
          const ok = await writeClipboardText(value);
          if (!ok) return;
          setCopied(true);
          if (timerRef.current != null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            setCopied(false);
            timerRef.current = null;
          }, 1600);
        })();
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="hidden @sm:inline">{copied ? t(copiedKey) : t(copyKey)}</span>
    </Button>
  );
}

function applyPreset(
  preset: RegexPreset,
  setters: {
    setPattern: (v: string) => void;
    setFlags: (v: RegexFlags) => void;
    setInput: (v: string) => void;
    setReplacement: (v: string) => void;
    setMode: (v: Mode) => void;
  },
) {
  setters.setPattern(preset.pattern);
  setters.setFlags(parseFlags(preset.flags));
  if (preset.sample != null) setters.setInput(preset.sample);
  if (preset.replacement != null) {
    setters.setReplacement(preset.replacement);
    setters.setMode("replace");
  }
}

export function RegexToolsTab() {
  const { t } = useLocale();
  const patternId = useId();
  const inputId = useId();
  const replacementId = useId();
  const saveNameId = useId();

  const [mode, setMode] = useState<Mode>("test");
  const [pattern, setPattern] = useState(REGEX_BUILTIN_PRESETS[0]?.pattern ?? "");
  const [flags, setFlags] = useState<RegexFlags>(() =>
    parseFlags(REGEX_BUILTIN_PRESETS[0]?.flags ?? "gi"),
  );
  const [input, setInput] = useState(REGEX_BUILTIN_PRESETS[0]?.sample ?? "");
  const [replacement, setReplacement] = useState("");
  const [savedPresets, setSavedPresets] = useState<RegexPreset[]>(() => loadSavedPresets());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(0);

  const flagString = flagsToString(flags);

  const testResult = useMemo(
    () => testRegex(pattern, flagString, input),
    [pattern, flagString, input],
  );

  const replaceResult = useMemo(
    () => replaceRegex(pattern, flagString, input, replacement),
    [pattern, flagString, input, replacement],
  );

  useEffect(() => {
    setSelectedMatch(0);
  }, [pattern, flagString, input]);

  const errorMessage = (() => {
    if (!pattern) return null;
    if (mode === "test" && !testResult.ok) {
      return testResult.error === "empty" ? t("regex.error.empty") : t("regex.error.invalid");
    }
    if (mode === "replace" && !replaceResult.ok) {
      return replaceResult.error === "empty" ? t("regex.error.empty") : t("regex.error.invalid");
    }
    return null;
  })();

  const matches = testResult.ok ? testResult.matches : [];
  const activeMatch = matches[selectedMatch] ?? matches[0] ?? null;

  const persistSaved = (next: RegexPreset[]) => {
    setSavedPresets(next);
    saveSavedPresets(next);
  };

  const saveCurrent = () => {
    const created = createUserPreset({
      name: saveName,
      pattern,
      flags: flagString,
      replacement: mode === "replace" ? replacement : undefined,
      sample: input,
    });
    if (!created) return;
    persistSaved([...savedPresets, created]);
    setSaveName("");
    setSaveOpen(false);
  };

  const clearAll = () => {
    setPattern("");
    setInput("");
    setReplacement("");
    setFlags({});
    setSelectedMatch(0);
  };

  const setters = { setPattern, setFlags, setInput, setReplacement, setMode };

  return (
    <>
      <SectionHeading icon={Braces}>{t("tools.tab.regex")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("regex.subtitle")}
      </p>

      <nav aria-label={t("regex.modes")} className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            { id: "test" as const, labelKey: "regex.mode.test" as const },
            { id: "replace" as const, labelKey: "regex.mode.replace" as const },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={mode === item.id ? "true" : undefined}
            onClick={() => setMode(item.id)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-200 ${
              mode === item.id
                ? "bg-accent font-medium text-on-accent warm-shadow-accent"
                : "bg-secondary text-text-primary hover:bg-accent-surface"
            }`}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </nav>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 @md:grid-cols-[1fr_auto]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={patternId} className="text-[12px] font-medium text-text-secondary">
                {t("regex.pattern")}
              </Label>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[13px] text-text-tertiary">/</span>
                <Input
                  id={patternId}
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  spellCheck={false}
                  placeholder={t("regex.patternPlaceholder")}
                  aria-invalid={errorMessage ? true : undefined}
                  className={`${monoInput} min-w-0 flex-1`}
                />
                <span className="shrink-0 font-mono text-[13px] text-text-tertiary">
                  /{flagString}
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-[12px] font-medium text-text-secondary">{t("regex.flags")}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {REGEX_FLAG_ORDER.map((flag) => (
                  <Label
                    key={flag}
                    className="flex cursor-pointer items-center gap-1.5 text-[13px] font-normal text-text-primary"
                    title={t(FLAG_LABEL_KEYS[flag])}
                  >
                    <Checkbox
                      checked={flags[flag] === true}
                      onCheckedChange={(v) =>
                        setFlags((prev) => ({ ...prev, [flag]: v === true }))
                      }
                    />
                    <span className="font-mono">{flag}</span>
                  </Label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-text-secondary">{t("regex.presets")}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[12px]"
                onClick={() => setSaveOpen((o) => !o)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("regex.savePreset")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REGEX_BUILTIN_PRESETS.map((preset) => {
                const active = pattern === preset.pattern && flagString === preset.flags;
                const id = preset.id as RegexBuiltinPresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset, setters)}
                    aria-pressed={active}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-[12px] transition-colors duration-200 ${
                      active
                        ? "bg-accent font-medium text-on-accent warm-shadow-accent"
                        : "bg-secondary text-text-primary hover:bg-accent-surface"
                    }`}
                    title={preset.pattern}
                  >
                    {t(PRESET_LABEL_KEYS[id])}
                  </button>
                );
              })}
              {savedPresets.map((preset) => {
                const active = pattern === preset.pattern && flagString === preset.flags;
                return (
                  <span key={preset.id} className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => applyPreset(preset, setters)}
                      aria-pressed={active}
                      className={`cursor-pointer rounded-full px-3 py-1.5 text-[12px] transition-colors duration-200 ${
                        active
                          ? "bg-accent font-medium text-on-accent warm-shadow-accent"
                          : "bg-secondary text-text-primary hover:bg-accent-surface"
                      }`}
                      title={preset.pattern}
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-text-tertiary transition-colors duration-200 hover:bg-secondary hover:text-text-primary"
                      title={t("regex.deletePreset")}
                      aria-label={t("regex.deletePreset")}
                      onClick={() => persistSaved(savedPresets.filter((p) => p.id !== preset.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
            {saveOpen && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
                  <Label htmlFor={saveNameId} className="text-[12px] font-medium text-text-secondary">
                    {t("regex.presetName")}
                  </Label>
                  <Input
                    id={saveNameId}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder={t("regex.presetNamePlaceholder")}
                    className="h-10 rounded-[22px] border-border bg-bg-primary text-[13px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveCurrent();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 rounded-[22px] px-4"
                  disabled={!saveName.trim() || !pattern || !!errorMessage}
                  onClick={saveCurrent}
                >
                  {t("regex.save")}
                </Button>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
              {t("regex.testString")}
            </Label>
            <Textarea
              id={inputId}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              placeholder={t("regex.testStringPlaceholder")}
              className={monoField}
            />
          </div>

          {mode === "replace" && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={replacementId} className="text-[12px] font-medium text-text-secondary">
                {t("regex.replacement")}
              </Label>
              <Input
                id={replacementId}
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                spellCheck={false}
                placeholder={t("regex.replacementPlaceholder")}
                className={monoInput}
              />
            </div>
          )}

          {errorMessage ? (
            <p role="alert" className="text-[13px] text-fail">
              {errorMessage}
            </p>
          ) : mode === "test" ? (
            <div className="grid items-start gap-3 @md:grid-cols-2">
              <div className="rounded-[22px] bg-bg-primary/60 px-3.5 py-3">
                <div className="mb-2 flex h-8 items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-text-secondary">
                    {t("regex.matches")}
                    {testResult.ok && (
                      <span className="ml-1.5 tabular-nums text-text-tertiary">
                        {matches.length}
                        {testResult.truncated ? "+" : ""}
                      </span>
                    )}
                  </p>
                </div>
                {matches.length === 0 ? (
                  <p className="text-[13px] text-text-secondary">{t("regex.noMatches")}</p>
                ) : (
                  <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                    {matches.map((m, i) => (
                      <li key={`${m.index}-${i}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedMatch(i)}
                          className={`flex w-full cursor-pointer items-baseline gap-2 rounded-[12px] px-2 py-1.5 text-left transition-colors duration-200 ${
                            selectedMatch === i
                              ? "bg-accent-surface text-text-primary"
                              : "hover:bg-secondary/80"
                          }`}
                        >
                          <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-text-tertiary">
                            @{m.index}
                          </span>
                          <span className="min-w-0 truncate font-mono text-[13px]">{m.match || "∅"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-[22px] bg-bg-primary/60 px-3.5 py-3">
                <p className="mb-2 flex h-8 items-center text-[12px] font-medium text-text-secondary">
                  {t("regex.groups")}
                </p>
                {!activeMatch ||
                (activeMatch.groups.length === 0 &&
                  Object.keys(activeMatch.namedGroups).length === 0) ? (
                  <p className="text-[13px] text-text-secondary">{t("regex.noGroups")}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {activeMatch.groups.map((g, i) => (
                      <li
                        key={`g-${i}`}
                        className="flex items-baseline justify-between gap-2 font-mono text-[13px]"
                      >
                        <span className="text-text-tertiary">${i + 1}</span>
                        <span className="min-w-0 truncate text-text-primary">{g || "—"}</span>
                      </li>
                    ))}
                    {Object.entries(activeMatch.namedGroups).map(([name, value]) => (
                      <li
                        key={`n-${name}`}
                        className="flex items-baseline justify-between gap-2 font-mono text-[13px]"
                      >
                        <span className="text-text-tertiary">{`(?<${name}>)`}</span>
                        <span className="min-w-0 truncate text-text-primary">{value || "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex h-8 min-w-0 items-center justify-between gap-2">
                <Label className="text-[12px] font-medium text-text-secondary">
                  {t("regex.replaceResult")}
                  {replaceResult.ok && (
                    <span className="ml-1.5 tabular-nums text-text-tertiary">
                      {t("regex.replaceCount", { count: replaceResult.count })}
                    </span>
                  )}
                </Label>
                <CopyButton
                  value={replaceResult.ok ? replaceResult.result : ""}
                  copyKey="regex.copy"
                  copiedKey="regex.copied"
                />
              </div>
              <Textarea
                readOnly
                value={replaceResult.ok ? replaceResult.result : ""}
                spellCheck={false}
                placeholder={t("regex.outputPlaceholder")}
                className={monoField}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-text-tertiary">{t("regex.hint.live")}</p>
            <Button type="button" variant="secondary" size="sm" onClick={clearAll}>
              {t("regex.clear")}
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
