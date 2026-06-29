import {
  formatByteCount,
  MAX_SYNC_BUNDLE_BYTES,
  MAX_SYNC_REGISTERED_USERS,
  MAX_SYNC_OPS_PER_DAY,
  MAX_SYNC_PANES_PER_LAYOUT,
  MAX_SYNC_PROFILES,
  MAX_SYNC_WORKSPACES,
  MIN_SYNC_INTERVAL_MS,
  parseSyncLimitError,
  type SyncLimitCode,
  type SyncLimitDetail,
} from "../../shared/sync-limits.js";
import type { MessageKey } from "../i18n/messages/en.js";
import { getStoredT } from "../i18n/stored-locale.js";

const LIMIT_MESSAGE_KEYS: Record<SyncLimitCode, MessageKey> = {
  bundle_too_large: "settings.accountSyncLimitBundleTooLarge",
  too_many_workspaces: "settings.accountSyncLimitTooManyWorkspaces",
  too_many_profiles: "settings.accountSyncLimitTooManyProfiles",
  too_many_layouts: "settings.accountSyncLimitTooManyLayouts",
  too_many_panes: "settings.accountSyncLimitTooManyPanes",
  rate_limited: "settings.accountSyncLimitRateLimited",
  daily_limit_reached: "settings.accountSyncLimitDailyReached",
  user_cap_reached: "settings.accountSyncLimitUserCapReached",
};

type TranslateFn = (key: MessageKey, params?: Record<string, string | number>) => string;

function formatLimitParams(
  code: SyncLimitCode,
  detail: SyncLimitDetail | undefined,
): Record<string, string | number> {
  switch (code) {
    case "bundle_too_large":
      return {
        size: formatByteCount(detail?.bytes ?? 0),
        max: formatByteCount(detail?.maxBytes ?? MAX_SYNC_BUNDLE_BYTES),
      };
    case "too_many_workspaces":
    case "too_many_profiles":
    case "too_many_layouts":
      return { count: detail?.count ?? 0, max: detail?.maxCount ?? 0 };
    case "too_many_panes":
      return {
        profileId: detail?.profileId ?? "?",
        count: detail?.count ?? 0,
        max: detail?.maxCount ?? MAX_SYNC_PANES_PER_LAYOUT,
      };
    case "rate_limited":
      return { seconds: detail?.waitSeconds ?? 0 };
    case "daily_limit_reached":
      return { max: detail?.maxOpsPerDay ?? MAX_SYNC_OPS_PER_DAY };
    case "user_cap_reached":
      return { max: detail?.maxUsers ?? MAX_SYNC_REGISTERED_USERS };
    default:
      return {};
  }
}

export function formatSyncError(error: string, t: TranslateFn): string {
  const parsed = parseSyncLimitError(error);
  if (!parsed) return error;
  const key = LIMIT_MESSAGE_KEYS[parsed.code];
  return t(key, formatLimitParams(parsed.code, parsed.detail));
}

export function formatStoredSyncLimitError(error: string): string {
  return formatSyncError(error, (key, params) => getStoredT(key, params));
}

export function syncLimitsSummary(t: TranslateFn): string {
  const intervalMinutes = Math.round(MIN_SYNC_INTERVAL_MS / 60_000);
  return t("settings.accountSyncLimits", {
    workspaces: MAX_SYNC_WORKSPACES,
    profiles: MAX_SYNC_PROFILES,
    panes: MAX_SYNC_PANES_PER_LAYOUT,
    size: formatByteCount(MAX_SYNC_BUNDLE_BYTES),
    dailyOps: MAX_SYNC_OPS_PER_DAY,
    intervalMinutes,
    maxUsers: MAX_SYNC_REGISTERED_USERS,
  });
}
