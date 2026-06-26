import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "../i18n/LocaleProvider";
import { useAuthSession } from "../hooks/useAuthSession";
import { useCloudSync } from "../hooks/useCloudSync";

interface AccountPanelProps {
  compact?: boolean;
}

export function AccountPanel({ compact = false }: AccountPanelProps) {
  const { t } = useLocale();
  const { state, busy, error, signIn, signOut } = useAuthSession();
  const { status: syncStatus, runSync } = useCloudSync();
  const [syncBusy, setSyncBusy] = useState(false);

  const sectionTitle = compact
    ? "mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
    : "mb-2.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary";

  async function handleSyncNow() {
    setSyncBusy(true);
    try {
      await runSync();
    } finally {
      setSyncBusy(false);
    }
  }

  if (!state.configured) {
    return (
      <div>
        <p className={sectionTitle}>{t("settings.account")}</p>
        <p className="text-[11px] leading-snug text-text-tertiary">{t("settings.accountNotConfigured")}</p>
      </div>
    );
  }

  const syncLabel = syncBusy || syncStatus.syncing ? t("settings.accountSyncing") : t("settings.accountSyncNow");
  const lastSyncText =
    syncStatus.lastSyncAt != null
      ? t("settings.accountLastSync", {
          time: new Date(syncStatus.lastSyncAt).toLocaleString(),
        })
      : t("settings.accountNeverSynced");

  return (
    <div>
      <p className={sectionTitle}>{t("settings.account")}</p>
      <p className="mb-3 text-[11px] leading-snug text-text-tertiary">{t("settings.accountHint")}</p>

      {state.signedIn && state.user ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            {state.user.photoURL ? (
              <img
                src={state.user.photoURL}
                alt=""
                className="size-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-surface-raised text-xs text-text-secondary">
                {(state.user.displayName ?? state.user.email ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text-primary">
                {state.user.displayName ?? state.user.email ?? state.user.uid}
              </p>
              {state.user.displayName && state.user.email ? (
                <p className="truncate text-[11px] text-text-tertiary">{state.user.email}</p>
              ) : null}
            </div>
          </div>
          <p className="text-[11px] text-text-tertiary">{lastSyncText}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || syncBusy || syncStatus.syncing}
              onClick={() => void handleSyncNow()}
            >
              {syncLabel}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void signOut()}>
              {busy ? "…" : t("settings.accountSignOut")}
            </Button>
          </div>
          {syncStatus.lastError ? (
            <p className="text-[11px] leading-snug text-fail">
              {t("settings.accountSyncFailed", { error: syncStatus.lastError })}
            </p>
          ) : null}
        </div>
      ) : (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void signIn()}>
          {busy ? "…" : t("settings.accountSignInGoogle")}
        </Button>
      )}

      {error ? (
        <p className="mt-2 text-[11px] leading-snug text-fail">
          {error === "not_configured" ? t("settings.accountNotConfigured") : t("settings.accountSignInFailed", { error })}
        </p>
      ) : null}
    </div>
  );
}
