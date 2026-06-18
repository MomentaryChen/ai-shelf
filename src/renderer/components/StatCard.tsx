/**
 * Compact dashboard stat tile: a small uppercase label over a large tabular
 * number. Presentational only — used by inventory summary grids. `valueClassName`
 * tints the number (e.g. accent / warn / ok) without touching the frame.
 */
export function StatCard({
  value,
  label,
  valueClassName = "text-accent",
}: {
  value: number | string;
  label: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-4 shadow-card transition-colors duration-150 hover:border-border-strong">
      <div className="text-[11px] font-medium tracking-wide text-text-tertiary uppercase">{label}</div>
      <div className={`mt-1.5 text-[26px] leading-none font-semibold tabular-nums ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}
