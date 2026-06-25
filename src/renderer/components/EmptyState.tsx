import type { ReactNode } from "react";

export type EmptyStateTone = "default" | "chrome";

/**
 * Friendly empty / zero-data placeholder: optional icon, a title, an optional
 * supporting line, and an optional action slot. Presentational only — pass
 * already-translated strings (or nodes) in.
 *
 * `tone` selects the token family (inventory/dialog vs terminal/sidebar chrome)
 * so callers in either surface read correctly across all app themes.
 */
const TONE: Record<EmptyStateTone, { title: string; desc: string }> = {
  default: { title: "text-text-primary", desc: "text-text-secondary" },
  chrome: { title: "text-chrome-text", desc: "text-chrome-text-muted" },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "default",
  bordered = false,
  compact = false,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: EmptyStateTone;
  /** Wrap in a soft dashed border (useful as a drop target / panel filler). */
  bordered?: boolean;
  /** Tighter vertical rhythm for small sidebars. */
  compact?: boolean;
  className?: string;
}) {
  const c = TONE[tone];
  const pad = compact ? "px-4 py-5 gap-2" : "px-5 py-10 gap-3";
  const frame =
    bordered && tone === "chrome"
      ? "rounded-xl border border-dashed border-chrome-border-subtle"
      : bordered
        ? "rounded-[28px] border border-dashed border-sand warm-shadow-card"
        : tone === "default"
          ? "warm-rise"
          : "";
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${pad} ${frame} ${className}`.trim()}
    >
      {icon && (
        <div className={compact ? "text-xl opacity-90" : "text-3xl opacity-90"} aria-hidden>
          {icon}
        </div>
      )}
      <p className={`${compact ? "text-[15px]" : "text-[15px]"} font-semibold ${c.title}`}>{title}</p>
      {description && (
        <p className={`${compact ? "text-[13px]" : "text-[13px]"} leading-normal ${c.desc}`}>
          {description}
        </p>
      )}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
