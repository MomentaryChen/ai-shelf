import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Compact dashboard stat tile: a small uppercase label over a large tabular
 * number. Presentational only — used by inventory summary grids.
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
    <Card className="p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-pop">
      <CardHeader className="p-0">
        <CardTitle className="text-[11px] font-medium tracking-wide text-text-tertiary uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-1.5 p-0">
        <div className={cn("text-[26px] leading-none font-semibold tabular-nums", valueClassName)}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
