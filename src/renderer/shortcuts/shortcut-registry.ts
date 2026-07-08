import type { MessageKey } from "../i18n/messages/en";
import { loadSettings } from "../chat-settings";
import {
  DEFAULT_PANE_SHORTCUT_BINDINGS,
  formatFocusPaneBinding,
  formatPaneKeyChord,
  type PaneShortcutBindings,
} from "../terminal/pane-key-bindings";
import { formatProfileQuickSwitchLabels, modLabel } from "../profile-quick-switch";

export interface ShortcutRow {
  keys: string;
  labelKey: MessageKey;
}

export interface ShortcutSection {
  titleKey: MessageKey;
  items: ShortcutRow[];
}

function mod(): string {
  return modLabel();
}

function isMac(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent || "")
  );
}

function buildPaneSections(bindings: PaneShortcutBindings): ShortcutSection {
  return {
    titleKey: "shortcuts.section.pane",
    items: [
      { keys: formatPaneKeyChord(bindings.focusNext), labelKey: "shortcuts.pane.focusNext" },
      { keys: formatPaneKeyChord(bindings.focusPrev), labelKey: "shortcuts.pane.focusPrev" },
      {
        keys: formatPaneKeyChord(bindings.splitHorizontal),
        labelKey: "shortcuts.pane.splitHorizontal",
      },
      {
        keys: formatPaneKeyChord(bindings.splitVertical),
        labelKey: "shortcuts.pane.splitVertical",
      },
      { keys: formatFocusPaneBinding(bindings.focusPane), labelKey: "shortcuts.pane.focusPane" },
      { keys: `${mod()}+W`, labelKey: "shortcuts.pane.close" },
      { keys: `${mod()}+L`, labelKey: "shortcuts.pane.clear" },
      { keys: `${mod()}+Shift+R`, labelKey: "shortcuts.pane.restart" },
    ],
  };
}

export function buildShortcutSections(
  bindings: PaneShortcutBindings = loadSettings().paneShortcuts ??
    DEFAULT_PANE_SHORTCUT_BINDINGS,
): ShortcutSection[] {
  const profile = formatProfileQuickSwitchLabels();
  const m = mod();
  const copyKeys = isMac() ? `${m}+C` : `${m}+Shift+C`;
  const pasteKeys = isMac() ? `${m}+V` : `${m}+Shift+V`;
  const win =
    typeof navigator !== "undefined" &&
    /win/i.test(navigator.platform || navigator.userAgent || "");
  const selectAllKeys = isMac() || win ? `${m}+A` : `${m}+Shift+A`;

  return [
    {
      titleKey: "shortcuts.section.general",
      items: [
        { keys: `${m}+K`, labelKey: "shortcuts.general.commandPalette" },
        { keys: `${m}+/`, labelKey: "shortcuts.general.cheatsheet" },
      ],
    },
    buildPaneSections(bindings),
    {
      titleKey: "shortcuts.section.profile",
      items: [
        { keys: profile.profileByIndex, labelKey: "shortcuts.profile.byIndex" },
        { keys: profile.profileCycle, labelKey: "shortcuts.profile.cycleNext" },
        { keys: profile.profileCyclePrev, labelKey: "shortcuts.profile.cyclePrev" },
      ],
    },
    {
      titleKey: "shortcuts.section.terminal",
      items: [
        { keys: `${m}+S`, labelKey: "shortcuts.terminal.toggleSidebar" },
        { keys: `${m}+F`, labelKey: "shortcuts.terminal.find" },
        { keys: copyKeys, labelKey: "shortcuts.terminal.copy" },
        { keys: pasteKeys, labelKey: "shortcuts.terminal.paste" },
        { keys: selectAllKeys, labelKey: "shortcuts.terminal.selectAll" },
      ],
    },
  ];
}

export function cheatsheetToggleKeys(): string {
  return `${mod()}+/`;
}
