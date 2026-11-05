import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Staggered entrance for direct children (see `.ui-stagger-children` in index.css). */
export function StaggerStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("ui-stagger-children flex flex-col gap-4", className)}>{children}</div>;
}
