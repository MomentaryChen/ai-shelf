import { useState } from "react";
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
}: {
  title?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  hoverable?: boolean;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const hasHeader = title || trailing;
  const interactive = hoverable
    ? "transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-pop"
    : "";

  if (!collapsible) {
    return (
      <UiCard className={cn("mb-3 p-5", interactive, className)}>
        {hasHeader && (
          <CardHeader className="mb-4">
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
      className={cn("mb-3", className)}
    >
      <UiCard className={cn("p-5", interactive)}>
        {hasHeader && (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full cursor-pointer select-none items-center justify-between gap-3 text-left",
                collapsed ? "" : "mb-4",
              )}
            >
              <CardTitle>
                <span className="w-3 shrink-0 text-xs text-text-tertiary">
                  {collapsed ? "▶" : "▼"}
                </span>
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
