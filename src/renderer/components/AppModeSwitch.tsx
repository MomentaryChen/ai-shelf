import type { LucideIcon } from "lucide-react";
import { Compass, Package, SquareTerminal, Wrench } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { useKeybindings } from "../hooks/useKeybindings";
import {
  formatCombo,
  matchShortcut,
  type KeybindingMap,
  type KeyEventLike,
  type ShortcutId,
} from "../shortcuts/keybindings";

export type AppMode = "terminal" | "inventory" | "tools" | "flow";

interface AppModeSwitchProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  disabled?: boolean;
}

export const APP_MODES: {
  id: AppMode;
  labelKey: MessageKey;
  icon: LucideIcon;
  shortcutId: ShortcutId;
}[] = [
  { id: "terminal", labelKey: "app.mode.terminal", icon: SquareTerminal, shortcutId: "modeTerminal" },
  { id: "inventory", labelKey: "app.mode.inventory", icon: Package, shortcutId: "modeInventory" },
  { id: "tools", labelKey: "app.mode.tools", icon: Wrench, shortcutId: "modeTools" },
  { id: "flow", labelKey: "app.mode.flow", icon: Compass, shortcutId: "modeFlow" },
];

/**
 * Mode switch shortcuts (default Alt/Option+1–4). Matching falls back to `code`
 * so macOS Option+digit glyphs still match.
 */
export function matchModeSwitchShortcut(ev: KeyEventLike, map: KeybindingMap): AppMode | null {
  const m = matchShortcut(
    ev,
    map,
    APP_MODES.map((mode) => mode.shortcutId),
  );
  if (!m) return null;
  return APP_MODES.find((mode) => mode.shortcutId === m.id)?.id ?? null;
}

export function AppModeSwitch({ mode, onChange, disabled = false }: AppModeSwitchProps) {
  const { t } = useLocale();
  const keymap = useKeybindings();

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
        {APP_MODES.map((m) => {
          const Icon = m.icon;
          const label = t(m.labelKey);
          const keys = formatCombo(keymap[m.shortcutId]);
          return (
            <ToggleGroupItem
              key={m.id}
              value={m.id}
              role="tab"
              aria-selected={mode === m.id}
              aria-keyshortcuts={keys || undefined}
              title={keys ? t("app.mode.shortcutHint", { label, keys }) : label}
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
