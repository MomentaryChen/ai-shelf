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

export function isProfileAccentColor(value: string | null | undefined): value is ProfileAccentColor {
  if (!value) return false;
  return (PROFILE_ACCENT_COLORS as readonly string[]).includes(value);
}

export function pickNextProfileAccentColor(used: (string | null | undefined)[]): ProfileAccentColor {
  const usedSet = new Set(used.filter(isProfileAccentColor));
  for (const c of PROFILE_ACCENT_COLORS) {
    if (!usedSet.has(c)) return c;
  }
  return PROFILE_ACCENT_COLORS[usedSet.size % PROFILE_ACCENT_COLORS.length]!;
}
