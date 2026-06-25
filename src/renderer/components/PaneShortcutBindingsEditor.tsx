import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PANE_SHORTCUT_BINDINGS,
  chordFromKeyboardEvent,
  formatFocusPaneBinding,
  formatPaneKeyChord,
  type PaneFocusPaneBinding,
  type PaneShortcutBindings,
} from "../terminal/pane-key-bindings";
import { Button } from "@/components/ui/button";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

type BindingField = keyof Omit<PaneShortcutBindings, "focusPane">;

const ROWS: { field: BindingField; labelKey: MessageKey }[] = [
  { field: "focusNext", labelKey: "settings.paneShortcut.focusNext" },
  { field: "focusPrev", labelKey: "settings.paneShortcut.focusPrev" },
  { field: "splitHorizontal", labelKey: "settings.paneShortcut.splitRight" },
  { field: "splitVertical", labelKey: "settings.paneShortcut.splitDown" },
];

interface Props {
  bindings: PaneShortcutBindings;
  onChange: (bindings: PaneShortcutBindings) => void;
  compact?: boolean;
}

export function PaneShortcutBindingsEditor({ bindings, onChange, compact = false }: Props) {
  const { t } = useLocale();
  const [recording, setRecording] = useState<BindingField | "focusPane" | null>(null);

  const stopRecording = useCallback(() => setRecording(null), []);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopPropagation();

      if (ev.key === "Escape") {
        stopRecording();
        return;
      }

      if (recording === "focusPane") {
        if (!ev.ctrlKey && !ev.metaKey) return;
        const next: PaneFocusPaneBinding = { shift: ev.shiftKey || undefined };
        onChange({ ...bindings, focusPane: next });
        stopRecording();
        return;
      }

      const chord = chordFromKeyboardEvent(ev);
      if (!chord) return;
      onChange({ ...bindings, [recording]: chord });
      stopRecording();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, bindings, onChange, stopRecording]);

  function resetDefaults() {
    onChange({ ...DEFAULT_PANE_SHORTCUT_BINDINGS });
  }

  const rowClass = compact
    ? "flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
    : "flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5";

  return (
    <div className="flex flex-col gap-2">
      {ROWS.map(({ field, labelKey }) => (
        <ShortcutRow
          key={field}
          className={rowClass}
          label={t(labelKey)}
          display={formatPaneKeyChord(bindings[field])}
          recording={recording === field}
          onStart={() => setRecording(field)}
        />
      ))}
      <ShortcutRow
        className={rowClass}
        label={t("settings.paneShortcut.focusPane")}
        display={formatFocusPaneBinding(bindings.focusPane)}
        recording={recording === "focusPane"}
        onStart={() => setRecording("focusPane")}
      />
      <p className="text-[11px] leading-snug text-text-tertiary">{t("settings.paneShortcut.hint")}</p>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={resetDefaults}
          className="h-auto p-0 text-[10px] text-text-tertiary hover:text-text-primary"
        >
          {t("settings.resetDefault")}
        </Button>
      </div>
    </div>
  );
}

function ShortcutRow({
  label,
  display,
  recording,
  onStart,
  className,
}: {
  label: string;
  display: string;
  recording: boolean;
  onStart: () => void;
  className: string;
}) {
  const { t } = useLocale();
  return (
    <div className={className}>
      <span className="min-w-0 text-[12px] text-text-secondary">{label}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onStart}
        className={`shrink-0 font-mono text-[12px] ${
          recording
            ? "border-accent/60 bg-accent/10 text-accent hover:bg-accent/10"
            : "border-border bg-bg-secondary text-text-primary hover:border-accent/40"
        }`}
      >
        {recording ? t("settings.paneShortcut.pressKeys") : display}
      </Button>
    </div>
  );
}
