import { useLocale } from "../i18n/LocaleProvider";
import { PROFILE_ACCENT_COLORS } from "../utils/profile-colors";

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  disabled?: boolean;
}

export function ProfileColorPicker({ value, onChange, disabled = false }: Props) {
  const { t } = useLocale();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        title={t("profile.color.none")}
        onClick={() => onChange(null)}
        className={`h-7 w-7 cursor-pointer rounded-md border border-dashed border-white/20 transition-all hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40 ${
          value === null ? "ring-2 ring-accent/60" : ""
        }`}
        aria-label={t("profile.color.none")}
      />
      {PROFILE_ACCENT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          title={t("profile.color.swatch", { color })}
          onClick={() => onChange(color)}
          className={`h-7 w-7 cursor-pointer rounded-md border border-white/10 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 ${
            value === color ? "ring-2 ring-accent/60" : ""
          }`}
          style={{ backgroundColor: color }}
          aria-label={t("profile.color.swatch", { color })}
        />
      ))}

    </div>
  );
}
