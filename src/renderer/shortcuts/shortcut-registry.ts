import type { MessageKey } from "../i18n/messages/en";
import { getActiveKeybindings } from "./active-keybindings";
import {
  SHORTCUT_DEFS,
  formatCombo,
  type KeyBinding,
  type KeybindingMap,
  type ShortcutId,
  type ShortcutSectionId,
} from "./keybindings";

export interface ShortcutRow {
  id: ShortcutId;
  /** Formatted combo, or `null` when the shortcut is disabled. */
  keys: string | null;
  labelKey: MessageKey;
}

export interface ShortcutSection {
  titleKey: MessageKey;
  items: ShortcutRow[];
}

export const SHORTCUT_LABEL_KEYS: Record<ShortcutId, MessageKey> = {
  commandPalette: "shortcuts.general.commandPalette",
  cheatsheet: "shortcuts.general.cheatsheet",
  modeTerminal: "shortcuts.general.modeTerminal",
  modeInventory: "shortcuts.general.modeInventory",
  modeTools: "shortcuts.general.modeTools",
  modeFlow: "shortcuts.general.modeFlow",
  toggleSidebar: "shortcuts.terminal.toggleSidebar",
  focusNext: "shortcuts.pane.focusNext",
  focusPrev: "shortcuts.pane.focusPrev",
  focusPane: "shortcuts.pane.focusPane",
  splitHorizontal: "shortcuts.pane.splitHorizontal",
  splitVertical: "shortcuts.pane.splitVertical",
  closePane: "shortcuts.pane.close",
  clearScreen: "shortcuts.pane.clear",
  restartSession: "shortcuts.pane.restart",
  profileByIndex: "shortcuts.profile.byIndex",
  profileCycleNext: "shortcuts.profile.cycleNext",
  profileCyclePrev: "shortcuts.profile.cyclePrev",
  find: "shortcuts.terminal.find",
  copy: "shortcuts.terminal.copy",
  paste: "shortcuts.terminal.paste",
  pasteAlt: "shortcuts.terminal.pasteAlt",
  selectAll: "shortcuts.terminal.selectAll",
};

export const SHORTCUT_SECTION_TITLE_KEYS: Record<ShortcutSectionId, MessageKey> = {
  general: "shortcuts.section.general",
  pane: "shortcuts.section.pane",
  profile: "shortcuts.section.profile",
  terminal: "shortcuts.section.terminal",
};

const SECTION_ORDER: ShortcutSectionId[] = ["general", "pane", "profile", "terminal"];

export function buildShortcutSections(
  map: KeybindingMap = getActiveKeybindings(),
): ShortcutSection[] {
  return SECTION_ORDER.map((section) => ({
    titleKey: SHORTCUT_SECTION_TITLE_KEYS[section],
    items: SHORTCUT_DEFS.filter((d) => d.section === section).map((d) => ({
      id: d.id,
      keys: map[d.id] ? formatCombo(map[d.id]) : null,
      labelKey: SHORTCUT_LABEL_KEYS[d.id],
    })),
  }));
}

/** Formatted combo for one shortcut, or `undefined` when unbound (for optional hint props). */
export function shortcutKeys(
  id: ShortcutId,
  map: KeybindingMap = getActiveKeybindings(),
): string | undefined {
  const binding: KeyBinding = map[id];
  return binding ? formatCombo(binding) : undefined;
}

/** Combo for the n-th item of a digit-family shortcut (`Ctrl+3`), or `undefined` when unbound. */
export function digitShortcutKeys(
  id: ShortcutId,
  index: number,
  map: KeybindingMap = getActiveKeybindings(),
): string | undefined {
  const binding = map[id];
  if (!binding || index < 0 || index > 8) return undefined;
  return formatCombo({ ...binding, key: String(index + 1) });
}

export function cheatsheetToggleKeys(): string | undefined {
  return shortcutKeys("cheatsheet");
}
