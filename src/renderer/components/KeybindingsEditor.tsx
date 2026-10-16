import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "../i18n/LocaleProvider";
import {
  SHORTCUT_DEFS,
  combosEqual,
  defaultKeybindings,
  detectKeyPlatform,
  findKeybindingConflicts,
  formatCombo,
  isDigitFamily,
  recordComboFromEvent,
  resetKeybindingOverride,
  resolveKeybindings,
  setKeybindingOverride,
  type KeyBinding,
  type KeybindingOverrides,
  type ShortcutId,
  type ShortcutSectionId,
} from "../shortcuts/keybindings";
import { suspendKeybindings } from "../shortcuts/active-keybindings";
import {
  SHORTCUT_LABEL_KEYS,
  SHORTCUT_SECTION_TITLE_KEYS,
} from "../shortcuts/shortcut-registry";

const SECTION_ORDER: ShortcutSectionId[] = ["general", "pane", "profile", "terminal"];

interface Props {
  overrides: KeybindingOverrides;
  onChange: (overrides: KeybindingOverrides) => void;
  compact?: boolean;
}

/**
 * Settings → Shortcuts: every app shortcut can be re-recorded, disabled (the key
 * then reaches the terminal) or reset; overlapping combos are flagged.
 */
export function KeybindingsEditor({ overrides, onChange, compact = false }: Props) {
  const { t } = useLocale();
  const platform = useMemo(() => detectKeyPlatform(), []);
  const defaults = useMemo(() => defaultKeybindings(platform), [platform]);
  const map = useMemo(() => resolveKeybindings(overrides, platform), [overrides, platform]);
  const conflicts = useMemo(() => findKeybindingConflicts(map), [map]);
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [recordError, setRecordError] = useState(false);

  const stopRecording = useCallback(() => {
    setRecording(null);
    setRecordError(false);
  }, []);

  const setBinding = useCallback(
    (id: ShortcutId, binding: KeyBinding) => {
      onChange(setKeybindingOverride(overrides, id, binding, platform));
    },
    [overrides, onChange, platform],
  );

  useEffect(() => {
    if (!recording) return;
    // App shortcut listeners may run before ours; disable them while recording.
    const resume = suspendKeybindings();

    const onKeyDown = (ev: KeyboardEvent) => {
      // Capture phase + stopImmediatePropagation: app shortcuts must not fire while recording.
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const result = recordComboFromEvent(ev, isDigitFamily(recording));
      if (result.kind === "cancel") {
        stopRecording();
        return;
      }
      if (result.kind === "invalid") {
        setRecordError(true);
        return;
      }
      if (result.kind !== "combo") return;
      setBinding(recording, result.combo);
      stopRecording();
    };
    const onBlur = () => stopRecording();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      resume();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [recording, setBinding, stopRecording]);

  const hasOverrides = Object.keys(overrides).length > 0;
  const rowClass = compact
    ? "flex flex-col gap-1 rounded-lg border px-3 py-2"
    : "flex flex-col gap-1 rounded-lg border px-3.5 py-2.5";

  return (
    <div className="flex flex-col gap-4">
      {SECTION_ORDER.map((section) => (
        <div key={section} className="flex flex-col gap-2">
          <p className="text-[11px] font-medium tracking-wide text-text-tertiary">
            {t(SHORTCUT_SECTION_TITLE_KEYS[section])}
          </p>
          {SHORTCUT_DEFS.filter((d) => d.section === section).map(({ id }) => {
            const binding = map[id];
            const isRecording = recording === id;
            const isDefault = combosEqual(binding, defaults[id]);
            const clashes = conflicts.get(id);
            return (
              <div
                key={id}
                data-shortcut-id={id}
                className={`${rowClass} ${clashes ? "border-warn/60" : "border-border"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 text-[12px] text-text-secondary">
                    {t(SHORTCUT_LABEL_KEYS[id])}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => (isRecording ? stopRecording() : setRecording(id))}
                      aria-label={t("keybindings.recordAria", { label: t(SHORTCUT_LABEL_KEYS[id]) })}
                      className={`min-w-[96px] font-mono text-[12px] ${
                        isRecording
                          ? "border-accent/60 bg-accent/10 text-accent hover:bg-accent/10"
                          : binding
                            ? "border-border bg-bg-secondary text-text-primary hover:border-accent/40"
                            : "border-border bg-bg-secondary italic text-text-tertiary hover:border-accent/40"
                      }`}
                    >
                      {isRecording
                        ? t("settings.paneShortcut.pressKeys")
                        : binding
                          ? formatCombo(binding, platform)
                          : t("keybindings.unbound")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!binding}
                      onClick={() => setBinding(id, null)}
                      title={t("keybindings.disable")}
                      aria-label={t("keybindings.disable")}
                      className="size-8 text-text-tertiary hover:text-text-primary"
                    >
                      <Ban className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isDefault}
                      onClick={() => onChange(resetKeybindingOverride(overrides, id))}
                      title={t("keybindings.resetOne", {
                        keys: formatCombo(defaults[id], platform) || t("keybindings.unbound"),
                      })}
                      aria-label={t("settings.resetDefault")}
                      className="size-8 text-text-tertiary hover:text-text-primary"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
                {isRecording && (
                  <p
                    className={`text-[11px] leading-snug ${recordError ? "text-warn" : "text-text-tertiary"}`}
                  >
                    {isDigitFamily(id)
                      ? t("keybindings.recordDigitHint")
                      : t("keybindings.recordHint")}
                  </p>
                )}
                {clashes && (
                  <p className="flex items-center gap-1 text-[11px] leading-snug text-warn">
                    <AlertTriangle className="size-3 shrink-0" aria-hidden />
                    {t("keybindings.conflict", {
                      names: clashes.map((other) => t(SHORTCUT_LABEL_KEYS[other])).join(", "),
                    })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <p className="text-[11px] leading-snug text-text-tertiary">{t("keybindings.hint")}</p>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={!hasOverrides}
          onClick={() => {
            stopRecording();
            onChange({});
          }}
          className="h-auto p-0 text-[10px] text-text-tertiary hover:text-text-primary"
        >
          {t("keybindings.resetAll")}
        </Button>
      </div>
    </div>
  );
}
