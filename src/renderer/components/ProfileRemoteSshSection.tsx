import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  KeyRound,
  Loader2,
  Monitor,
  Network,
  Plug,
  Plus,
  Server,
  Trash2,
  XCircle,
} from "lucide-react";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MAX_SSH_JUMP_HOSTS,
  draftToRemote,
  emptyHopDraft,
  type RemoteSshDraft,
  type RemoteSshField,
  type RemoteSshInvalid,
  type SshHopDraft,
  type SshHopField,
} from "../utils/remote-ssh";
import { classifySshFailure } from "../utils/ssh-failure";

interface Props {
  value: RemoteSshDraft;
  onChange: (next: RemoteSshDraft) => void;
  invalid: RemoteSshInvalid | null;
  disabled?: boolean;
}

type TestResult = Awaited<ReturnType<Window["api"]["sshTestConnection"]>>;
type TestState = { status: "idle" } | { status: "testing" } | { status: "done"; result: TestResult };

const INVALID_KEY: Record<RemoteSshField, MessageKey> = {
  host: "profile.remote.invalid.host",
  user: "profile.remote.invalid.user",
  port: "profile.remote.invalid.port",
  cwd: "profile.remote.invalid.cwd",
  identityFile: "profile.remote.invalid.identityFile",
};

const INPUT =
  "h-8 border-chrome-border-subtle bg-chrome-bg px-2.5 font-mono text-[12px] text-chrome-text placeholder:font-sans placeholder:text-chrome-text-dim focus-visible:border-chrome-border-hover";
const ICON_BUTTON =
  "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-chrome-text-subtle transition-colors hover:bg-chrome-surface hover:text-chrome-text disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent";

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-[11px] text-chrome-text-subtle">{children}</span>;
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

/** `user@host:port` for collapsed rows; empty host → placeholder. */
function hopSummary(hop: SshHopDraft): string {
  const host = hop.host.trim();
  if (!host) return "";
  const user = hop.user.trim();
  const port = hop.port.trim();
  return `${user ? `${user}@` : ""}${host}${port && port !== "22" ? `:${port}` : ""}`;
}

/** Host / user / port / private key for one endpoint. */
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
  const bad = (field: SshHopField) => (invalidField === field ? "border-fail focus-visible:border-fail" : "");
  return (
    <div className="space-y-2.5">
      <label className="block">
        <FieldLabel>{t("profile.remote.host")}</FieldLabel>
        <Input
          value={hop.host}
          onChange={(e) => set({ host: e.target.value })}
          placeholder={t(hostPlaceholder)}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={invalidField === "host"}
          className={cn(INPUT, bad("host"))}
        />
      </label>
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <label className="block min-w-0">
          <FieldLabel>{t("profile.remote.user")}</FieldLabel>
          <Input
            value={hop.user}
            onChange={(e) => set({ user: e.target.value })}
            placeholder={t("profile.remote.userPlaceholder")}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="off"
            aria-invalid={invalidField === "user"}
            className={cn(INPUT, bad("user"))}
          />
        </label>
        <label className="block">
          <FieldLabel>{t("profile.remote.port")}</FieldLabel>
          <Input
            value={hop.port}
            onChange={(e) => set({ port: e.target.value })}
            placeholder="22"
            inputMode="numeric"
            disabled={disabled}
            aria-invalid={invalidField === "port"}
            className={cn(INPUT, bad("port"))}
          />
        </label>
      </div>
      <label className="block">
        <FieldLabel>{t("profile.remote.identityFile")}</FieldLabel>
        <div className="flex gap-1.5">
          <div className="relative min-w-0 flex-1">
            <KeyRound
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-chrome-text-dim"
            />
            <Input
              value={hop.identityFile}
              onChange={(e) => set({ identityFile: e.target.value })}
              placeholder={t("profile.remote.identityFilePlaceholder")}
              disabled={disabled}
              spellCheck={false}
              autoCapitalize="off"
              aria-invalid={invalidField === "identityFile"}
              className={cn(INPUT, "pl-8", bad("identityFile"))}
            />
          </div>
          <button
            type="button"
            disabled={disabled}
            title={t("profile.dialog.browse")}
            aria-label={t("profile.dialog.browse")}
            onClick={() => {
              void window.api.pickSshKey?.(hop.identityFile || undefined).then((picked) => {
                if (picked) set({ identityFile: picked });
              });
            }}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-chrome-border-subtle text-chrome-text-subtle transition-colors hover:border-chrome-border-hover hover:text-chrome-text disabled:opacity-40"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      </label>
    </div>
  );
}

/** One stop on the route timeline: icon on the rail, title + summary, optional editor. */
function RouteStop({
  icon,
  title,
  summary,
  summaryMuted,
  expanded,
  onToggle,
  actions,
  last = false,
  tone = "default",
  children,
}: {
  icon: ReactNode;
  title: string;
  summary: ReactNode;
  summaryMuted?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  last?: boolean;
  tone?: "default" | "target" | "error";
  children?: ReactNode;
}) {
  const expandable = Boolean(onToggle);
  return (
    <div className="relative flex gap-3">
      <div className="flex w-7 shrink-0 flex-col items-center">
        <span
          className={cn(
            "z-10 flex h-7 w-7 items-center justify-center rounded-full border",
            tone === "target" && "border-accent/50 bg-accent/15 text-accent",
            tone === "error" && "border-fail/50 bg-fail/10 text-fail",
            tone === "default" && "border-chrome-border-strong bg-chrome-bg text-chrome-text-subtle",
          )}
        >
          {icon}
        </span>
        {!last ? <span aria-hidden className="w-px flex-1 bg-chrome-border-strong" /> : null}
      </div>
      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-3")}>
        <div className="flex min-h-7 items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            disabled={!expandable}
            aria-expanded={expandable ? expanded : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 text-left",
              expandable && "cursor-pointer hover:text-chrome-text",
            )}
          >
            {expandable ? (
              expanded ? (
                <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-chrome-text-dim" />
              ) : (
                <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-chrome-text-dim" />
              )
            ) : null}
            <span className="shrink-0 text-[12px] font-medium text-chrome-text">{title}</span>
            <span
              className={cn(
                "min-w-0 truncate text-[11px]",
                summaryMuted ? "text-chrome-text-dim" : "font-mono text-chrome-text-secondary",
              )}
            >
              {summary}
            </span>
          </button>
          {actions}
        </div>
        {expanded && children ? (
          <div className="mt-2 rounded-lg border border-chrome-border-subtle bg-chrome-surface/40 p-3">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Remote (SSH) tab: route timeline (this computer → jump hosts → target) + connection test. */
export function ProfileRemoteSshSection({ value, onChange, invalid, disabled = false }: Props) {
  const { t } = useLocale();
  const [client, setClient] = useState<{ found: boolean; path: string | null } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([value.target.key]));
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [showOutput, setShowOutput] = useState(false);

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

  // A hop with an error is always open so the red field is visible.
  const invalidKey =
    invalid === null
      ? null
      : invalid.hop === "target"
        ? value.target.key
        : (value.jumpHosts[invalid.hop]?.key ?? null);
  const isOpen = (key: string) => expanded.has(key) || key === invalidKey;
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Any edit makes an earlier test result stale.
  const change = (next: RemoteSshDraft) => {
    if (test.status === "done") setTest({ status: "idle" });
    onChange(next);
  };
  const set = (patch: Partial<RemoteSshDraft>) => change({ ...value, ...patch });
  const setJump = (index: number, hop: SshHopDraft) =>
    set({ jumpHosts: value.jumpHosts.map((h, i) => (i === index ? hop : h)) });
  const moveJump = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= value.jumpHosts.length) return;
    const next = [...value.jumpHosts];
    [next[index], next[to]] = [next[to]!, next[index]!];
    set({ jumpHosts: next });
  };
  const addJump = () => {
    const hop = emptyHopDraft();
    setExpanded((prev) => new Set(prev).add(hop.key));
    set({ jumpHosts: [...value.jumpHosts, hop] });
  };
  const fieldAt = (hop: "target" | number): SshHopField | null =>
    invalid && invalid.hop === hop && invalid.field !== "cwd" ? invalid.field : null;

  async function runTest() {
    const remote = draftToRemote(value);
    if (!remote || invalid) return;
    setShowOutput(false);
    setTest({ status: "testing" });
    try {
      const result = await window.api.sshTestConnection(remote);
      setTest({ status: "done", result });
    } catch (err) {
      setTest({
        status: "done",
        result: {
          ok: false,
          reason: "failed",
          exitCode: null,
          output: err instanceof Error ? err.message : String(err),
          durationMs: 0,
          client: null,
        },
      });
    }
  }

  const invalidMessage = invalid
    ? invalid.hop === "target"
      ? t(INVALID_KEY[invalid.field])
      : `${t("profile.remote.jumpHostN", { n: invalid.hop + 1 })} · ${t(INVALID_KEY[invalid.field])}`
    : null;

  const keySummary = (hop: SshHopDraft) =>
    hop.identityFile.trim() ? (
      <span className="ml-1.5 inline-flex items-center gap-1 text-chrome-text-dim">
        <KeyRound aria-hidden className="h-3 w-3" />
        {fileName(hop.identityFile.trim())}
      </span>
    ) : null;

  const seconds = (ms: number) => (ms / 1000).toFixed(1);

  return (
    <div role="tabpanel" id="profile-tabpanel-remote" aria-labelledby="profile-tab-remote" className="mb-2 space-y-3">
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
          value.enabled ? "border-accent/40 bg-accent/5" : "border-chrome-border-subtle hover:border-chrome-border-hover",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            value.enabled ? "bg-accent/15 text-accent" : "bg-chrome-surface text-chrome-text-subtle",
          )}
        >
          <Network className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-chrome-text">{t("profile.remote.enable")}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-chrome-text-dim">{t("profile.remote.hint")}</span>
        </span>
        <Checkbox
          className="mt-1"
          checked={value.enabled}
          onCheckedChange={(v) => set({ enabled: v === true })}
          disabled={disabled}
        />
      </label>

      {value.enabled ? (
        <>
          {client && !client.found ? (
            <div className="flex gap-2 rounded-lg border border-fail/40 bg-fail/10 p-2.5 text-[11px] leading-snug text-fail">
              <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{t("profile.remote.sshMissing")}</span>
            </div>
          ) : null}

          <section aria-label={t("profile.remote.route")}>
            <h3 className="mb-2 text-[11px] font-medium tracking-wide text-chrome-text-subtle uppercase">
              {t("profile.remote.route")}
            </h3>

            <RouteStop
              icon={<Monitor className="h-3.5 w-3.5" />}
              title={t("profile.remote.thisComputer")}
              summary={client?.path ? fileName(client.path) : "ssh"}
              summaryMuted
            />

            {value.jumpHosts.map((hop, index) => {
              const label = t("profile.remote.jumpHostN", { n: index + 1 });
              const summary = hopSummary(hop);
              return (
                <RouteStop
                  key={hop.key}
                  icon={<Network className="h-3.5 w-3.5" />}
                  tone={hop.key === invalidKey ? "error" : "default"}
                  title={label}
                  summary={
                    summary ? (
                      <>
                        {summary}
                        {keySummary(hop)}
                      </>
                    ) : (
                      t("profile.remote.notSet")
                    )
                  }
                  summaryMuted={!summary}
                  expanded={isOpen(hop.key)}
                  onToggle={() => toggle(hop.key)}
                  actions={
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        disabled={disabled || index === 0}
                        onClick={() => moveJump(index, -1)}
                        title={t("profile.remote.moveUp")}
                        aria-label={`${label} · ${t("profile.remote.moveUp")}`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        disabled={disabled || index === value.jumpHosts.length - 1}
                        onClick={() => moveJump(index, 1)}
                        title={t("profile.remote.moveDown")}
                        aria-label={`${label} · ${t("profile.remote.moveDown")}`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={cn(ICON_BUTTON, "hover:text-fail")}
                        disabled={disabled}
                        onClick={() => set({ jumpHosts: value.jumpHosts.filter((_, i) => i !== index) })}
                        title={t("profile.remote.removeJump")}
                        aria-label={`${label} · ${t("profile.remote.removeJump")}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  }
                >
                  <HopFields
                    hop={hop}
                    onChange={(next) => setJump(index, next)}
                    invalidField={fieldAt(index)}
                    disabled={disabled}
                    hostPlaceholder="profile.remote.jumpHostPlaceholder"
                  />
                </RouteStop>
              );
            })}

            {value.jumpHosts.length < MAX_SSH_JUMP_HOSTS ? (
              <div className="relative flex gap-3">
                <div className="flex w-7 shrink-0 flex-col items-center">
                  <span aria-hidden className="w-px flex-1 bg-chrome-border-strong" />
                </div>
                <div className="flex-1 pb-3">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={addJump}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-chrome-border-strong px-2.5 py-1 text-[11px] text-chrome-text-subtle transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-40"
                  >
                    <Plus aria-hidden className="h-3 w-3" />
                    {t("profile.remote.addJump")}
                  </button>
                  {value.jumpHosts.length === 0 ? (
                    <span className="ml-2 text-[11px] text-chrome-text-dim">{t("profile.remote.noJump")}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <RouteStop
              icon={<Server className="h-3.5 w-3.5" />}
              tone={value.target.key === invalidKey ? "error" : "target"}
              title={t("profile.remote.target")}
              summary={
                hopSummary(value.target) ? (
                  <>
                    {hopSummary(value.target)}
                    {keySummary(value.target)}
                  </>
                ) : (
                  t("profile.remote.notSet")
                )
              }
              summaryMuted={!hopSummary(value.target)}
              expanded={isOpen(value.target.key)}
              onToggle={() => toggle(value.target.key)}
              last
            >
              <HopFields
                hop={value.target}
                onChange={(target) => set({ target })}
                invalidField={fieldAt("target")}
                disabled={disabled}
                hostPlaceholder="profile.remote.hostPlaceholder"
              />
              <label className="mt-2.5 block">
                <FieldLabel>{t("profile.remote.cwd")}</FieldLabel>
                <Input
                  value={value.cwd}
                  onChange={(e) => set({ cwd: e.target.value })}
                  placeholder={t("profile.remote.cwdPlaceholder")}
                  disabled={disabled}
                  spellCheck={false}
                  autoCapitalize="off"
                  aria-invalid={invalid?.field === "cwd"}
                  className={cn(INPUT, invalid?.field === "cwd" && "border-fail focus-visible:border-fail")}
                />
              </label>
            </RouteStop>
          </section>

          {invalidMessage ? (
            <p role="alert" className="flex items-center gap-1.5 text-[11px] text-fail">
              <XCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
              {invalidMessage}
            </p>
          ) : null}

          <div className="rounded-lg border border-chrome-border-subtle p-2.5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={disabled || test.status === "testing" || invalid !== null || client?.found === false}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-chrome-border-strong px-3 py-1.5 text-[12px] text-chrome-text transition-colors hover:border-accent/60 hover:text-accent disabled:cursor-default disabled:opacity-40 disabled:hover:border-chrome-border-strong disabled:hover:text-chrome-text"
              >
                {test.status === "testing" ? (
                  <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plug aria-hidden className="h-3.5 w-3.5" />
                )}
                {t("profile.remote.test.button")}
              </button>
              <div className="min-w-0 flex-1 text-[11px]" aria-live="polite">
                {test.status === "idle" ? (
                  <span className="text-chrome-text-dim">{t("profile.remote.test.idle")}</span>
                ) : null}
                {test.status === "testing" ? (
                  <span className="text-chrome-text-secondary">{t("profile.remote.test.running")}</span>
                ) : null}
                {test.status === "done" && test.result.ok ? (
                  <span className="inline-flex items-center gap-1.5 text-ok">
                    <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                    {t("profile.remote.test.ok", { seconds: seconds(test.result.durationMs) })}
                  </span>
                ) : null}
                {test.status === "done" && !test.result.ok ? (
                  <span className="inline-flex items-center gap-1.5 text-fail">
                    <XCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                    {test.result.reason === "timeout"
                      ? t("profile.remote.test.timeout")
                      : t("profile.remote.test.failed")}
                  </span>
                ) : null}
              </div>
            </div>
            {test.status === "done" && !test.result.ok ? (
              <div className="mt-2 border-t border-chrome-border-subtle pt-2">
                <p className="text-[11px] leading-snug text-chrome-text-secondary">
                  {test.result.reason === "no-client"
                    ? t("profile.remote.sshMissing")
                    : t(`profile.remote.test.fail.${classifySshFailure(test.result.output)}`)}
                </p>
                {test.result.output ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowOutput((v) => !v)}
                      className="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-[11px] text-chrome-text-subtle hover:text-chrome-text"
                    >
                      {showOutput ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {t("profile.remote.test.showOutput")}
                    </button>
                    {showOutput ? (
                      <pre className="mt-1.5 max-h-32 overflow-auto rounded-md bg-chrome-bg p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-chrome-text-secondary">
                        {test.result.output}
                      </pre>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <p className="text-[10.5px] leading-snug text-chrome-text-dim">
            {t("profile.remote.identityFileHint")} {t("profile.remote.appliesOnRestart")}
          </p>
        </>
      ) : null}
    </div>
  );
}
