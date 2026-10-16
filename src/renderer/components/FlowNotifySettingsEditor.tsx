import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  FlowDefinition,
  FlowDesktopNotifyMode,
  FlowNotifyEvent,
  FlowWebhookDef,
  FlowWebhookMethod,
} from "../../shared/flow-types.js";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  flowId: string;
  flowDef: FlowDefinition;
  onSaved: () => void;
};

type WebhookDraft = {
  url: string;
  method: FlowWebhookMethod;
  onSuccess: boolean;
  onFailure: boolean;
  payload: string;
  authorization: string;
  /** Not edited here (frontmatter `content_type`); carried through on save. */
  contentType: string;
};

const NOTIFY_MODES: FlowDesktopNotifyMode[] = ["all", "failure", "success", "none"];
const WEBHOOK_METHODS: FlowWebhookMethod[] = ["POST", "PUT", "PATCH", "GET"];

const NOTIFY_LABEL_KEYS = {
  all: "flow.notify.mode.all",
  failure: "flow.notify.mode.failure",
  success: "flow.notify.mode.success",
  none: "flow.notify.mode.none",
} as const;

function toDraft(hook: FlowWebhookDef): WebhookDraft {
  return {
    url: hook.url,
    method: hook.method,
    onSuccess: hook.on.includes("success"),
    onFailure: hook.on.includes("failure"),
    payload: hook.payload ?? "",
    authorization: hook.authorization ?? "",
    contentType: hook.contentType ?? "",
  };
}

function fromDraft(d: WebhookDraft): FlowWebhookDef {
  const on: FlowNotifyEvent[] = [];
  if (d.onSuccess) on.push("success");
  if (d.onFailure) on.push("failure");
  return {
    url: d.url.trim(),
    method: d.method,
    on: on.length > 0 ? on : ["success", "failure"],
    payload: d.payload.trim() ? d.payload : undefined,
    authorization: d.authorization.trim() || undefined,
    contentType: d.contentType.trim() || undefined,
  };
}

function parseLimit(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** Per-flow notifications: desktop policy, Slack success/failure, generic webhooks, history overrides. */
export function FlowNotifySettingsEditor({ flowId, flowDef, onSaved }: Props) {
  const { t } = useLocale();
  const [notify, setNotify] = useState<FlowDesktopNotifyMode>(flowDef.notify ?? "all");
  const [slackSuccess, setSlackSuccess] = useState(flowDef.onSuccess === "slack");
  const [slackFailure, setSlackFailure] = useState(flowDef.onFail === "slack");
  const [hooks, setHooks] = useState<WebhookDraft[]>(() => (flowDef.webhooks ?? []).map(toDraft));
  const [maxRuns, setMaxRuns] = useState(flowDef.historyMaxRuns ? String(flowDef.historyMaxRuns) : "");
  const [maxDays, setMaxDays] = useState(flowDef.historyMaxDays ? String(flowDef.historyMaxDays) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNotify(flowDef.notify ?? "all");
    setSlackSuccess(flowDef.onSuccess === "slack");
    setSlackFailure(flowDef.onFail === "slack");
    setHooks((flowDef.webhooks ?? []).map(toDraft));
    setMaxRuns(flowDef.historyMaxRuns ? String(flowDef.historyMaxRuns) : "");
    setMaxDays(flowDef.historyMaxDays ? String(flowDef.historyMaxDays) : "");
    setError(null);
  }, [flowId, flowDef]);

  const baseline = useMemo(
    () =>
      JSON.stringify({
        notify: flowDef.notify ?? "all",
        s: flowDef.onSuccess === "slack",
        f: flowDef.onFail === "slack",
        hooks: (flowDef.webhooks ?? []).map(toDraft),
        r: flowDef.historyMaxRuns ?? null,
        d: flowDef.historyMaxDays ?? null,
      }),
    [flowDef],
  );
  const dirty =
    JSON.stringify({
      notify,
      s: slackSuccess,
      f: slackFailure,
      hooks,
      r: parseLimit(maxRuns),
      d: parseLimit(maxDays),
    }) !== baseline;

  const updateHook = (index: number, patch: Partial<WebhookDraft>) => {
    setHooks((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  };

  const save = async () => {
    if (hooks.some((h) => !h.url.trim())) {
      setError(t("flow.notify.webhookUrlRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const res = await window.api.flowSaveNotifySettings(flowId, {
      notify,
      onSuccess: slackSuccess ? "slack" : "none",
      onFail: slackFailure ? "slack" : "none",
      webhooks: hooks.length > 0 ? hooks.map(fromDraft) : null,
      historyMaxRuns: parseLimit(maxRuns),
      historyMaxDays: parseLimit(maxDays),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? t("flow.notify.saveFailed"));
      return;
    }
    onSaved();
  };

  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] text-text-secondary">{t("flow.notify.desktop")}</label>
        <select
          value={notify}
          onChange={(e) => setNotify(e.target.value as FlowDesktopNotifyMode)}
          className="rounded-[22px] border border-border bg-bg-primary px-3 py-2 text-[13px] text-text-primary"
        >
          {NOTIFY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(NOTIFY_LABEL_KEYS[mode])}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[12px] text-text-secondary">{t("flow.notify.slack")}</span>
        <label className="flex cursor-pointer items-center gap-2 rounded-[18px] px-1 py-1 text-[12px] text-text-primary hover:bg-bg-elevated">
          <input
            type="checkbox"
            className="size-4 rounded accent-accent"
            checked={slackSuccess}
            onChange={(e) => setSlackSuccess(e.target.checked)}
          />
          <span>{t("flow.notify.onSuccess")}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-[18px] px-1 py-1 text-[12px] text-text-primary hover:bg-bg-elevated">
          <input
            type="checkbox"
            className="size-4 rounded accent-accent"
            checked={slackFailure}
            onChange={(e) => setSlackFailure(e.target.checked)}
          />
          <span>{t("flow.notify.onFailure")}</span>
        </label>
        <p className="text-[11px] text-text-secondary">{t("flow.notify.slackHint")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-text-secondary">{t("flow.notify.webhooks")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-[22px] border-border text-[12px]"
            onClick={() =>
              setHooks((prev) => [
                ...prev,
                { url: "", method: "POST", onSuccess: true, onFailure: true, payload: "", authorization: "", contentType: "" },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            {t("flow.notify.addWebhook")}
          </Button>
        </div>
        {hooks.length === 0 && (
          <p className="text-[11px] text-text-secondary">{t("flow.notify.noWebhooks")}</p>
        )}
        {hooks.map((hook, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-[18px] border border-border bg-bg-primary/50 p-3"
          >
            <div className="flex gap-2">
              <select
                value={hook.method}
                onChange={(e) => updateHook(index, { method: e.target.value as FlowWebhookMethod })}
                className="shrink-0 rounded-[18px] border border-border bg-bg-primary px-2 py-1.5 text-[12px] text-text-primary"
              >
                {WEBHOOK_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <Input
                value={hook.url}
                onChange={(e) => updateHook(index, { url: e.target.value })}
                placeholder="https://hooks.example.com/flow?token=${MY_TOKEN}"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-[18px] border-border bg-bg-primary font-mono text-[12px]"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("flow.notify.removeWebhook")}
                title={t("flow.notify.removeWebhook")}
                className="shrink-0 rounded-[18px] px-2 text-text-secondary hover:text-fail"
                onClick={() => setHooks((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="flex flex-wrap gap-3 text-[12px] text-text-primary">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4 rounded accent-accent"
                  checked={hook.onSuccess}
                  onChange={(e) => updateHook(index, { onSuccess: e.target.checked })}
                />
                {t("flow.notify.onSuccess")}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4 rounded accent-accent"
                  checked={hook.onFailure}
                  onChange={(e) => updateHook(index, { onFailure: e.target.checked })}
                />
                {t("flow.notify.onFailure")}
              </label>
            </div>
            {hook.method !== "GET" && (
              <Textarea
                value={hook.payload}
                onChange={(e) => updateHook(index, { payload: e.target.value })}
                placeholder={'{"text": "Flow {flow_id} {status} {error}"}'}
                spellCheck={false}
                rows={2}
                className="min-h-[56px] resize-y rounded-[16px] border-border bg-bg-primary font-mono text-[12px]"
              />
            )}
            <Input
              value={hook.authorization}
              onChange={(e) => updateHook(index, { authorization: e.target.value })}
              placeholder={t("flow.notify.authorizationPlaceholder")}
              spellCheck={false}
              className="rounded-[18px] border-border bg-bg-primary font-mono text-[12px]"
            />
          </div>
        ))}
        <p className="text-[11px] leading-relaxed text-text-secondary">{t("flow.notify.webhookHint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-text-secondary">{t("flow.history.retentionOverride")}</span>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            value={maxRuns}
            onChange={(e) => setMaxRuns(e.target.value)}
            placeholder={t("flow.history.maxRuns")}
            className="min-w-0 flex-1 rounded-[18px] border-border bg-bg-primary text-[12px]"
          />
          <Input
            type="number"
            min={1}
            value={maxDays}
            onChange={(e) => setMaxDays(e.target.value)}
            placeholder={t("flow.history.maxDays")}
            className="min-w-0 flex-1 rounded-[18px] border-border bg-bg-primary text-[12px]"
          />
        </div>
        <p className="text-[11px] text-text-secondary">{t("flow.history.retentionOverrideHint")}</p>
      </div>

      {error && (
        <p className="whitespace-pre-wrap rounded-[20px] border border-fail/30 bg-fail/10 px-3 py-2 text-[12px] text-fail">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="rounded-[22px]"
        >
          {saving ? t("flow.notify.saving") : t("flow.notify.save")}
        </Button>
      </div>
    </div>
  );
}
