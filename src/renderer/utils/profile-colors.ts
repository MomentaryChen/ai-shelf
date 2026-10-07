/** Light accent swatches for profile identification on dark UI. */
export const PROFILE_ACCENT_COLORS = [
  "#f4a5a5",
  "#f5c78a",
  "#e8e08a",
  "#9dd89d",
  "#7ec8e8",
  "#a8b4f0",
  "#d4a5e8",
  "#f0a8c8",
] as const;

export type ProfileAccentColor = (typeof PROFILE_ACCENT_COLORS)[number];

function chromeVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function tint(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

/** Accent swatch dot — sidebar, top bar, pane header. */
export function profileAccentMarkerStyle(
  accentColor: string,
  size: "sm" | "md" = "md",
): import("react").CSSProperties {
  return {
    backgroundColor: accentColor,
    boxShadow: `0 0 ${size === "sm" ? 6 : 8}px ${tint(accentColor, size === "sm" ? "88" : "66")}`,
  };
}

/** Sidebar profile row when selected — flat list with left accent bar (no card border). */
export function profileSidebarProfileActiveStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  if (!accentColor) {
    return {
      backgroundColor: "var(--color-chrome-hover)",
      boxShadow: "inset 2px 0 0 var(--color-chrome-ui-accent)",
    };
  }
  return {
    backgroundColor: tint(accentColor, "1f"),
    boxShadow: `inset 2px 0 0 ${accentColor}`,
  };
}

/** Sidebar terminal tab row — compact accent bar when selected. */
export function profileSidebarTerminalStyle(
  accentColor: string | null | undefined,
  selected: boolean,
): import("react").CSSProperties | undefined {
  if (!selected) return undefined;
  if (!accentColor) {
    return {
      backgroundColor: "var(--color-chrome-hover)",
      boxShadow: "inset 2px 0 0 var(--color-chrome-ui-accent)",
    };
  }
  return {
    backgroundColor: tint(accentColor, "1a"),
    boxShadow: `inset 2px 0 0 ${accentColor}`,
  };
}

/** Terminal-mode top bar profile badge. */
export function profileTopBarBadgeStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  if (accentColor) {
    return {
      backgroundColor: tint(accentColor, "1f"),
      borderColor: tint(accentColor, "66"),
    };
  }
  const fallback = chromeVar("--color-chrome-accent-text", "#8ab4ff");
  return {
    backgroundColor: `color-mix(in srgb, ${fallback} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${fallback} 20%, transparent)`,
  };
}

/** Accent swatches are pastel; as text they vanish on light themes, so the accent stays on the marker. */
export function profileTopBarLabelStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  if (accentColor) return { color: "var(--color-chrome-text)" };
  return { color: chromeVar("--color-chrome-accent-text", "#8ab4ff") };
}

/** Pane shell border — always tinted when profile has an accent; stronger when focused. */
export function profilePaneChromeStyle(
  accentColor: string | null | undefined,
  focused: boolean,
): import("react").CSSProperties | undefined {
  if (!accentColor) return undefined;
  return {
    borderColor: tint(accentColor, focused ? "88" : "30"),
    boxShadow: focused
      ? `0 0 0 1px ${tint(accentColor, "30")}, 0 8px 24px ${tint(accentColor, "12")}`
      : `0 0 0 1px ${tint(accentColor, "12")}`,
  };
}

/**
 * Pane title bar — opaque chrome base with a soft accent wash on the left.
 * The base must be opaque: the pane shell behind it is the dark terminal bg,
 * so a translucent tint turns the title area dark under light-theme ink text.
 */
export function profilePaneHeaderStyle(
  accentColor: string | null | undefined,
  focused: boolean,
): import("react").CSSProperties {
  const base = "var(--color-chrome-bg)";
  if (!accentColor) {
    return {
      backgroundColor: base,
      borderBottomColor: "var(--color-chrome-border-subtle)",
    };
  }
  return {
    backgroundColor: base,
    backgroundImage: `linear-gradient(90deg, ${tint(accentColor, focused ? "38" : "16")} 0%, transparent 65%)`,
    borderBottomColor: tint(accentColor, focused ? "66" : "2a"),
  };
}
