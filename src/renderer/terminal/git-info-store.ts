import { useEffect, useState } from "react";
import type { GitCwdInfo } from "../../shared/git-worktree.js";

/** Background refresh cadence while a cwd is on screen. */
const REFRESH_INTERVAL_MS = 15_000;
/** Focus / remount refreshes reuse anything newer than this. */
const FRESH_MS = 3_000;

type Entry = { info: GitCwdInfo | null; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Ask main for git info unless a fresh answer is cached or already on the way. */
export function refreshGitInfo(cwd: string, maxAgeMs = FRESH_MS): void {
  const key = cwd.trim();
  if (!key || !window.api?.gitCwdInfo) return;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return;
  if (inflight.has(key)) return;
  const job = window.api
    .gitCwdInfo(key)
    .catch(() => null)
    .then((info) => {
      cache.set(key, { info, at: Date.now() });
      emit();
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, job);
}

/** Drop cached answers (e.g. right after `git worktree add`). */
export function invalidateGitInfo(): void {
  cache.clear();
  emit();
}

/**
 * Git branch / worktree / dirty info for a pane cwd. Refreshes on cwd change,
 * window focus, and a slow interval while the window is visible. Never blocks:
 * returns the last known value (or null) until main answers.
 */
export function usePaneGitInfo(cwd: string | undefined | null): GitCwdInfo | null {
  const key = cwd?.trim() ?? "";
  const [info, setInfo] = useState<GitCwdInfo | null>(() => cache.get(key)?.info ?? null);

  useEffect(() => {
    if (!key) {
      setInfo(null);
      return;
    }
    const sync = () => setInfo(cache.get(key)?.info ?? null);
    listeners.add(sync);
    sync();
    refreshGitInfo(key);

    const onFocus = () => refreshGitInfo(key);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshGitInfo(key, REFRESH_INTERVAL_MS - 1_000);
    }, REFRESH_INTERVAL_MS);

    return () => {
      listeners.delete(sync);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [key]);

  return info;
}
