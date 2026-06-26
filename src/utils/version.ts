/** Extract semver from CLI `--version` output (e.g. `2.1.144 (Claude Code)` → `2.1.144`). */
export function parseCliVersionLine(line: string): string {
  const trimmed = line.trim();
  const match = trimmed.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
  return match?.[1] ?? trimmed;
}

/** Compare version strings after normalizing CLI/npm output. */
export function versionsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  return parseCliVersionLine(a) === parseCliVersionLine(b);
}

function splitCoreAndPrerelease(v: string): { core: number[]; prerelease: string | null } {
  const normalized = parseCliVersionLine(v).replace(/^v/i, "");
  const dash = normalized.indexOf("-");
  const coreStr = dash === -1 ? normalized : normalized.slice(0, dash);
  const prerelease = dash === -1 ? null : normalized.slice(dash + 1);
  const core = coreStr.split(".").map((p) => Number(p) || 0);
  return { core, prerelease };
}

function compareCore(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

/** True when `current` is strictly older than `latest` (semver-ish, prerelease aware). */
export function isVersionOlder(
  current: string | null | undefined,
  latest: string | null | undefined,
): boolean {
  if (current == null || latest == null) return false;
  if (versionsEqual(current, latest)) return false;

  const cur = splitCoreAndPrerelease(current);
  const lat = splitCoreAndPrerelease(latest);
  const coreCmp = compareCore(cur.core, lat.core);
  if (coreCmp < 0) return true;
  if (coreCmp > 0) return false;

  // Same core: stable (no prerelease) is not older than a prerelease latest.
  if (!cur.prerelease && lat.prerelease) return false;
  if (cur.prerelease && !lat.prerelease) return true;
  if (cur.prerelease && lat.prerelease) return cur.prerelease < lat.prerelease;
  return false;
}
