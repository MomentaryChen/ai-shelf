import type { Terminal } from "@xterm/xterm";

/** Same cap as user pane titles (`normalizePaneTitle`). */
const MAX_AUTO_TITLE_LEN = 64;

/**
 * Turn a raw OSC 0 / 2 window title into a pane auto-title, or "" when it
 * carries nothing worth showing (clears the auto-title).
 *
 * - Leading status glyphs are stripped: Claude Code prefixes its title with a
 *   spinner / ✳ that changes many times a second; keeping it would re-render
 *   the pane header on every frame.
 * - Executable paths are dropped: ConPTY reports the console title
 *   (`C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe`) when a shell starts.
 */
export function normalizeTerminalTitle(raw: string): string {
  const clean = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\.exe\b/i.test(clean)) return "";
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)\S*$/.test(clean)) return "";
  const text = clean.replace(/^[^\p{L}\p{N}]+/u, "");
  return text.slice(0, MAX_AUTO_TITLE_LEN).trim();
}

/**
 * Listen for OSC 0 / 2 title changes (xterm parses both into `onTitleChange`).
 * Reports only when the normalized title changes. Returns a dispose function.
 */
export function bindTerminalTitle(term: Terminal, onTitle: (title: string) => void): () => void {
  let last = "";
  const sub = term.onTitleChange((raw) => {
    const title = normalizeTerminalTitle(raw);
    if (title === last) return;
    last = title;
    onTitle(title);
  });
  return () => sub.dispose();
}
