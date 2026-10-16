import { useEffect, useState } from "react";
import { subscribeSettingsChanges } from "../chat-settings";
import { getActiveKeybindings } from "../shortcuts/active-keybindings";
import type { KeybindingMap } from "../shortcuts/keybindings";

/** Resolved keybindings; re-renders when settings change (this or another window). */
export function useKeybindings(): KeybindingMap {
  const [map, setMap] = useState(getActiveKeybindings);
  useEffect(() => subscribeSettingsChanges(() => setMap(getActiveKeybindings())), []);
  return map;
}
