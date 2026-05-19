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

export function profileRowAccentStyle(
  accentColor: string | null | undefined,
  isActive: boolean,
): import("react").CSSProperties | undefined {
  if (!accentColor) return undefined;
  return {
    borderLeft: `3px solid ${accentColor}`,
    paddingLeft: "calc(0.375rem - 3px)",
    backgroundColor: isActive ? `${accentColor}28` : undefined,
  };
}
