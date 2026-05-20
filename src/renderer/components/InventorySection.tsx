import type { ProviderEntry } from "../types";

export function InventorySectionHeader({
  title,
  count,
  variant,
}: {
  title: string;
  count: number;
  variant: "installed" | "notInstalled";
}) {
  if (count === 0) return null;
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
  const none = entries.every((e) => !e.available);
  if (!none) return null;
  return (
    <p className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-[13px] text-warn">
      尚未偵測到任何已安裝的 AI CLI。請在下方「未安裝」區塊查看安裝指令。
    </p>
  );
}
