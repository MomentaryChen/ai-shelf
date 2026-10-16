/**
 * Configurable keyboard shortcuts — pure model (no DOM / settings access) so it
 * can be unit tested under plain Node.
 *
 * Every app shortcut is a {@link ShortcutId}. A user's settings store only the
 * overrides ({@link KeybindingOverrides}); `null` means "unbound" so the key
 * passes straight through to the terminal.
 */

export type KeyPlatform = "mac" | "win" | "linux";

/**
 * One key combination.
 *
 * - `mod`  — primary modifier, matches Ctrl **or** Cmd (lenient, legacy behaviour).
 * - `ctrl` — Ctrl only (ignored when `mod` is set).
 * - `meta` — Cmd / Win key only (ignored when `mod` is set).
 * - `key`  — normalized lowercase `KeyboardEvent.key`; `"digit"` means any of 1–9
 *   (used by the "by index" family shortcuts).
 */
export interface KeyCombo {
  key: string;
  mod?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** A combo, or `null` when the shortcut is disabled. */
export type KeyBinding = KeyCombo | null;

export const SHORTCUT_IDS = [
  "commandPalette",
  "cheatsheet",
  "modeTerminal",
  "modeInventory",
  "modeTools",
  "modeFlow",
  "toggleSidebar",
  "focusNext",
  "focusPrev",
  "focusPane",
  "splitHorizontal",
  "splitVertical",
  "closePane",
  "clearScreen",
  "restartSession",
  "profileByIndex",
  "profileCycleNext",
  "profileCyclePrev",
  "find",
  "copy",
  "paste",
  "pasteAlt",
  "selectAll",
] as const;

export type ShortcutId = (typeof SHORTCUT_IDS)[number];

export type KeybindingMap = Record<ShortcutId, KeyBinding>;
export type KeybindingOverrides = Partial<Record<ShortcutId, KeyBinding>>;

export type ShortcutSectionId = "general" | "pane" | "profile" | "terminal";

export interface ShortcutDef {
  id: ShortcutId;
  section: ShortcutSectionId;
  /** Binding key is the "digit" wildcard (1–9); recording captures modifiers only. */
  digitFamily?: boolean;
}

export const SHORTCUT_DEFS: readonly ShortcutDef[] = [
  { id: "commandPalette", section: "general" },
  { id: "cheatsheet", section: "general" },
  { id: "modeTerminal", section: "general" },
  { id: "modeInventory", section: "general" },
  { id: "modeTools", section: "general" },
  { id: "modeFlow", section: "general" },
  { id: "toggleSidebar", section: "general" },
  { id: "focusNext", section: "pane" },
  { id: "focusPrev", section: "pane" },
  { id: "focusPane", section: "pane", digitFamily: true },
  { id: "splitHorizontal", section: "pane" },
  { id: "splitVertical", section: "pane" },
  { id: "closePane", section: "pane" },
  { id: "clearScreen", section: "pane" },
  { id: "restartSession", section: "pane" },
  { id: "profileByIndex", section: "profile", digitFamily: true },
  { id: "profileCycleNext", section: "profile" },
  { id: "profileCyclePrev", section: "profile" },
  { id: "find", section: "terminal" },
  { id: "copy", section: "terminal" },
  { id: "paste", section: "terminal" },
  { id: "pasteAlt", section: "terminal" },
  { id: "selectAll", section: "terminal" },
];

const DEF_BY_ID = new Map(SHORTCUT_DEFS.map((d) => [d.id, d]));

export function isDigitFamily(id: ShortcutId): boolean {
  return Boolean(DEF_BY_ID.get(id)?.digitFamily);
}

/**
 * Shortcut pairs that intentionally share a combo because they apply in
 * different contexts (profile switch by index runs outside xterm, pane focus
 * by index inside a multi-pane layout). Not reported as conflicts.
 */
const ALLOWED_OVERLAPS: ReadonlyArray<readonly [ShortcutId, ShortcutId]> = [
  ["focusPane", "profileByIndex"],
];

export const DIGIT_KEY = "digit";

export function defaultKeybindings(platform: KeyPlatform): KeybindingMap {
  return {
    commandPalette: { key: "k", mod: true },
    cheatsheet: { key: "/", mod: true },
    modeTerminal: { key: "1", alt: true },
    modeInventory: { key: "2", alt: true },
    modeTools: { key: "3", alt: true },
    modeFlow: { key: "4", alt: true },
    toggleSidebar: { key: "s", mod: true },
    focusNext: { key: "tab", mod: true },
    focusPrev: { key: "tab", mod: true, shift: true },
    focusPane: { key: DIGIT_KEY, mod: true },
    splitHorizontal: { key: "\\", mod: true },
    splitVertical: { key: "\\", mod: true, shift: true },
    closePane: { key: "w", mod: true },
    clearScreen: { key: "l", mod: true },
    restartSession: { key: "r", mod: true, shift: true },
    profileByIndex: { key: DIGIT_KEY, mod: true },
    profileCycleNext: { key: "`", mod: true },
    profileCyclePrev: { key: "`", mod: true, shift: true },
    find: { key: "f", mod: true },
    copy: { key: "c", mod: true, shift: true },
    paste: { key: "v", mod: true, shift: true },
    pasteAlt: { key: "v", mod: true },
    // Windows: Ctrl+A (user expectation). Mac: Cmd+A. Linux: Ctrl+Shift+A (Ctrl+A = line start).
    selectAll:
      platform === "mac"
        ? { key: "a", meta: true }
        : platform === "win"
          ? { key: "a", mod: true }
          : { key: "a", mod: true, shift: true },
  };
}

export function detectKeyPlatform(): KeyPlatform {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const s = nav ? nav.platform || nav.userAgent || "" : "";
  if (/mac/i.test(s)) return "mac";
  if (/win/i.test(s)) return "win";
  return "linux";
}

// ---------------------------------------------------------------------------
// Normalization / settings migration
// ---------------------------------------------------------------------------

const MODIFIER_KEYS = new Set(["control", "meta", "shift", "alt", "altgraph", "os", "capslock"]);

export function normalizeKeyName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw === " ") return " ";
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  if (k === "|") return "\\";
  if (k === "space" || k === "spacebar") return " ";
  if (k === "esc") return "escape";
  return k;
}

export function normalizeCombo(raw: unknown): KeyCombo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = normalizeKeyName(o.key);
  if (!key || MODIFIER_KEYS.has(key)) return null;
  const combo: KeyCombo = { key };
  if (o.mod === true) combo.mod = true;
  if (o.ctrl === true && !combo.mod) combo.ctrl = true;
  if (o.meta === true && !combo.mod) combo.meta = true;
  if (o.shift === true) combo.shift = true;
  if (o.alt === true) combo.alt = true;
  return combo;
}

/** Sanitize stored overrides: unknown ids dropped, `null` kept (unbound), bad combos dropped. */
export function normalizeKeybindingOverrides(raw: unknown): KeybindingOverrides {
  const out: KeybindingOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  for (const id of SHORTCUT_IDS) {
    if (!(id in o)) continue;
    const v = o[id];
    if (v === null) {
      out[id] = null;
      continue;
    }
    const combo = normalizeCombo(v);
    if (!combo) continue;
    if (isDigitFamily(id) !== (combo.key === DIGIT_KEY)) continue;
    out[id] = combo;
  }
  return out;
}

/**
 * Convert the legacy `paneShortcuts` settings object (Ctrl/Cmd chords for
 * focus / split only) into keybinding overrides.
 */
export function migrateLegacyPaneShortcuts(raw: unknown): KeybindingOverrides {
  const out: KeybindingOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  const defaults = defaultKeybindings("win");
  const chordFields = ["focusNext", "focusPrev", "splitHorizontal", "splitVertical"] as const;
  for (const field of chordFields) {
    const chord = o[field];
    if (!chord || typeof chord !== "object") continue;
    const c = chord as Record<string, unknown>;
    const key = normalizeKeyName(c.key);
    if (!key) continue;
    const combo: KeyCombo = { key, mod: true };
    if (c.shift === true) combo.shift = true;
    if (!combosEqual(combo, defaults[field])) out[field] = combo;
  }
  const focusPane = o.focusPane;
  if (focusPane && typeof focusPane === "object" && (focusPane as { shift?: unknown }).shift === true) {
    out.focusPane = { key: DIGIT_KEY, mod: true, shift: true };
  }
  return out;
}

/**
 * Overrides from a stored settings object: the `keybindings` field when present,
 * otherwise migrated from the legacy `paneShortcuts` field.
 */
export function keybindingOverridesFromStoredSettings(stored: unknown): KeybindingOverrides {
  if (!stored || typeof stored !== "object") return {};
  const o = stored as { keybindings?: unknown; paneShortcuts?: unknown };
  return o.keybindings !== undefined
    ? normalizeKeybindingOverrides(o.keybindings)
    : migrateLegacyPaneShortcuts(o.paneShortcuts);
}

export function resolveKeybindings(
  overrides: KeybindingOverrides | undefined,
  platform: KeyPlatform = detectKeyPlatform(),
): KeybindingMap {
  const map = defaultKeybindings(platform);
  if (!overrides) return map;
  for (const id of SHORTCUT_IDS) {
    if (id in overrides) map[id] = overrides[id] ?? null;
  }
  return map;
}

/** Set one binding; returns new overrides (removes the override when equal to default). */
export function setKeybindingOverride(
  overrides: KeybindingOverrides,
  id: ShortcutId,
  binding: KeyBinding,
  platform: KeyPlatform = detectKeyPlatform(),
): KeybindingOverrides {
  const next: KeybindingOverrides = { ...overrides };
  const def = defaultKeybindings(platform)[id];
  if (binding && def && combosEqual(binding, def)) delete next[id];
  else next[id] = binding;
  return next;
}

export function resetKeybindingOverride(
  overrides: KeybindingOverrides,
  id: ShortcutId,
): KeybindingOverrides {
  const next: KeybindingOverrides = { ...overrides };
  delete next[id];
  return next;
}

export function combosEqual(a: KeyBinding, b: KeyBinding): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.key === b.key &&
    Boolean(a.mod) === Boolean(b.mod) &&
    Boolean(a.ctrl) === Boolean(b.ctrl) &&
    Boolean(a.meta) === Boolean(b.meta) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  );
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Subset of KeyboardEvent used for matching (plain objects in tests). */
export interface KeyEventLike {
  type?: string;
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const CODE_KEYS: Record<string, string> = {
  Backquote: "`",
  Backslash: "\\",
  IntlBackslash: "\\",
  Slash: "/",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Space: " ",
  Tab: "tab",
};

/** Layout-position key from `KeyboardEvent.code` (Digit1 → "1", KeyA → "a", Slash → "/"). */
export function keyFromCode(code: string | undefined): string | null {
  if (!code) return null;
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1]!;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!.toLowerCase();
  return CODE_KEYS[code] ?? null;
}

function isLetter(k: string): boolean {
  return /^[a-z]$/.test(k);
}

function modifiersMatch(ev: KeyEventLike, combo: KeyCombo): boolean {
  if (ev.shiftKey !== Boolean(combo.shift)) return false;
  if (ev.altKey !== Boolean(combo.alt)) return false;
  if (combo.mod) return ev.ctrlKey || ev.metaKey;
  return ev.ctrlKey === Boolean(combo.ctrl) && ev.metaKey === Boolean(combo.meta);
}

/**
 * Keys an event could stand for: `ev.key` plus the physical `code` key when
 * Shift/Alt changed the glyph (Shift+1 → "!", Option+1 → "¡", Shift+/ → "?").
 * Letter codes are only used with Alt so non-QWERTY layouts keep their letters.
 */
function eventKeys(ev: KeyEventLike): string[] {
  const keys: string[] = [];
  const k = normalizeKeyName(ev.key);
  if (k) keys.push(k);
  const c = keyFromCode(ev.code);
  if (c && c !== k && (!isLetter(c) || ev.altKey)) keys.push(c);
  return keys;
}

/**
 * Whether `ev` matches `combo`. Returns `false` on mismatch, otherwise an
 * object with the 0-based digit index for "digit" combos.
 */
export function matchCombo(
  ev: KeyEventLike,
  combo: KeyBinding,
): false | { index?: number } {
  if (!combo) return false;
  if (ev.type && ev.type !== "keydown") return false;
  if (!modifiersMatch(ev, combo)) return false;
  const keys = eventKeys(ev);
  if (combo.key === DIGIT_KEY) {
    const d = keys.find((k) => /^[1-9]$/.test(k));
    return d ? { index: Number(d) - 1 } : false;
  }
  return keys.includes(combo.key) ? {} : false;
}

export interface ShortcutMatch {
  id: ShortcutId;
  /** 0-based index for digit-family shortcuts. */
  index?: number;
}

/** First shortcut in `ids` (order matters) whose binding matches `ev`. */
export function matchShortcut(
  ev: KeyEventLike,
  map: KeybindingMap,
  ids: readonly ShortcutId[] = SHORTCUT_IDS,
): ShortcutMatch | null {
  for (const id of ids) {
    const m = matchCombo(ev, map[id]);
    if (m) return m.index === undefined ? { id } : { id, index: m.index };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recording (settings capture)
// ---------------------------------------------------------------------------

export type RecordResult =
  | { kind: "combo"; combo: KeyCombo }
  | { kind: "cancel" }
  /** Modifier-only press or a key that cannot be a shortcut — keep listening. */
  | { kind: "pending" }
  | { kind: "invalid" };

/**
 * Turn a keydown into a combo for the settings recorder.
 * Requires Ctrl/Cmd or Alt, except function keys (F1–F24).
 */
export function recordComboFromEvent(ev: KeyEventLike, digitFamily = false): RecordResult {
  const evKey = normalizeKeyName(ev.key);
  if (!evKey || MODIFIER_KEYS.has(evKey)) return { kind: "pending" };
  const hasMod = ev.ctrlKey || ev.metaKey;
  if (evKey === "escape" && !hasMod && !ev.altKey && !ev.shiftKey) return { kind: "cancel" };

  const codeKey = keyFromCode(ev.code);
  // Shift/Alt alter glyphs; store the physical key so the combo is readable (Ctrl+Shift+/ not "?").
  let key = evKey;
  if (codeKey && (ev.shiftKey || ev.altKey) && (!isLetter(codeKey) || ev.altKey)) key = codeKey;

  if (digitFamily) {
    if (!/^[1-9]$/.test(key)) return { kind: "invalid" };
    if (!hasMod && !ev.altKey) return { kind: "invalid" };
    key = DIGIT_KEY;
  } else {
    const fnKey = /^f([1-9]|1[0-9]|2[0-4])$/.test(key);
    if (!hasMod && !ev.altKey && !fnKey) return { kind: "invalid" };
  }

  const combo: KeyCombo = { key };
  if (hasMod) combo.mod = true;
  if (ev.shiftKey) combo.shift = true;
  if (ev.altKey) combo.alt = true;
  return { kind: "combo", combo };
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

type ModSlot = "ctrl" | "meta" | "none";

function modSlots(c: KeyCombo): Set<ModSlot> {
  if (c.mod) return new Set<ModSlot>(["ctrl", "meta"]);
  if (c.ctrl) return new Set<ModSlot>(["ctrl"]);
  if (c.meta) return new Set<ModSlot>(["meta"]);
  return new Set<ModSlot>(["none"]);
}

/** Whether a single key press could trigger both combos. */
export function combosOverlap(a: KeyBinding, b: KeyBinding): boolean {
  if (!a || !b) return false;
  if (Boolean(a.shift) !== Boolean(b.shift) || Boolean(a.alt) !== Boolean(b.alt)) return false;
  const sa = modSlots(a);
  const sb = modSlots(b);
  if (![...sa].some((s) => sb.has(s))) return false;
  if (a.key === b.key) return true;
  if (a.key === DIGIT_KEY) return /^[1-9]$/.test(b.key);
  if (b.key === DIGIT_KEY) return /^[1-9]$/.test(a.key);
  return false;
}

function isAllowedOverlap(a: ShortcutId, b: ShortcutId): boolean {
  return ALLOWED_OVERLAPS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** For each shortcut that collides with another, the ids it collides with. */
export function findKeybindingConflicts(map: KeybindingMap): Map<ShortcutId, ShortcutId[]> {
  const out = new Map<ShortcutId, ShortcutId[]>();
  for (let i = 0; i < SHORTCUT_IDS.length; i++) {
    for (let j = i + 1; j < SHORTCUT_IDS.length; j++) {
      const a = SHORTCUT_IDS[i]!;
      const b = SHORTCUT_IDS[j]!;
      if (isAllowedOverlap(a, b)) continue;
      if (!combosOverlap(map[a], map[b])) continue;
      out.set(a, [...(out.get(a) ?? []), b]);
      out.set(b, [...(out.get(b) ?? []), a]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

const DISPLAY_KEY: Record<string, string> = {
  tab: "Tab",
  " ": "Space",
  escape: "Esc",
  enter: "Enter",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  [DIGIT_KEY]: "1–9",
};

export function displayKeyName(key: string): string {
  const k = key.toLowerCase();
  if (DISPLAY_KEY[k]) return DISPLAY_KEY[k]!;
  if (/^f\d{1,2}$/.test(k)) return k.toUpperCase();
  if (k.length === 1) return k.toUpperCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** Human-readable combo (`Ctrl+Shift+\`); empty string when unbound. */
export function formatCombo(
  combo: KeyBinding,
  platform: KeyPlatform = detectKeyPlatform(),
): string {
  if (!combo) return "";
  const mac = platform === "mac";
  const parts: string[] = [];
  if (combo.mod) parts.push(mac ? "Cmd" : "Ctrl");
  else {
    if (combo.ctrl) parts.push("Ctrl");
    if (combo.meta) parts.push(mac ? "Cmd" : "Win");
  }
  if (combo.alt) parts.push(mac ? "Option" : "Alt");
  if (combo.shift) parts.push("Shift");
  parts.push(displayKeyName(combo.key));
  return parts.join("+");
}
