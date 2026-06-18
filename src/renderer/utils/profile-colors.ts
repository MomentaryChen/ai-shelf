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

const PROFILE_CARD_BORDER_WIDTH = 2;

/** Profile card container — border, fill, optional glow when active. */
export function profileCardStyle(
  accentColor: string | null | undefined,
  isActive: boolean,
): import("react").CSSProperties {
  const borderBase = { borderWidth: PROFILE_CARD_BORDER_WIDTH, borderStyle: "solid" as const };
  if (!accentColor) {
    return isActive
      ? {
          ...borderBase,
          backgroundColor: chromeVar("--color-chrome-profile-card-active-bg", "#12161f"),
          borderColor: chromeVar("--color-chrome-profile-card-active-border", "#3a5070"),
          boxShadow: "0 0 0 2px rgba(126, 182, 255, 0.14), 0 4px 16px rgba(0,0,0,0.35)",
        }
      : {
          ...borderBase,
          backgroundColor: chromeVar("--color-chrome-profile-card-bg", "#111113"),
          borderColor: chromeVar("--color-chrome-profile-card-border", "#303035"),
        };
  }
  return {
    ...borderBase,
    backgroundColor: tint(accentColor, isActive ? "14" : "08"),
    borderColor: tint(accentColor, isActive ? "62" : "40"),
    boxShadow: isActive
      ? `0 0 0 2px ${tint(accentColor, "28")}, 0 4px 20px ${tint(accentColor, "18")}`
      : "0 1px 2px rgba(0,0,0,0.2)",
  };
}

/** 2px top stripe on profile card. */
export function profileCardTopStripe(
  accentColor: string | null | undefined,
): import("react").CSSProperties | undefined {
  if (!accentColor) return undefined;
  return {
    background: `linear-gradient(90deg, ${tint(accentColor, "cc")}, ${tint(accentColor, "44")})`,
    height: 2,
  };
}

export function profileRowAccentStyle(
  accentColor: string | null | undefined,
  isActive: boolean,
): import("react").CSSProperties | undefined {
  if (!accentColor) return undefined;
  return {
    backgroundColor: isActive ? tint(accentColor, "20") : "transparent",
  };
}

export function profileSessionsWellStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  const accent = profileAccentOrDefault(accentColor);
  return {
    borderLeftWidth: 3,
    borderLeftColor: tint(accent, "77"),
    backgroundColor: chromeVar("--color-chrome-sessions-well-bg", "rgba(0,0,0,0.22)"),
  };
}

export function profileSessionRowStyle(
  accentColor: string | null | undefined,
  selected: boolean,
): import("react").CSSProperties {
  const accent = profileAccentOrDefault(accentColor);
  return {
    backgroundColor: selected ? tint(accent, "1c") : "transparent",
    boxShadow: selected ? `inset 3px 0 0 ${accent}` : "inset 3px 0 0 transparent",
  };
}

export function profilePaneChromeStyle(
  accentColor: string | null | undefined,
  focused: boolean,
): import("react").CSSProperties | undefined {
  if (!focused) return undefined;
  const accent = profileAccentOrDefault(accentColor);
  return {
    borderColor: tint(accent, "88"),
    boxShadow: `0 0 0 1px ${tint(accent, "30")}, 0 8px 24px ${tint(accent, "12")}`,
  };
}

export function profilePaneHeaderStyle(
  accentColor: string | null | undefined,
  focused: boolean,
): import("react").CSSProperties {
  const accent = profileAccentOrDefault(accentColor);
  return {
    background: focused
      ? `linear-gradient(90deg, ${tint(accent, "18")} 0%, ${chromeVar("--color-chrome-pane-header-unfocused", "rgba(0,0,0,0.45)")} 48%)`
      : chromeVar("--color-chrome-pane-header-unfocused", "rgba(0,0,0,0.4)"),
    borderBottomColor: tint(accent, focused ? "40" : "18"),
  };
}

export function profilePaneHeaderDotStyle(
  accentColor: string | null | undefined,
): import("react").CSSProperties {
  const accent = profileAccentOrDefault(accentColor);
  return {
    backgroundColor: accent,
    boxShadow: `0 0 6px ${tint(accent, "88")}`,
  };
}
