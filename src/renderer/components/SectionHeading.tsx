import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Inventory page heading — lucide icon in a soft accent chip + title.
 * Icons follow the theme via `text-accent` / `bg-accent-soft` tokens.
 */
export function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 text-lg font-semibold">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {children}
    </h2>
  );
}
