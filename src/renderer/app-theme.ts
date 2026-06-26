import { useEffect, useState } from "react";
import { prefersDarkColorScheme } from "./system-appearance.js";

export type AppColorTheme = "system" | "warm" | "light" | "dark" | "contrast";

export type ResolvedAppColorTheme = "warm" | "light" | "dark" | "contrast";

export const DEFAULT_APP_THEME: AppColorTheme = "system";

export const APP_THEME_OPTIONS: {
  value: AppColorTheme;
  label: string;
  preview: { bg: string; fg: string; accent: string };
}[] = [
  {
    value: "system",
    label: "跟隨系統",
    preview: { bg: "#0f172a", fg: "#FBF7F0", accent: "#C97B5A" },
  },
  { value: "warm", label: "暖色", preview: { bg: "#FBF7F0", fg: "#4A4039", accent: "#C97B5A" } },
  { value: "light", label: "淺色", preview: { bg: "#f8fafc", fg: "#0f172a", accent: "#0284c7" } },
  { value: "dark", label: "深色", preview: { bg: "#0f172a", fg: "#f1f5f9", accent: "#38bdf8" } },
  { value: "contrast", label: "對比色", preview: { bg: "#000000", fg: "#ffffff", accent: "#ffff00" } },
];

export function normalizeAppTheme(raw: unknown): AppColorTheme {
  if (
    raw === "system" ||
    raw === "warm" ||
    raw === "light" ||
    raw === "dark" ||
    raw === "contrast"
  ) {
    return raw;
  }
  return DEFAULT_APP_THEME;
}

/** Map stored preference to the palette applied to the DOM. */
export function resolveAppTheme(theme: AppColorTheme): ResolvedAppColorTheme {
  if (theme !== "system") return theme;
  return prefersDarkColorScheme() ? "dark" : "warm";
}

export function applyAppTheme(theme: AppColorTheme): void {
  const resolved = resolveAppTheme(theme);
  document.documentElement.dataset.appTheme = resolved;
  document.documentElement.dataset.appThemePref = theme;
  window.dispatchEvent(
    new CustomEvent("app-theme-change", { detail: { theme, resolved } }),
  );
}

/** Bump when theme changes so components using inline chrome styles re-read CSS variables. */
export function useAppThemeRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const onTheme = () => setRevision((r) => r + 1);
    window.addEventListener("app-theme-change", onTheme);
    return () => window.removeEventListener("app-theme-change", onTheme);
  }, []);
  return revision;
}

export function getChromeCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** xterm.js palette aligned with the active app theme (for embedded terminals). */
export function getXtermTheme(background: string): Record<string, string> {
  const theme = document.documentElement.dataset.appTheme ?? "warm";
  if (theme === "light") {
    return {
      background,
      foreground: "#0f172a",
      cursor: "#0f172a",
      cursorAccent: background,
      selectionBackground: "#0f172a30",
      black: "#0f172a",
      brightBlack: "#475569",
      red: "#dc2626",
      brightRed: "#ef4444",
      green: "#16a34a",
      brightGreen: "#22c55e",
      yellow: "#ca8a04",
      brightYellow: "#eab308",
      blue: "#0284c7",
      brightBlue: "#0ea5e9",
      magenta: "#9333ea",
      brightMagenta: "#a855f7",
      cyan: "#0891b2",
      brightCyan: "#06b6d4",
      white: "#334155",
      brightWhite: "#0f172a",
    };
  }
  if (theme === "contrast") {
    return {
      background,
      foreground: "#ffffff",
      cursor: "#ffff00",
      cursorAccent: background,
      selectionBackground: "#ffff0040",
      black: "#000000",
      brightBlack: "#ffffff",
      red: "#ff4444",
      brightRed: "#ff6666",
      green: "#00ff00",
      brightGreen: "#66ff66",
      yellow: "#ffff00",
      brightYellow: "#ffff99",
      blue: "#00ffff",
      brightBlue: "#99ffff",
      magenta: "#ff00ff",
      brightMagenta: "#ff99ff",
      cyan: "#00ffff",
      brightCyan: "#99ffff",
      white: "#ffffff",
      brightWhite: "#ffffff",
    };
  }
  if (theme === "dark") {
    return {
      background,
      foreground: "#cccccc",
      cursor: "#ffffff",
      cursorAccent: background,
      selectionBackground: "#ffffff40",
      black: "#0c0c0c",
      brightBlack: "#767676",
      red: "#c50f1f",
      brightRed: "#e74856",
      green: "#13a10e",
      brightGreen: "#16c60c",
      yellow: "#c19c00",
      brightYellow: "#f9f1a5",
      blue: "#0037da",
      brightBlue: "#3b78ff",
      magenta: "#881798",
      brightMagenta: "#b4009e",
      cyan: "#3a96dd",
      brightCyan: "#61d6d6",
      white: "#cccccc",
      brightWhite: "#f2f2f2",
    };
  }
  /* warm: brown-tinted terminal palette synced with clay/cream UI */
  return {
    background,
    foreground: "#e8ddd0",
    cursor: "#f1e8da",
    cursorAccent: background,
    selectionBackground: "rgb(201 123 90 / 0.35)",
    black: "#2c2420",
    brightBlack: "#6b5f56",
    red: "#c45c4a",
    brightRed: "#d97a6a",
    green: "#7fb069",
    brightGreen: "#95c47f",
    yellow: "#c9a227",
    brightYellow: "#dbb84a",
    blue: "#5a8fbd",
    brightBlue: "#7aa8cc",
    magenta: "#a86b7a",
    brightMagenta: "#c08896",
    cyan: "#8a9a7b",
    brightCyan: "#a3b294",
    white: "#e8ddd0",
    brightWhite: "#f1e8da",
  };
}
