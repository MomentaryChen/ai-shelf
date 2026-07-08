import { ShieldAlert, ShieldCheck, X } from "lucide-react";
import type { HealthMonitorState } from "../types";
import { Card } from "./Card";
import { Button } from "@/components/ui/button";
import { useLocale } from "../i18n/LocaleProvider";

export function HealthStatusBanner({
  state,
  onGoDoctor,
  onGoUpdate,
  onRefresh,
}: {
  state: HealthMonitorState;
  onGoDoctor: () => void;
  onGoUpdate: () => void;
  onRefresh: () => void;
}) {
  const { t } = useLocale();
  const { alerts, outdatedTools, doctorSummary, checking, lastCheckAt } = state;

  if (!state.prefs.backgroundChecksEnabled) return null;

  const hasIssues = alerts.length > 0;
  if (!hasIssues && !checking) {
    return (
      <Card className="mb-5 border-ok/30 bg-ok/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck aria-hidden className="h-6 w-6 shrink-0 text-ok" />
            <div>
              <p className="font-medium text-ok">{t("healthMonitor.allClear")}</p>
              <p className="text-xs text-text-secondary">
                {lastCheckAt
                  ? t("healthMonitor.lastCheck", { time: new Date(lastCheckAt).toLocaleString() })
                  : t("healthMonitor.watching")}
              </p>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={checking}>
            {checking ? t("healthMonitor.checking") : t("healthMonitor.checkNow")}
          </Button>
        </div>
      </Card>
    );
  }

  const failAlerts = alerts.filter((a) => a.severity === "fail");
  const updateCount = outdatedTools.length;

  return (
    <Card className="mb-5 border-warn/40 bg-warn/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden className="h-6 w-6 shrink-0 text-warn" />
          <div className="space-y-1">
            <p className="font-medium text-text-primary">
              {checking
                ? t("healthMonitor.checking")
                : t("healthMonitor.attention", { count: alerts.length })}
            </p>
            <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-text-secondary">
              {alerts.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <span className={a.severity === "fail" ? "text-fail" : "text-warn"}>
                    {a.severity === "fail" ? (
                      <X aria-hidden className="inline h-3 w-3 align-[-1px]" />
                    ) : (
                      "!"
                    )}
                  </span>{" "}
                  {a.message}
                </li>
              ))}
              {alerts.length > 6 && (
                <li className="text-text-tertiary">
                  {t("healthMonitor.more", { count: alerts.length - 6 })}
                </li>
              )}
            </ul>
            {lastCheckAt && (
              <p className="text-[11px] text-text-tertiary">
                {t("healthMonitor.lastCheck", { time: new Date(lastCheckAt).toLocaleString() })}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {failAlerts.length > 0 || doctorSummary.warnCount > 0 ? (
            <Button type="button" size="sm" variant="outline" onClick={onGoDoctor}>
              {t("healthMonitor.openDoctor")}
            </Button>
          ) : null}
          {updateCount > 0 ? (
            <Button type="button" size="sm" variant="outline" onClick={onGoUpdate}>
              {t("healthMonitor.openUpdate")}
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={onRefresh} disabled={checking}>
            {checking ? t("healthMonitor.checking") : t("healthMonitor.checkNow")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
