import { SETTINGS_KEY } from "../settings-key";
import {
  keybindingOverridesFromStoredSettings,
  resolveKeybindings,
  type KeybindingMap,
} from "./keybindings";

let cachedRaw: string | null | undefined;
let cachedMap: KeybindingMap | null = null;
let suspended = 0;
let suspendedMap: KeybindingMap | null = null;

/**
 * Suspend all app shortcuts (e.g. while the settings recorder captures a combo),
 * so pressing an existing combo does not also trigger its action. Returns `resume`.
 */
export function suspendKeybindings(): () => void {
  suspended += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    suspended -= 1;
  };
}

/**
 * Resolved keybindings for the current settings. Called on every keydown, so
 * the parse is cached by the raw localStorage string.
 */
export function getActiveKeybindings(): KeybindingMap {
  if (suspended > 0) {
    suspendedMap ??= Object.fromEntries(
      Object.keys(resolveKeybindings({})).map((id) => [id, null]),
    ) as KeybindingMap;
    return suspendedMap;
  }
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SETTINGS_KEY);
  } catch {
    raw = null;
  }
  if (cachedMap && raw === cachedRaw) return cachedMap;
  let overrides = {};
  try {
    overrides = keybindingOverridesFromStoredSettings(JSON.parse(raw ?? "{}"));
  } catch {
    overrides = {};
  }
  cachedMap = resolveKeybindings(overrides);
  cachedRaw = raw;
  return cachedMap;
}
