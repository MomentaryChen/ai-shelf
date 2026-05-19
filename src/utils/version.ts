/** Extract semver from CLI `--version` output (e.g. `2.1.144 (Claude Code)` → `2.1.144`). */
export function parseCliVersionLine(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
  return match ? match[1] : trimmed;
}

/** Compare version strings after normalizing CLI/npm output. */
export function versionsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  return parseCliVersionLine(a) === parseCliVersionLine(b);
}