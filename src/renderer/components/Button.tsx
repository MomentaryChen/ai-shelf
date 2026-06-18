import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "solid" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";
export type ButtonTone = "default" | "chrome";

/**
 * Shared button primitive. Presentational only — forwards all native button
 * props (onClick, type, disabled, title, …) and merges an extra className.
 *
 * `tone` selects which token family to use so the two intentionally separate
 * color systems (inventory/dialog `bg-*`/`text-*` vs terminal/sidebar
 * `chrome-*`) are never mixed.
 */
const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

const VARIANT: Record<ButtonTone, Record<ButtonVariant, string>> = {
  default: {
    primary: "border border-accent bg-accent/15 text-accent hover:bg-accent/25",
    solid: "bg-accent text-text-primary hover:bg-accent-hover",
    secondary: "border border-border bg-bg-card text-text-primary hover:border-accent",
    ghost: "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
    danger: "text-fail hover:bg-fail/10",
  },
  chrome: {
    primary: "border border-accent bg-accent/15 text-accent hover:bg-accent/25",
    solid: "bg-accent text-text-primary hover:bg-accent-hover",
    secondary:
      "border border-chrome-border-strong text-chrome-text-secondary hover:border-chrome-border-hover",
    ghost: "text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text",
    danger: "text-fail hover:bg-fail/10",
  },
};

export function Button({
  variant = "secondary",
  size = "md",
  tone = "default",
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`${BASE} ${SIZE[size]} ${VARIANT[tone][variant]} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
