/**
 * "Updated to vX" notice shown once after a desktop update relaunches the app.
 * The last version the user has seen is remembered per machine; a first launch
 * (nothing stored yet) records the version silently instead of announcing it.
 */

const STORAGE_KEY = "ai-shelf-last-seen-version";

export const RELEASES_URL = "https://github.com/MomentaryChen/ai-shelf/releases";

export function releaseNotesUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${version}`;
}

/** Version to announce, or null when there is nothing new to say. */
export function resolveUpdatedNotice(
  lastSeen: string | null,
  current: string | null,
): string | null {
  const cur = current?.trim();
  if (!cur || cur === "unknown" || cur === "0.0.0") return null;
  const prev = lastSeen?.trim();
  if (!prev) return null;
  return prev === cur ? null : cur;
}

export function readLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLastSeenVersion(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, version);
  } catch {
    /* storage unavailable — the notice may repeat, which is harmless */
  }
}
