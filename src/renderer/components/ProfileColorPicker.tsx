import { PROFILE_ACCENT_COLORS } from "../utils/profile-colors";

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  disabled?: boolean;
}

export function ProfileColorPicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        disabled={disabled}
        title="無標記色"
        onClick={() => onChange(null)}
        className={`h-7 w-7 cursor-pointer rounded-md border transition-all ${
          value === null
            ? "border-accent ring-1 ring-accent/50"
            : "border-chrome-border-strong hover:border-chrome-border-hover"
        } bg-chrome-surface-hover disabled:cursor-not-allowed disabled:opacity-40`}
        aria-label="無標記色"
      />
      {PROFILE_ACCENT_COLORS.map((color) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            disabled={disabled}
            title={color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            className={`h-7 w-7 cursor-pointer rounded-md border transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? "border-chrome-text ring-2 ring-accent/60"
                : "border-transparent hover:scale-105 hover:border-chrome-border-hover"
            }`}
            aria-label={`標記色 ${color}`}
            aria-pressed={selected}
          />
        );
      })}
    </div>
  );
}
