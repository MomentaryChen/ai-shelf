import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "../i18n/LocaleProvider";

const CRON_PRESETS: { id: keyof typeof PRESET_LABEL_KEYS; cron: string }[] = [
  { id: "hourly", cron: "0 * * * *" },
  { id: "daily9", cron: "0 9 * * *" },
  { id: "weekdays9", cron: "0 9 * * 1-5" },
  { id: "weeklyMon9", cron: "0 9 * * 1" },
];

const PRESET_LABEL_KEYS = {
  hourly: "flow.schedule.preset.hourly",
  daily9: "flow.schedule.preset.daily9",
  weekdays9: "flow.schedule.preset.weekdays9",
  weeklyMon9: "flow.schedule.preset.weeklyMon9",
} as const;

type Props = {
  flowId: string;
  schedule?: string;
  timezone?: string;
  nextRunAt?: string | null;
  onSaved: () => void;
  /** Render without outer card chrome (inside dialog). */
  embedded?: boolean;
};

export function FlowScheduleEditor({
  flowId,
  schedule,
  timezone,
  nextRunAt,
  onSaved,
  embedded = false,
}: Props) {
  const { t } = useLocale();
  const [scheduled, setScheduled] = useState(Boolean(schedule));
  const [cron, setCron] = useState(schedule ?? "0 9 * * 1");
  const [tz, setTz] = useState(timezone ?? "Asia/Taipei");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setScheduled(Boolean(schedule));
    setCron(schedule ?? "0 9 * * 1");
    setTz(timezone ?? "Asia/Taipei");
    setError(null);
  }, [flowId, schedule, timezone]);

  const dirty = useMemo(() => {
    if (!scheduled) return Boolean(schedule);
    return cron.trim() !== (schedule ?? "") || tz.trim() !== (timezone ?? "Asia/Taipei");
  }, [scheduled, cron, tz, schedule, timezone]);

  const formatNextRun = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await window.api.flowSaveSchedule(flowId, {
      schedule: scheduled ? cron.trim() : null,
      timezone: scheduled ? tz.trim() || "Asia/Taipei" : null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? t("flow.schedule.saveFailed"));
      return;
    }
    onSaved();
  };

  const body = (
    <>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">{t("flow.schedule.title")}</h2>
            <p className="mt-1 text-[13px] text-text-secondary">{t("flow.schedule.hint")}</p>
          </div>
        </div>
      )}

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-text-primary">
        <input
          type="checkbox"
          className="size-4 rounded accent-accent"
          checked={scheduled}
          onChange={(e) => setScheduled(e.target.checked)}
        />
        {t("flow.schedule.enabled")}
      </label>

      {scheduled ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] text-text-secondary">{t("flow.schedule.cron")}</label>
            <Input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 9 * * 1"
              className="rounded-[22px] border-border bg-bg-primary font-mono text-[13px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CRON_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setCron(preset.cron)}
                className="cursor-pointer rounded-full bg-bg-card px-3 py-1 font-mono text-[11px] text-text-primary transition-colors hover:bg-bg-elevated"
              >
                {t(PRESET_LABEL_KEYS[preset.id])}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] text-text-secondary">{t("flow.schedule.timezone")}</label>
            <Input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="Asia/Taipei"
              className="rounded-[22px] border-border bg-bg-primary text-[13px]"
            />
          </div>
          {nextRunAt && (
            <p className="text-[12px] text-text-secondary">
              {t("flow.nextRun", { time: formatNextRun(nextRunAt) ?? "" })}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-text-secondary">{t("flow.manualOnly")}</p>
      )}

      {error && (
        <p className="mt-3 rounded-[20px] border border-fail/30 bg-fail/10 px-3 py-2 text-[12px] text-fail">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="rounded-[22px]"
        >
          {saving ? t("flow.schedule.saving") : t("flow.schedule.save")}
        </Button>
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <section className="rounded-[28px] bg-bg-secondary p-5 shadow-card">{body}</section>
  );
}
