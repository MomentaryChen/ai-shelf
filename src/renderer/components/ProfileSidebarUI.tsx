import type { ReactNode } from "react";
import { profileCountBadgeStyle } from "../utils/profile-colors";

export function SidebarIconBtn({
  title,
  disabled,
  onClick,
  children,
  className = "",
}: {
  title: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-chrome-text-muted transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
    >
      {children}
    </button>
  );
}

export function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-chrome-text-dim"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M9 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ProfileCountBadge({
  count,
  accent,
}: {
  count: number;
  accent: string | null;
}) {
  return (
    <span
      className="ml-1.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
      style={profileCountBadgeStyle(accent)}
    >
      {count}
    </span>
  );
}

export function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-3 w-3 text-chrome-text-faint transition-transform duration-150 ${expanded ? "rotate-0" : "-rotate-90"}`}
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden
    >
      <path d="M3 4.5 6 8l3-3.5" />
    </svg>
  );
}

export function SidebarPanelChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 text-chrome-text-faint transition-transform duration-150 ${expanded ? "rotate-0" : "rotate-180"}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7.5 2.5 4 6l3.5 3.5" />
    </svg>
  );
}

export function DragHandle() {
  return (
    <svg className="h-3 w-3 text-chrome-text-dim" viewBox="0 0 8 12" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1" />
      <circle cx="6" cy="2" r="1" />
      <circle cx="2" cy="6" r="1" />
      <circle cx="6" cy="6" r="1" />
      <circle cx="2" cy="10" r="1" />
      <circle cx="6" cy="10" r="1" />
    </svg>
  );
}
