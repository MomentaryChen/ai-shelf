/** Serializable chord: Ctrl/Cmd + optional Shift + key (lowercase). */
export interface PaneKeyChord {
  key: string;
  shift?: boolean;
}

export interface PaneFocusPaneBinding {
  /** Modifier for Ctrl/Cmd+1 … Ctrl/Cmd+9 (digit keys are fixed). */
  shift?: boolean;
}

export interface PaneShortcutBindings {
  focusNext: PaneKeyChord;
  focusPrev: PaneKeyChord;
  splitHorizontal: PaneKeyChord;
  splitVertical: PaneKeyChord;
  focusPane: PaneFocusPaneBinding;
}

export const DEFAULT_PANE_SHORTCUT_BINDINGS: PaneShortcutBindings = {
  focusNext: { key: "tab" },
  focusPrev: { key: "tab", shift: true },
  splitHorizontal: { key: "\\" },
  splitVertical: { key: "\\", shift: true },
  focusPane: {},
};

function normalizeKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  if (k === "|") return "\\";
  return k;
}

function normalizeChord(raw: unknown, fallback: PaneKeyChord): PaneKeyChord {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const o = raw as Partial<PaneKeyChord>;
  const key = normalizeKey(o.key) ?? fallback.key;
  return {
    key,
    shift: typeof o.shift === "boolean" ? o.shift : fallback.shift,
  };
}

export function normalizePaneShortcutBindings(raw: unknown): PaneShortcutBindings {
  const d = DEFAULT_PANE_SHORTCUT_BINDINGS;
  if (!raw || typeof raw !== "object") return { ...d };
  const o = raw as Partial<PaneShortcutBindings>;
  const focusPaneRaw = o.focusPane;
  const focusPane: PaneFocusPaneBinding =
    focusPaneRaw && typeof focusPaneRaw === "object"
      ? { shift: typeof focusPaneRaw.shift === "boolean" ? focusPaneRaw.shift : d.focusPane.shift }
      : { ...d.focusPane };
  return {
    focusNext: normalizeChord(o.focusNext, d.focusNext),
    focusPrev: normalizeChord(o.focusPrev, d.focusPrev),
    splitHorizontal: normalizeChord(o.splitHorizontal, d.splitHorizontal),
    splitVertical: normalizeChord(o.splitVertical, d.splitVertical),
    focusPane,
  };
}

function hasMod(ev: KeyboardEvent): boolean {
  return ev.ctrlKey || ev.metaKey;
}

function chordMatches(ev: KeyboardEvent, chord: PaneKeyChord): boolean {
  if (!hasMod(ev) || ev.altKey) return false;
  const wantShift = Boolean(chord.shift);
  if (ev.shiftKey !== wantShift) return false;
  const key = ev.key.toLowerCase();
  const want = chord.key.toLowerCase();
  if (want === "\\") return key === "\\" || key === "|";
  return key === want;
}

function focusPaneMatches(ev: KeyboardEvent, binding: PaneFocusPaneBinding): boolean {
  if (!hasMod(ev) || ev.altKey) return false;
  const wantShift = Boolean(binding.shift);
  if (ev.shiftKey !== wantShift) return false;
  const key = ev.key;
  if (key >= "1" && key <= "9") return true;
  return false;
}

export type PaneFocusSplitAction =
  | { type: "focus-next" }
  | { type: "focus-prev" }
  | { type: "focus-index"; index: number }
  | { type: "split"; direction: "horizontal" | "vertical" };

export function matchPaneFocusSplitShortcut(
  ev: KeyboardEvent,
  bindings: PaneShortcutBindings,
): PaneFocusSplitAction | null {
  if (ev.type !== "keydown") return null;

  if (chordMatches(ev, bindings.focusNext)) return { type: "focus-next" };
  if (chordMatches(ev, bindings.focusPrev)) return { type: "focus-prev" };
  if (chordMatches(ev, bindings.splitHorizontal)) return { type: "split", direction: "horizontal" };
  if (chordMatches(ev, bindings.splitVertical)) return { type: "split", direction: "vertical" };

  if (focusPaneMatches(ev, bindings.focusPane)) {
    return { type: "focus-index", index: Number(ev.key) - 1 };
  }

  return null;
}

const DISPLAY_KEY: Record<string, string> = {
  tab: "Tab",
  "\\": "\\",
  " ": "Space",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
};

function displayKey(key: string): string {
  const k = key.toLowerCase();
  if (DISPLAY_KEY[k]) return DISPLAY_KEY[k]!;
  if (k.length === 1) return k.toUpperCase();
  return k;
}

function modLabel(): string {
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent || "");
  return isMac ? "Cmd" : "Ctrl";
}

export function formatPaneKeyChord(chord: PaneKeyChord): string {
  const parts = [modLabel()];
  if (chord.shift) parts.push("Shift");
  parts.push(displayKey(chord.key));
  return parts.join("+");
}

export function formatFocusPaneBinding(binding: PaneFocusPaneBinding): string {
  const parts = [modLabel()];
  if (binding.shift) parts.push("Shift");
  parts.push("1–9");
  return parts.join("+");
}

/** Parse a keydown into a chord for settings capture (requires Ctrl/Cmd, rejects Alt). */
export function chordFromKeyboardEvent(ev: KeyboardEvent): PaneKeyChord | null {
  if (ev.type !== "keydown" || !hasMod(ev) || ev.altKey) return null;
  const key = normalizeKey(ev.key);
  if (!key) return null;
  if (key === "control" || key === "meta" || key === "shift" || key === "alt") return null;
  return { key, shift: ev.shiftKey || undefined };
}
