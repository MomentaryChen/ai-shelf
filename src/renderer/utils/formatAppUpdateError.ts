import type { MessageKey } from "../i18n/messages/en";

/** Map long electron-updater / SignTool dumps to a short user-facing message key. */
export function resolveAppUpdateErrorKey(raw: string | null): MessageKey {
  if (!raw?.trim()) return "appUpdate.errorDefault";
  const msg = raw.trim();
  if (
    msg.includes("ERR_UPDATER_INVALID_SIGNATURE") ||
    msg.includes("not signed by the application owner") ||
    msg.includes("publisherNames:") ||
    msg.includes("Sign verification failed")
  ) {
    return "appUpdate.errorSignature";
  }
  return "appUpdate.errorDefault";
}

export function shortenAppUpdateErrorDetail(raw: string | null, maxLen = 280): string | null {
  if (!raw?.trim()) return null;
  const msg = raw.trim();
  if (msg.length <= maxLen) return msg;
  return `${msg.slice(0, maxLen)}…`;
}
