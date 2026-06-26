import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ViewTransitionProps = {
  viewKey: string;
  children: ReactNode;
  className?: string;
  /** Slight upward rise (default) or fade only */
  variant?: "rise" | "fade";
};

/** Re-mounts children when `viewKey` changes and plays a short entrance animation. */
export function ViewTransition({
  viewKey,
  children,
  className,
  variant = "rise",
}: ViewTransitionProps) {
  return (
    <div
      key={viewKey}
      className={cn(variant === "rise" ? "ui-view-rise" : "ui-view-fade", className)}
    >
      {children}
    </div>
  );
}
