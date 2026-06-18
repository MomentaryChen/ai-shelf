import { useState } from "react";

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
  /** Lift the border on hover — use for cards that act as a clickable target. */
  hoverable?: boolean;
  className?: string;
  /** When true, the header toggles visibility of the card body. */
  collapsible?: boolean;
  /** Initial collapsed state when collapsible. */
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const hasHeader = title || trailing;
  const interactive = hoverable
    ? "transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-pop"
    : "";
  const titleClass =
    "flex items-center gap-2 text-[15px] font-semibold tracking-tight text-text-primary";

  return (
    <div
      className={`mb-3 rounded-xl border border-border bg-bg-secondary p-5 shadow-card ${interactive} ${className}`.trim()}
    >
      {hasHeader &&
        (collapsible ? (
          <div
            role="button"
            tabIndex={0}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setCollapsed((c) => !c);
              }
            }}
            className={`flex cursor-pointer select-none items-center justify-between gap-3 ${collapsed ? "" : "mb-4"}`}
          >
            <div className={titleClass}>
              <span className="w-3 shrink-0 text-xs text-text-tertiary">{collapsed ? "▶" : "▼"}</span>
              {title}
            </div>
            {trailing}
          </div>
        ) : (
          <div className="mb-4 flex items-center justify-between gap-3">
            {title && <div className={titleClass}>{title}</div>}
            {trailing}
          </div>
        ))}
      {(!collapsible || !collapsed) && children}
    </div>
  );
}
