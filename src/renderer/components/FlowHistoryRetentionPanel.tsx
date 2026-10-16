import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "../i18n/LocaleProvider";

function parseLimit(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** App-wide run history retention (max runs per flow / max age) + manual GC. */
export function FlowHistoryRetentionPanel({ onPruned }: { onPruned?: () => void }) {
  const { t } = useLocale();
  const [maxRuns, setMaxRuns] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [saved, setSaved] = useState<{ runs: number | null; days: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.flowGetSchedulePrefs().then((prefs) => {
      if (cancelled) return;
      setMaxRuns(prefs.historyMaxRuns ? String(prefs.historyMaxRuns) : "");
      setMaxDays(prefs.historyMaxDays ? String(prefs.historyMaxDays) : "");
      setSaved({ runs: prefs.historyMaxRuns, days: prefs.historyMaxDays });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    saved !== null && (parseLimit(maxRuns) !== saved.runs || parseLimit(maxDays) !== saved.days);

  const save = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const res = await window.api.flowSetSchedulePrefs({
      historyMaxRuns: parseLimit(maxRuns),
      historyMaxDays: parseLimit(maxDays),
    });
    setBusy(false);
    if (!res.ok || !res.prefs) {
      setError(res.error ?? t("flow.history.retentionSaveFailed"));
      return;
    }
    setSaved({ runs: res.prefs.historyMaxRuns, days: res.prefs.historyMaxDays });
  };

  const pruneNow = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const res = await window.api.flowPruneHistory();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? t("flow.history.pruneFailed"));
      return;
    }
    setStatus(t("flow.history.pruned", { count: res.deleted ?? 0 }));
    onPruned?.();
  };

  return (
    <section className="rounded-[20px] border border-border bg-bg-primary px-3 py-2.5">
      <div className="text-[12px] font-medium text-text-primary">{t("flow.history.retentionTitle")}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
        {t("flow.history.retentionHint")}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
          {t("flow.history.maxRuns")}
          <Input
            type="number"
            min={1}
            value={maxRuns}
            onChange={(e) => setMaxRuns(e.target.value)}
            placeholder={t("flow.history.unlimited")}
            className="rounded-[18px] border-border bg-bg-primary text-[12px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
          {t("flow.history.maxDays")}
          <Input
            type="number"
            min={1}
            value={maxDays}
            onChange={(e) => setMaxDays(e.target.value)}
            placeholder={t("flow.history.unlimited")}
            className="rounded-[18px] border-border bg-bg-primary text-[12px]"
          />
        </label>
      </div>
      {error && <p className="mt-2 text-[11px] text-fail">{error}</p>}
      {status && <p className="mt-2 text-[11px] text-text-secondary">{status}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-[22px] border-border text-[12px]"
          disabled={busy}
          onClick={() => void pruneNow()}
        >
          {t("flow.history.pruneNow")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-[22px] text-[12px]"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          {t("flow.history.retentionSave")}
        </Button>
      </div>
    </section>
  );
}
