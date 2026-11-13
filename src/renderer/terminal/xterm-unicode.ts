import { Unicode11Addon } from "@xterm/addon-unicode11";
import type { Terminal } from "@xterm/xterm";

/**
 * Unicode 11 width tables: emoji and newer wide glyphs take two cells, matching
 * what modern CLIs (Claude Code, Codex, Ink) assume. Without it xterm's default
 * Unicode 6 table draws them one cell wide and the rest of the row shifts left.
 *
 * `term.unicode` is proposed API, so the terminal needs `allowProposedApi: true`.
 * Call before any output is written so the backlog replay is measured with the
 * same table as live output. IME anchoring reads buffer columns, so it follows
 * the active table automatically.
 */
export function attachUnicode11(term: Terminal): void {
  try {
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
  } catch (err) {
    // Fall back to xterm's built-in Unicode 6 widths.
    console.warn("[xterm-unicode] unicode11 unavailable", err);
  }
}
