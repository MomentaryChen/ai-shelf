/**
 * Files dragged from the OS file manager onto a terminal pane: paste their
 * paths into the PTY. Pure (no DOM / Electron) so the quoting is unit tested.
 */

/**
 * Whether a drag carries OS files and nothing of ours. Pane reorder and sidebar
 * profile drags use custom MIME types and must keep their own handlers.
 */
export function isOsFileDrag(types: readonly string[]): boolean {
  if (!types.includes("Files")) return false;
  return !types.some((t) => t.startsWith("application/x-ai-shelf"));
}

function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** Characters that split or change a word in cmd / PowerShell. */
const WINDOWS_NEEDS_QUOTE = /[\s&()^;,'`$%!{}[\]=+~@#]/;
/** Anything outside a conservative "plain word" set in POSIX shells. */
const POSIX_NEEDS_QUOTE = /[^A-Za-z0-9_\-.,/:@%+=]/;

/**
 * Quote a path so the shell sees one argument. Windows paths use double quotes
 * (cmd and PowerShell both accept them, and `"` cannot occur in a Windows
 * path); POSIX paths use single quotes with `'\''` for embedded quotes.
 */
export function quotePathForShell(path: string): string {
  if (!path) return path;
  if (isWindowsPath(path)) {
    return WINDOWS_NEEDS_QUOTE.test(path) ? `"${path}"` : path;
  }
  if (!POSIX_NEEDS_QUOTE.test(path)) return path;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/** Text to paste for dropped paths: each quoted when needed, space-separated. */
export function formatDroppedPaths(paths: readonly string[]): string {
  return paths
    .filter((p) => p.length > 0)
    .map(quotePathForShell)
    .join(" ");
}
