import { useState, type ReactNode } from "react";
import { Check, Cloud, Loader2, LogIn } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "../i18n/LocaleProvider";
import type { AuthErrorReason } from "../firebase/auth-errors";
import { useAuthSession } from "../hooks/useAuthSession";
import { useCloudSync } from "../hooks/useCloudSync";
import type { MessageKey } from "../i18n/messages/en";
import { formatSyncDateTime } from "../utils/format-sync-time.js";

const AUTH_ERROR_KEYS: Partial<Record<AuthErrorReason, MessageKey>> = {
  "not_configured": "settings.accountNotConfigured",
  "configuration-not-found": "settings.accountAuthNotEnabled",
  "network-request-failed": "settings.accountAuthNetworkFailed",
  "unauthorized-domain": "settings.accountAuthUnauthorizedDomain",
  "invalid-api-key": "settings.accountAuthInvalidApiKey",
  "internal-error": "settings.accountAuthInternalError",
};

function authErrorMessage(
  t: (key: MessageKey, vars?: Record<string, string>) => string,
  reason: AuthErrorReason,
  detail?: string | null,
): string {
  const key = AUTH_ERROR_KEYS[reason];
  if (key) return t(key);
  return t("settings.accountSignInFailed", { error: detail ?? reason });
}

function AccountAvatar({
  name,
  photoURL,
}: {
  name: string;
  photoURL?: string | null;
}) {
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt=""
        className="size-8 shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chrome-hover text-xs font-medium text-chrome-text">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function AccountRowContent({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-chrome-text">{title}</div>
        {subtitle ? (
          <div className="truncate text-xs text-chrome-text-muted">{subtitle}</div>
        ) : null}
      </div>
      {trailing}
    </>
  );
}

function SyncStatusIcon({ syncing, synced }: { syncing: boolean; synced: boolean }) {
  if (syncing) {
    return (
      <Loader2
        className="mt-0.5 size-3.5 shrink-0 animate-spin text-chrome-text-muted"
        aria-hidden
      />
    );
  }
  if (synced) {
    return <Check className="mt-0.5 size-3.5 shrink-0 text-chrome-ui-accent" aria-hidden />;
  }
  return <Cloud className="mt-0.5 size-3.5 shrink-0 text-chrome-text-faint" aria-hidden />;
}

export function AccountSidebar({ collapsed }: { collapsed: boolean }) {
  const { t, locale } = useLocale();
  const { state, busy, authError, signIn, signOut } = useAuthSession();
  const { status: syncStatus, runSync } = useCloudSync();
  const [syncBusy, setSyncBusy] = useState(false);

  if (!state.configured) return null;

  const syncing = syncBusy || syncStatus.syncing;
  const lastSyncText =
    syncStatus.lastSyncAt != null
      ? t("settings.accountLastSync", {
          time: formatSyncDateTime(syncStatus.lastSyncAt, locale),
        })
      : t("settings.accountNeverSynced");

  async function handleSyncNow() {
    setSyncBusy(true);
    try {
      await runSync();
    } finally {
      setSyncBusy(false);
    }
  }

  const signInError =
    authError && !state.signedIn
      ? authErrorMessage(t, authError.reason, authError.detail)
      : null;

  const rowClass = (extra?: string) =>
    `flex w-full items-center rounded-lg px-2.5 py-2 text-sm transition-all duration-200 hover:bg-chrome-hover disabled:opacity-60 ${
      collapsed ? "justify-center px-0" : "gap-2.5"
    }${extra ? ` ${extra}` : ""}`;

  if (!state.signedIn || !state.user) {
    const title = busy ? t("settings.accountSigningIn") : t("settings.accountSignInGoogle");
    const subtitle = signInError ?? t("sidebar.accountSignInSubtitle");
    const tooltip = signInError ?? `${title}\n${subtitle}`;

    return (
      <button
        type="button"
        className={rowClass(signInError ? "text-fail" : undefined)}
        disabled={busy}
        onClick={() => void signIn()}
        title={collapsed ? tooltip : undefined}
      >
        {busy ? (
          <Loader2 className="size-8 shrink-0 animate-spin text-chrome-text-muted" />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chrome-hover text-chrome-text-muted">
            <LogIn className="size-4" />
          </span>
        )}
        {!collapsed && (
          <AccountRowContent
            title={title}
            subtitle={subtitle}
            trailing={<Cloud className="size-3.5 shrink-0 text-chrome-text-muted" aria-hidden />}
          />
        )}
      </button>
    );
  }

  const displayName = state.user.displayName ?? state.user.email ?? state.user.uid;
  const syncLabel = syncing ? t("settings.accountSyncing") : t("settings.accountSyncNow");
  const outerSubtitle =
    state.user.email && state.user.email !== displayName ? state.user.email : "";
  const collapsedTitle = outerSubtitle ? `${displayName}\n${outerSubtitle}` : displayName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={rowClass()}
          disabled={busy}
          title={collapsed ? collapsedTitle : undefined}
        >
          <AccountAvatar name={displayName} photoURL={state.user.photoURL} />
          {!collapsed && (
            <AccountRowContent
              title={displayName}
              subtitle={outerSubtitle}
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align={collapsed ? "center" : "end"}
        sideOffset={8}
        className="min-w-[240px]"
      >
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm text-text-primary">{displayName}</p>
          {state.user.displayName && state.user.email ? (
            <p className="truncate text-[11px] font-normal text-text-tertiary">{state.user.email}</p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex items-start gap-2 px-2 py-1.5">
          <SyncStatusIcon syncing={syncing} synced={syncStatus.lastSyncAt != null} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-snug text-chrome-text-subtle">{lastSyncText}</p>
            <p className="mt-1 text-[10px] leading-snug text-chrome-text-faint">
              {t("settings.accountSyncLimitation")}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy || syncing} onSelect={() => void handleSyncNow()}>
          {syncing ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {syncLabel}
        </DropdownMenuItem>
        {syncStatus.lastError ? (
          <p className="px-2 pb-1 text-[10px] leading-snug text-fail">
            {t("settings.accountSyncFailed", { error: syncStatus.lastError })}
          </p>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => void signOut()}>
          {t("settings.accountSignOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
