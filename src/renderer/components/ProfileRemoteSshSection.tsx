import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_SSH_JUMP_HOSTS,
  emptyHopDraft,
  hopDraftLabel,
  type RemoteSshDraft,
  type RemoteSshField,
  type RemoteSshInvalid,
  type SshHopDraft,
  type SshHopField,
} from "../utils/remote-ssh";

interface Props {
  value: RemoteSshDraft;
  onChange: (next: RemoteSshDraft) => void;
  invalid: RemoteSshInvalid | null;
  disabled?: boolean;
}

const INPUT_CLASS =
  "border-chrome-border-subtle bg-chrome-bg text-[13px] text-chrome-text placeholder:text-chrome-text-dim focus-visible:border-chrome-border-hover";

const SMALL_BUTTON =
  "shrink-0 cursor-pointer rounded-md border border-chrome-border-strong px-2 py-1 text-[11px] text-chrome-text-secondary hover:border-chrome-border-hover disabled:cursor-default disabled:opacity-40";

const INVALID_KEY: Record<RemoteSshField, MessageKey> = {
  host: "profile.remote.invalid.host",
  user: "profile.remote.invalid.user",
  port: "profile.remote.invalid.port",
  cwd: "profile.remote.invalid.cwd",
  identityFile: "profile.remote.invalid.identityFile",
};

/** Host / user / port / private key for one endpoint (target or jump host). */
function HopFields({
  hop,
  onChange,
  invalidField,
  disabled,
  hostPlaceholder,
}: {
  hop: SshHopDraft;
  onChange: (next: SshHopDraft) => void;
  invalidField: SshHopField | null;
  disabled: boolean;
  hostPlaceholder: MessageKey;
}) {
  const { t } = useLocale();
  const set = (patch: Partial<SshHopDraft>) => onChange({ ...hop, ...patch });
  const input = (field: Exclude<SshHopField, "identityFile">, placeholder: string | undefined, numeric = false) => (
    <Input
      value={hop[field]}
      onChange={(e) => set({ [field]: e.target.value })}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      autoCapitalize="off"
      aria-invalid={invalidField === field}
      inputMode={numeric ? "numeric" : undefined}
      className={`${INPUT_CLASS} font-mono ${invalidField === field ? "border-fail" : ""}`}
    />
  );
  return (
    <>
      <Label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">
          {t("profile.remote.host")}
        </span>
        {input("host", t(hostPlaceholder))}
      </Label>
      <div className="flex gap-2">
        <Label className="mb-2 block min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">
            {t("profile.remote.user")}
          </span>
          {input("user", t("profile.remote.userPlaceholder"))}
        </Label>
        <Label className="mb-2 block w-20 shrink-0">
          <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">
            {t("profile.remote.port")}
          </span>
          {input("port", "22", true)}
        </Label>
      </div>
      <Label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">
          {t("profile.remote.identityFile")}
        </span>
        <div className="flex gap-2">
          <Input
            value={hop.identityFile}
            onChange={(e) => set({ identityFile: e.target.value })}
            placeholder={t("profile.remote.identityFilePlaceholder")}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            aria-invalid={invalidField === "identityFile"}
            className={`${INPUT_CLASS} min-w-0 flex-1 font-mono ${invalidField === "identityFile" ? "border-fail" : ""}`}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              void window.api.pickSshKey?.(hop.identityFile || undefined).then((picked) => {
                if (picked) set({ identityFile: picked });
              });
            }}
            className="shrink-0 cursor-pointer rounded-md border border-chrome-border-strong px-3 py-2 text-[12px] text-chrome-text-secondary hover:border-chrome-border-hover disabled:opacity-40"
          >
            {t("profile.dialog.browse")}
          </button>
        </div>
      </Label>
    </>
  );
}

/** Remote (SSH) tab: target host plus an optional, ordered list of jump hosts. */
export function ProfileRemoteSshSection({ value, onChange, invalid, disabled = false }: Props) {
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
  const setJump = (index: number, next: SshHopDraft) =>
    set({ jumpHosts: value.jumpHosts.map((hop, i) => (i === index ? next : hop)) });
  const moveJump = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= value.jumpHosts.length) return;
    const next = [...value.jumpHosts];
    [next[index], next[target]] = [next[target]!, next[index]!];
    set({ jumpHosts: next });
  };
  const fieldAt = (hop: "target" | number): SshHopField | null =>
    invalid && invalid.hop === hop && invalid.field !== "cwd" ? invalid.field : null;

  const route = [
    t("profile.remote.thisComputer"),
    ...value.jumpHosts.map((hop, i) =>
      hopDraftLabel(hop, t("profile.remote.jumpHostN", { n: i + 1 })),
    ),
    hopDraftLabel(value.target, t("profile.remote.target")),
  ];

  const invalidMessage = invalid
    ? invalid.hop === "target"
      ? t(INVALID_KEY[invalid.field])
      : `${t("profile.remote.jumpHostN", { n: invalid.hop + 1 })}: ${t(INVALID_KEY[invalid.field])}`
    : null;

  return (
    <div role="tabpanel" id="profile-tabpanel-remote" aria-labelledby="profile-tab-remote" className="mb-4">
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

          <div
            className="mb-3 flex flex-wrap items-center gap-1 rounded-md border border-chrome-border-subtle px-2 py-1.5 font-mono text-[11px] text-chrome-text-secondary"
            aria-label={t("profile.remote.route")}
            title={t("profile.remote.route")}
          >
            {route.map((label, i) => (
              <span key={`${String(i)}-${label}`} className="inline-flex items-center gap-1">
                {i > 0 ? <span aria-hidden className="text-chrome-text-dim">→</span> : null}
                <span className={i === route.length - 1 ? "text-chrome-text" : undefined}>{label}</span>
              </span>
            ))}
          </div>

          <fieldset className="mb-3 rounded-lg border border-chrome-border-subtle p-3">
            <legend className="px-1 text-[11px] text-chrome-text-subtle">{t("profile.remote.target")}</legend>
            <HopFields
              hop={value.target}
              onChange={(target) => set({ target })}
              invalidField={fieldAt("target")}
              disabled={disabled}
              hostPlaceholder="profile.remote.hostPlaceholder"
            />
            <Label className="block">
              <span className="mb-1 block text-[11px] font-normal text-chrome-text-subtle">
                {t("profile.remote.cwd")}
              </span>
              <Input
                value={value.cwd}
                onChange={(e) => set({ cwd: e.target.value })}
                placeholder={t("profile.remote.cwdPlaceholder")}
                disabled={disabled}
                spellCheck={false}
                autoCapitalize="off"
                aria-invalid={invalid?.field === "cwd"}
                className={`${INPUT_CLASS} font-mono ${invalid?.field === "cwd" ? "border-fail" : ""}`}
              />
            </Label>
          </fieldset>

          <fieldset className="mb-2 rounded-lg border border-chrome-border-subtle p-3">
            <legend className="px-1 text-[11px] text-chrome-text-subtle">{t("profile.remote.jumpHosts")}</legend>
            {value.jumpHosts.length === 0 ? (
              <p className="mb-2 text-[11px] text-chrome-text-dim">{t("profile.remote.noJump")}</p>
            ) : (
              <p className="mb-2 text-[10px] text-chrome-text-dim">{t("profile.remote.jumpOrderHint")}</p>
            )}
            {value.jumpHosts.map((hop, index) => (
              <div
                key={hop.key}
                className="mb-2 rounded-md border border-chrome-border-subtle bg-chrome-surface/40 p-2.5"
              >
                <div className="mb-2 flex items-center gap-1">
                  <span className="mr-auto text-[11px] font-medium text-chrome-text-secondary">
                    {t("profile.remote.jumpHostN", { n: index + 1 })}
                  </span>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    disabled={disabled || index === 0}
                    onClick={() => moveJump(index, -1)}
                    aria-label={t("profile.remote.moveUp")}
                    title={t("profile.remote.moveUp")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    disabled={disabled || index === value.jumpHosts.length - 1}
                    onClick={() => moveJump(index, 1)}
                    aria-label={t("profile.remote.moveDown")}
                    title={t("profile.remote.moveDown")}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${SMALL_BUTTON} hover:border-fail/60 hover:text-fail`}
                    disabled={disabled}
                    onClick={() => set({ jumpHosts: value.jumpHosts.filter((_, i) => i !== index) })}
                  >
                    {t("profile.remote.removeJump")}
                  </button>
                </div>
                <HopFields
                  hop={hop}
                  onChange={(next) => setJump(index, next)}
                  invalidField={fieldAt(index)}
                  disabled={disabled}
                  hostPlaceholder="profile.remote.jumpHostPlaceholder"
                />
              </div>
            ))}
            <button
              type="button"
              className={SMALL_BUTTON}
              disabled={disabled || value.jumpHosts.length >= MAX_SSH_JUMP_HOSTS}
              onClick={() => set({ jumpHosts: [...value.jumpHosts, emptyHopDraft()] })}
            >
              {t("profile.remote.addJump")}
            </button>
          </fieldset>

          <p className="mb-2 text-[10px] text-chrome-text-dim">{t("profile.remote.identityFileHint")}</p>
          {invalidMessage ? <p className="mb-1 text-[11px] text-fail">{invalidMessage}</p> : null}
          <p className="text-[10px] text-chrome-text-dim">{t("profile.remote.appliesOnRestart")}</p>
        </>
      ) : null}
    </div>
  );
}
