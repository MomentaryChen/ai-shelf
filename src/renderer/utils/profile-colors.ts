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

const DEFAULT_FOCUS = "#7eb6ff";

function chromeVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function tint(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

export function profileAccentOrDefault(accent?: string | null): string {
  return accent ?? DEFAULT_FOCUS;
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

/** Sidebar profile group card border. */
export function profileSidebarGroupStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  if (!accentColor) {
    return { borderColor: "var(--color-chrome-border-subtle)" };
  }
  return { borderColor: tint(accentColor, "77") };
}

/** Sidebar profile row when selected. */
export function profileSidebarProfileActiveStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties | undefined {
  if (!accentColor) return undefined;
  return { backgroundColor: tint(accentColor, "2b") };
}

/** Sidebar terminal tab row. */
export function profileSidebarTerminalStyle(
  accentColor: string | null | undefined,
  selected: boolean,
): import("react").CSSProperties | undefined {
  if (!accentColor || !selected) return undefined;
  return {
    backgroundColor: tint(accentColor, "24"),
    boxShadow: `inset 3px 0 0 ${accentColor}`,
  };
}

/** Terminal-mode top bar profile badge. */
export function profileTopBarBadgeStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  if (accentColor) {
    return {
      backgroundColor: tint(accentColor, "12"),
      borderColor: tint(accentColor, "30"),
    };
  }
  const fallback = chromeVar("--color-chrome-accent-text", "#8ab4ff");
  return {
    backgroundColor: `color-mix(in srgb, ${fallback} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${fallback} 20%, transparent)`,
  };
}

export function profileTopBarLabelStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  const fallback = chromeVar("--color-chrome-accent-text", "#8ab4ff");
  return { color: accentColor ?? fallback };
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

/** Pane title bar — gradient + bottom border tied to profile accent. */
export function profilePaneHeaderStyle(
  accentColor: string | null | undefined,
  focused: boolean,
): import("react").CSSProperties {
  const unfocusedBg = chromeVar("--color-chrome-pane-header-unfocused", "rgba(0,0,0,0.4)");
  if (!accentColor) {
    return {
      background: unfocusedBg,
      borderBottomColor: chromeVar("--color-chrome-border-subtle", "#2a2a30"),
    };
  }
  return {
    background: focused
      ? `linear-gradient(90deg, ${tint(accentColor, "18")} 0%, ${unfocusedBg} 48%)`
      : `linear-gradient(90deg, ${tint(accentColor, "0a")} 0%, ${unfocusedBg} 52%)`,
    borderBottomColor: tint(accentColor, focused ? "40" : "20"),
  };
}

export function profilePaneHeaderDotStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  const accent = profileAccentOrDefault(accentColor);
  return profileAccentMarkerStyle(accent, "sm");
}
