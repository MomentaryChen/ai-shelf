import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Card as UiCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function Card({
  title,
  trailing,
  children,
  hoverable = false,
  className = "",
  collapsible = false,
  defaultCollapsed = false,
  dense = false,
}: {
  title?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  hoverable?: boolean;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Tighter padding/radius/margin for per-item cards in long lists (MCP, Doctor…). */
  dense?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const hasHeader = title || trailing;
  const interactive = hoverable
    ? "transition-[border-color,box-shadow,transform] duration-200 hover:shadow-pop"
    : "";
  const cardClass = cn(
    "warm-rise warm-shadow-card",
    dense ? "rounded-2xl" : "rounded-[28px]",
    interactive,
  );
  const pad = dense ? "p-3.5" : "p-5";
  const gap = dense ? "mb-2.5" : "mb-4";
  const headerGap = dense ? "mb-3" : "mb-4";

  if (!collapsible) {
    return (
      <UiCard className={cn(gap, pad, cardClass, className)}>
        {hasHeader && (
          <CardHeader className={headerGap}>
            {title && <CardTitle>{title}</CardTitle>}
            {trailing}
          </CardHeader>
        )}
        <CardContent>{children}</CardContent>
      </UiCard>
    );
  }

  return (
    <Collapsible
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
      className={cn(gap, className)}
    >
      <UiCard className={cn(pad, cardClass)}>
        {hasHeader && (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full cursor-pointer select-none items-center justify-between gap-3 text-left",
                collapsed ? "" : headerGap,
              )}
            >
              <CardTitle>
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform duration-200",
                    collapsed ? "" : "rotate-90",
                  )}
                />
                {title}
              </CardTitle>
              {trailing}
            </button>
          </CollapsibleTrigger>
        )}
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </UiCard>
    </Collapsible>
  );
}
