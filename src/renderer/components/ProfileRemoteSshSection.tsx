import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RemoteSshDraft, RemoteSshField } from "../utils/remote-ssh";

interface Props {
  value: RemoteSshDraft;
  onChange: (next: RemoteSshDraft) => void;
  invalidField: RemoteSshField | null;
  disabled?: boolean;
}

const INPUT_CLASS =
  "border-chrome-border-subtle bg-chrome-bg text-[13px] text-chrome-text placeholder:text-chrome-text-dim focus-visible:border-chrome-border-hover";

const INVALID_KEY: Record<RemoteSshField, MessageKey> = {
  host: "profile.remote.invalid.host",
  user: "profile.remote.invalid.user",
  port: "profile.remote.invalid.port",
  jump: "profile.remote.invalid.jump",
  cwd: "profile.remote.invalid.cwd",
};

/** Profile settings block: run every pane of the profile over the local ssh client. */
export function ProfileRemoteSshSection({ value, onChange, invalidField, disabled = false }: Props) {
  const { t } = useLocale();
  const [client, setClient] = useState<{ found: boolean; path: string | null } | null>(null);

  useEffect(() => {
    if (!value.enabled || client) return;
    let cancelled = false;
    window.api
      .sshClientStatus?.()
      .then((r) => {
        if (!cancelled) setClient(r);
      })
      .catch(() => {
        if (!cancelled) setClient({ found: false, path: null });
      });
    return () => {
      cancelled = true;
    };
  }, [value.enabled, client]);

  const set = (patch: Partial<RemoteSshDraft>) => onChange({ ...value, ...patch });
  const field = (
    key: RemoteSshField,
    label: MessageKey,
    placeholder: MessageKey | null,
    extra?: { inputMode?: "numeric" },
  ) => (
    <Label className="mb-2 block">
      <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">{t(label)}</span>
      <Input
        value={value[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        placeholder={placeholder ? t(placeholder) : undefined}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        aria-invalid={invalidField === key}
        inputMode={extra?.inputMode}
        className={`${INPUT_CLASS} font-mono ${invalidField === key ? "border-fail" : ""}`}
      />
    </Label>
  );

  return (
    <div
      role="tabpanel"
      id="profile-tabpanel-remote"
      aria-labelledby="profile-tab-remote"
      className="mb-4"
    >
      <Label className="mb-2 flex cursor-pointer items-center gap-2 text-[13px] font-normal text-chrome-text-secondary">
        <Checkbox
          checked={value.enabled}
          onCheckedChange={(v) => set({ enabled: v === true })}
          disabled={disabled}
        />
        {t("profile.remote.enable")}
      </Label>
      <p className="mb-2 text-[10px] font-normal text-chrome-text-dim">{t("profile.remote.hint")}</p>

      {value.enabled ? (
        <>
          {client && !client.found ? (
            <p className="mb-2 rounded-md border border-fail/40 bg-fail/10 px-2 py-1.5 text-[11px] text-fail">
              {t("profile.remote.sshMissing")}
            </p>
          ) : null}
          {client?.found && client.path ? (
            <p className="mb-2 truncate font-mono text-[10px] text-chrome-text-dim" title={client.path}>
              {t("profile.remote.sshFound", { path: client.path })}
            </p>
          ) : null}
          {field("host", "profile.remote.host", "profile.remote.hostPlaceholder")}
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              {field("user", "profile.remote.user", "profile.remote.userPlaceholder")}
            </div>
            <div className="w-20 shrink-0">
              {field("port", "profile.remote.port", null, { inputMode: "numeric" })}
            </div>
          </div>
          {field("jump", "profile.remote.jump", "profile.remote.jumpPlaceholder")}
          {field("cwd", "profile.remote.cwd", "profile.remote.cwdPlaceholder")}
          {invalidField ? (
            <p className="mb-1 text-[11px] text-fail">{t(INVALID_KEY[invalidField])}</p>
          ) : null}
          <p className="text-[10px] text-chrome-text-dim">{t("profile.remote.appliesOnRestart")}</p>
        </>
      ) : null}
    </div>
  );
}
