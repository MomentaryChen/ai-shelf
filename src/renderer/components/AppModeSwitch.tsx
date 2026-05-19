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
    <div
      role="tablist"
      aria-label="Application mode"
      className="inline-flex rounded-xl border border-border bg-bg-secondary p-1"
    >
      {MODES.map((m) => {
        const active = mode === m.id;
        const isTerminal = m.id === "terminal";
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={`rounded-lg px-5 py-2 font-sans transition-all duration-150 ${
              disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
            } ${
              active
                ? isTerminal
                  ? "border border-accent/50 bg-accent/15 text-[14px] font-semibold text-accent shadow-sm"
                  : "border border-border bg-bg-card text-[13px] font-medium text-text-primary"
                : isTerminal
                  ? "border border-transparent text-[14px] font-medium text-text-primary hover:text-accent"
                  : "border border-transparent text-[13px] text-text-secondary hover:text-text-primary"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
