import type { LucideIcon } from "lucide-react";
import { Compass, Package, SquareTerminal, Wrench } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { modeSwitchModLabel } from "../shortcuts/shortcut-registry";

export type AppMode = "terminal" | "inventory" | "tools" | "flow";

interface AppModeSwitchProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  disabled?: boolean;
}

export const APP_MODES: { id: AppMode; labelKey: MessageKey; icon: LucideIcon }[] = [
  { id: "terminal", labelKey: "app.mode.terminal", icon: SquareTerminal },
  { id: "inventory", labelKey: "app.mode.inventory", icon: Package },
  { id: "tools", labelKey: "app.mode.tools", icon: Wrench },
  { id: "flow", labelKey: "app.mode.flow", icon: Compass },
];

/** Alt/Option+1–4 → mode index; uses `code` so macOS Option+digit glyphs still match. */
export function matchModeSwitchShortcut(ev: KeyboardEvent): AppMode | null {
  if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return null;
  const m = /^Digit([1-9])$/.exec(ev.code);
  if (!m) return null;
  return APP_MODES[Number(m[1]) - 1]?.id ?? null;
}

export function AppModeSwitch({ mode, onChange, disabled = false }: AppModeSwitchProps) {
  const { t } = useLocale();
  const modKey = modeSwitchModLabel();

  return (
    <nav
      role="tablist"
      aria-label={t("app.mode.aria")}
      className="flex shrink-0 items-center rounded-lg bg-bg-secondary p-0.5 transition-colors duration-200"
    >
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value) onChange(value as AppMode);
        }}
        disabled={disabled}
        className="gap-0.5"
      >
        {APP_MODES.map((m, i) => {
          const Icon = m.icon;
          const label = t(m.labelKey);
          return (
            <ToggleGroupItem
              key={m.id}
              value={m.id}
              role="tab"
              aria-selected={mode === m.id}
              aria-keyshortcuts={`Alt+${i + 1}`}
              title={t("app.mode.shortcutHint", { label, keys: `${modKey}+${i + 1}` })}
              size="chrome"
              className="border-transparent data-[state=off]:border-transparent data-[state=off]:hover:border-transparent"
            >
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              {label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </nav>
  );
}
