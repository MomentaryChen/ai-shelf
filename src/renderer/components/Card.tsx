import { useState } from "react";

export function Card({
  title,
  trailing,
  children,
  className = "",
  collapsible = false,
  defaultCollapsed = false,
}: {
  title?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** When true, the header toggles visibility of the card body. */
  collapsible?: boolean;
  /** Initial collapsed state when collapsible. */
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const hasHeader = title || trailing;

  return (
    <div className={`mb-3 rounded-xl border border-border bg-bg-secondary p-5 ${className}`.trim()}>
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
            className={`flex cursor-pointer select-none items-center justify-between ${collapsed ? "" : "mb-3"}`}
          >
            <div className="flex items-center gap-2 text-base font-semibold">
              <span className="w-3 shrink-0 text-xs text-text-tertiary">{collapsed ? "▶" : "▼"}</span>
              {title}
            </div>
            {trailing}
          </div>
        ) : (
          <div className="mb-3 flex items-center justify-between">
            {title && <div className="flex items-center gap-2 text-base font-semibold">{title}</div>}
            {trailing}
          </div>
        ))}
      {(!collapsible || !collapsed) && children}
    </div>
  );
}
