import { useEffect, useState } from "react";

/**
 * Change-review counts per pane (`sessionId` + cwd). Every list call hashes
 * changed files in main, so the status bar refreshes slowly: on mount, on
 * window focus, once a minute while visible, and whenever the review dialog
 * reports a fresh list.
 */
const REFRESH_INTERVAL_MS = 60_000;
const FRESH_MS = 5_000;

type Entry = { count: number | null; at: number };

const cache = new Map<string, Entry>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
const ensured = new Set<string>();

function keyOf(sessionId: string, cwd: string): string {
  return `${sessionId}\0${cwd.trim()}`;
}

function emit() {
  for (const fn of listeners) fn();
}

/**
 * Take the pane's baseline as soon as it is known to be in a git repo, so
 * later edits by the agent are measured from pane start. Idempotent in main;
 * deduped here to avoid an IPC per render.
 */
export function ensureChangeBaseline(sessionId: string, cwd: string): void {
  if (!sessionId || !cwd.trim() || !window.api?.gitChangeReviewEnsure) return;
  const key = keyOf(sessionId, cwd);
  if (ensured.has(key)) return;
  ensured.add(key);
  void window.api.gitChangeReviewEnsure({ sessionId, cwd: cwd.trim() }).catch(() => {
    ensured.delete(key);
  });
}

/** Record a count the dialog already has, so the chip does not re-run git. */
export function setChangeReviewCount(sessionId: string, cwd: string, count: number | null): void {
  cache.set(keyOf(sessionId, cwd), { count, at: Date.now() });
  emit();
}

function refresh(sessionId: string, cwd: string, maxAgeMs = FRESH_MS): void {
  const key = keyOf(sessionId, cwd);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return;
  if (inflight.has(key) || !window.api?.gitChangeReviewList) return;
  inflight.add(key);
  void window.api
    .gitChangeReviewList({ sessionId, cwd: cwd.trim() })
    .then((r) => (r.ok ? r.files.length : null))
    .catch(() => null)
    .then((count) => {
      cache.set(key, { count, at: Date.now() });
      emit();
    })
    .finally(() => inflight.delete(key));
}

/** Number of files changed since the pane's baseline; null while unknown or unavailable. */
export function useChangeReviewCount(
  sessionId: string | undefined,
  cwd: string | undefined,
  enabled: boolean,
): number | null {
  const sid = sessionId ?? "";
  const dir = cwd?.trim() ?? "";
  const active = enabled && !!sid && !!dir;
  const key = active ? keyOf(sid, dir) : "";
  const [count, setCount] = useState<number | null>(() => (key ? (cache.get(key)?.count ?? null) : null));

  useEffect(() => {
    if (!active) {
      setCount(null);
      return;
    }
    const sync = () => setCount(cache.get(key)?.count ?? null);
    listeners.add(sync);
    sync();
    refresh(sid, dir);
    const onFocus = () => refresh(sid, dir);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh(sid, dir, REFRESH_INTERVAL_MS - 1_000);
    }, REFRESH_INTERVAL_MS);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [active, key, sid, dir]);

  return count;
}
