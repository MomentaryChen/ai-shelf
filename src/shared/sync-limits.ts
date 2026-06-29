import type { SyncBundle } from "./sync-types.js";

/**
 * Firebase Spark free-tier reference (per project).
 * @see https://firebase.google.com/pricing
 */
export const SPARK_FIRESTORE_DOC_BYTES = 1_048_576;
export const SPARK_FIRESTORE_DAILY_WRITES = 20_000;
export const SPARK_FIRESTORE_DAILY_READS = 50_000;

/** Keep sync usage within ~80% of Spark free-tier capacity. */
export const FREE_TIER_HEADROOM_RATIO = 0.8;

/** Max Google accounts that may register for cloud sync on this Firebase project. */
export const MAX_SYNC_REGISTERED_USERS = 300;

/** 80% of Firestore 1 MiB document limit (metadata headroom included). */
export const MAX_SYNC_BUNDLE_BYTES = Math.floor(SPARK_FIRESTORE_DOC_BYTES * FREE_TIER_HEADROOM_RATIO);

/** 80% of a practical per-user daily sync budget (30 → 24). */
export const MAX_SYNC_OPS_PER_DAY = Math.floor(30 * FREE_TIER_HEADROOM_RATIO);

/**
 * Minimum interval between syncs. Derived from spreading the per-user daily cap
 * across waking hours at 80% headroom (~16 h / 24 ops ≈ 40 min → 80% ≈ 48 min).
 * Rounded to 3 minutes for responsive manual retries while limiting churn.
 */
export const MIN_SYNC_INTERVAL_MS = 180_000;

export const MAX_SYNC_WORKSPACES = 8;
export const MAX_SYNC_PROFILES = 40;
export const MAX_SYNC_LAYOUTS = 40;
export const MAX_SYNC_PANES_PER_LAYOUT = 8;

export type SyncLimitCode =
  | "bundle_too_large"
  | "too_many_workspaces"
  | "too_many_profiles"
  | "too_many_layouts"
  | "too_many_panes"
  | "rate_limited"
  | "daily_limit_reached"
  | "user_cap_reached";

export interface SyncLimitDetail {
  bytes?: number;
  maxBytes?: number;
  count?: number;
  maxCount?: number;
  profileId?: string;
  waitSeconds?: number;
  maxOpsPerDay?: number;
  maxUsers?: number;
}

export type SyncLimitResult =
  | { ok: true }
  | { ok: false; code: SyncLimitCode; detail?: SyncLimitDetail };

export interface SyncDailyMeta {
  syncDay: string | null;
  syncCountToday: number;
}

const SYNC_LIMIT_PREFIX = "sync_limit:";

export function estimateSyncBundleBytes(bundle: SyncBundle): number {
  return new TextEncoder().encode(JSON.stringify(bundle)).length;
}

export function validateSyncBundle(bundle: SyncBundle): SyncLimitResult {
  if (bundle.profileGroups.length > MAX_SYNC_WORKSPACES) {
    return {
      ok: false,
      code: "too_many_workspaces",
      detail: { count: bundle.profileGroups.length, maxCount: MAX_SYNC_WORKSPACES },
    };
  }

  if (bundle.profiles.length > MAX_SYNC_PROFILES) {
    return {
      ok: false,
      code: "too_many_profiles",
      detail: { count: bundle.profiles.length, maxCount: MAX_SYNC_PROFILES },
    };
  }

  if (bundle.layouts.length > MAX_SYNC_LAYOUTS) {
    return {
      ok: false,
      code: "too_many_layouts",
      detail: { count: bundle.layouts.length, maxCount: MAX_SYNC_LAYOUTS },
    };
  }

  for (const layout of bundle.layouts) {
    const paneCount = layout.snapshot.panes?.length ?? 0;
    if (paneCount > MAX_SYNC_PANES_PER_LAYOUT) {
      return {
        ok: false,
        code: "too_many_panes",
        detail: {
          count: paneCount,
          maxCount: MAX_SYNC_PANES_PER_LAYOUT,
          profileId: layout.profileId,
        },
      };
    }
  }

  const bytes = estimateSyncBundleBytes(bundle);
  if (bytes > MAX_SYNC_BUNDLE_BYTES) {
    return {
      ok: false,
      code: "bundle_too_large",
      detail: { bytes, maxBytes: MAX_SYNC_BUNDLE_BYTES },
    };
  }

  return { ok: true };
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function checkSyncRateLimit(lastSyncAt: string | null, now = Date.now()): SyncLimitResult {
  if (!lastSyncAt) return { ok: true };
  const elapsed = now - new Date(lastSyncAt).getTime();
  if (elapsed >= MIN_SYNC_INTERVAL_MS) return { ok: true };
  const waitSeconds = Math.ceil((MIN_SYNC_INTERVAL_MS - elapsed) / 1000);
  return { ok: false, code: "rate_limited", detail: { waitSeconds } };
}

export function checkSyncDailyLimit(meta: SyncDailyMeta, now = new Date()): SyncLimitResult {
  const today = utcDayKey(now);
  const count = meta.syncDay === today ? meta.syncCountToday : 0;
  if (count < MAX_SYNC_OPS_PER_DAY) return { ok: true };
  return {
    ok: false,
    code: "daily_limit_reached",
    detail: { count, maxCount: MAX_SYNC_OPS_PER_DAY, maxOpsPerDay: MAX_SYNC_OPS_PER_DAY },
  };
}

export function nextSyncDailyMeta(meta: SyncDailyMeta, now = new Date()): SyncDailyMeta {
  const today = utcDayKey(now);
  if (meta.syncDay !== today) {
    return { syncDay: today, syncCountToday: 1 };
  }
  return { syncDay: today, syncCountToday: meta.syncCountToday + 1 };
}

export function encodeSyncLimitError(code: SyncLimitCode, detail?: SyncLimitDetail): string {
  return detail ? `${SYNC_LIMIT_PREFIX}${code}:${JSON.stringify(detail)}` : `${SYNC_LIMIT_PREFIX}${code}`;
}

export function parseSyncLimitError(
  error: string,
): { code: SyncLimitCode; detail?: SyncLimitDetail } | null {
  if (!error.startsWith(SYNC_LIMIT_PREFIX)) return null;
  const body = error.slice(SYNC_LIMIT_PREFIX.length);
  const colon = body.indexOf(":");
  if (colon === -1) {
    return { code: body as SyncLimitCode };
  }
  const code = body.slice(0, colon) as SyncLimitCode;
  try {
    const detail = JSON.parse(body.slice(colon + 1)) as SyncLimitDetail;
    return { code, detail };
  } catch {
    return { code };
  }
}

export function formatByteCount(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
