import type { ProviderEntry } from "../types";
import { useLocale } from "../i18n/LocaleProvider";

export function InventorySectionHeader({
  count,
  variant,
}: {
  count: number;
  variant: "installed" | "notInstalled";
}) {
  const { t } = useLocale();
  if (count === 0) return null;
  const title = variant === "installed" ? t("inventory.installed") : t("inventory.notInstalled");
  const color =
    variant === "installed"
      ? "text-ok border-ok/30"
      : "text-text-tertiary border-border";
  return (
    <h3
      className={`mb-3 mt-6 flex items-center gap-2 border-b pb-2 text-sm font-semibold first:mt-0 ${color}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          variant === "installed" ? "bg-ok" : "bg-text-tertiary/50"
        }`}
      />
      {title}
      <span className="font-normal text-text-secondary">({count})</span>
    </h3>
  );
}

export function EmptyInventoryHint({ entries }: { entries: ProviderEntry[] }) {
  const { t } = useLocale();
  const none = entries.every((e) => !e.available);
  if (!none) return null;
  return (
    <p className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-[13px] text-warn">
      {t("inventory.emptyHint")}
    </p>
  );
}
