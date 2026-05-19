export type AppMode = "terminal" | "inventory";

interface AppModeSwitchProps {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  disabled?: boolean;
}

const MODES: { id: AppMode; label: string }[] = [
  { id: "terminal", label: "Terminal" },
  { id: "inventory", label: "Inventory" },
];

export function AppModeSwitch({ mode, onChange, disabled = false }: AppModeSwitchProps) {
  return (
    <nav role="tablist" aria-label="Application mode" className="flex shrink-0 items-center">
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
            className={`border-b-2 px-3 py-1.5 font-sans text-[12px] transition-colors duration-150 ${
              disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
            } ${
              active
                ? "border-accent font-medium text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </nav>
  );
}
