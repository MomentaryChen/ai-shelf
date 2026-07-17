import type { Terminal } from "@xterm/xterm";
import { parseOsc7Payload } from "../../shared/osc7.js";
import { installPlatform } from "../utils/install-platform.js";

/**
 * Listen for OSC 7 (cwd reports from shell integration / prompt themes).
 * Returns a dispose function.
 */
export function bindTerminalCwd(
  term: Terminal,
  onCwd: (cwd: string) => void,
): () => void {
  let last = "";
  const osc7 = term.parser.registerOscHandler(7, (data) => {
    const cwd = parseOsc7Payload(data, installPlatform());
    if (cwd && cwd !== last) {
      last = cwd;
      onCwd(cwd);
    }
    // Consume the sequence so it never leaks into the buffer as text.
    return true;
  });

  return () => {
    osc7.dispose();
  };
}
