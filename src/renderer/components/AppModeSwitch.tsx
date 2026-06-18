import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

export type AppMode = "terminal" | "inventory";

interface AppModeSwitchProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  disabled?: boolean;
}

const MODES: { id: AppMode; labelKey: MessageKey }[] = [
  { id: "terminal", labelKey: "app.mode.terminal" },
  { id: "inventory", labelKey: "app.mode.inventory" },
];

export function AppModeSwitch({ mode, onChange, disabled = false }: AppModeSwitchProps) {
  const { t } = useLocale();

  return (
    <nav
      role="tablist"
      aria-label={t("app.mode.aria")}
      className="flex shrink-0 items-center gap-0.5 rounded-md bg-bg-secondary p-0.5"
    >
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={`rounded-[5px] px-2.5 py-0.5 font-sans text-[11px] transition-[background,color,box-shadow] duration-150 ${
              disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
            } ${
              active
                ? "bg-bg-card font-medium text-text-primary shadow-card"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(m.labelKey)}
          </button>
        );
      })}
    </nav>
  );
}
