import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

export type AppMode = "terminal" | "inventory" | "flow";

interface AppModeSwitchProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  disabled?: boolean;
}

const MODES: { id: AppMode; labelKey: MessageKey }[] = [
  { id: "terminal", labelKey: "app.mode.terminal" },
  { id: "inventory", labelKey: "app.mode.inventory" },
  { id: "flow", labelKey: "app.mode.flow" },
];

export function AppModeSwitch({ mode, onChange, disabled = false }: AppModeSwitchProps) {
  const { t } = useLocale();

  return (
    <nav
      role="tablist"
      aria-label={t("app.mode.aria")}
      className="flex shrink-0 items-center rounded-md bg-bg-secondary p-0.5 transition-colors duration-200"
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
        {MODES.map((m) => (
          <ToggleGroupItem
            key={m.id}
            value={m.id}
            role="tab"
            aria-selected={mode === m.id}
            size="chrome"
            className="border-transparent data-[state=off]:border-transparent data-[state=off]:hover:border-transparent"
          >
            {t(m.labelKey)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </nav>
  );
}
