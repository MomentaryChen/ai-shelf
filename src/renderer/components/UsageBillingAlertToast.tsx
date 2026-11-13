import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useDismissibleSurface } from "../hooks/useDismissibleSurface";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  BILLING_ALERT_PERCENT,
  evaluateBillingAlert,
  localDayKey,
  markBillingAlertShown,
  wasBillingAlertShownToday,
  type BillingAlertItem,
} from "../usage-billing-alert";

/** Let startup (inventory scan, terminals) settle before hitting provider APIs. */
const FIRST_CHECK_DELAY_MS = 30_000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const VISIBLE_MS = 10_000;

interface Props {
  onOpenUsage?: () => void;
}

/**
 * Background check: once a day, when the weekly budget or a pay-as-you-go billing quota
 * (Claude extra usage, Cursor on-demand) reaches 90%, show a short toast.
 */
export function UsageBillingAlertToast({ onOpenUsage }: Props) {
  const { t } = useLocale();
  const { item, exiting, show, hide } = useDismissibleSurface<BillingAlertItem[]>();
  // Backup for when localStorage is unavailable: never repeat within one session/day.
  const shownDayRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let hideTimer: number | null = null;

    const alreadyShown = () =>
      wasBillingAlertShownToday() || shownDayRef.current === localDayKey();

    const check = async () => {
      if (cancelled || alreadyShown()) return;
      try {
        const [creds, budget] = await Promise.all([
          window.api.usageGetCredentialStatus(),
          window.api.usageGetBudget(),
        ]);
        const hasBudget = (budget.budget.weeklyBudgetUsd ?? 0) > 0;
        const hasCreds = creds.statuses.some((s) => s.configured);
        if (!hasBudget && !hasCreds) return;

        const res = await window.api.usageFetchDashboard({ days: 7 });
        if (cancelled || !res.ok) return;
        const items = evaluateBillingAlert(res.dashboard);
        if (items.length === 0 || alreadyShown()) return;

        shownDayRef.current = localDayKey();
        markBillingAlertShown();
        show(items);
        if (hideTimer != null) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(hide, VISIBLE_MS);
      } catch {
        /* usage fetch is best-effort; try again next interval */
      }
    };

    const first = window.setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
      if (hideTimer != null) window.clearTimeout(hideTimer);
    };
  }, [show, hide]);

  if (!item) return null;

  const describe = (it: BillingAlertItem) =>
    it.kind === "weeklyBudget"
      ? t("usage.billingAlert.weeklyBudget", { percent: it.usedPercent })
      : t("usage.billingAlert.quota", {
          tool: it.toolLabel,
          quota: it.label ?? t(it.labelKey as MessageKey),
          percent: it.usedPercent,
        });

  return (
    <div
      className="fixed bottom-3 right-3 z-[100] max-w-[min(340px,calc(100vw-1.5rem))]"
      role="status"
      aria-live="polite"
    >
      <div
        className={`${exiting ? "ui-toast-exit" : "ui-toast-enter"} flex items-start gap-2 rounded-lg border border-warn/45 bg-bg-card/95 px-3 py-2.5 text-[12px] text-text-primary shadow-lg backdrop-blur-sm`}
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="font-medium">
            {t("usage.billingAlert.title", { percent: BILLING_ALERT_PERCENT })}
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-text-secondary">
            {item.map((it, i) => (
              <li key={i}>{describe(it)}</li>
            ))}
          </ul>
          {onOpenUsage && (
            <button
              type="button"
              className="mt-1.5 cursor-pointer text-[11px] text-accent hover:underline"
              onClick={() => {
                hide();
                onOpenUsage();
              }}
            >
              {t("usage.billingAlert.open")}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label={t("usage.billingAlert.dismiss")}
          className="shrink-0 cursor-pointer rounded p-0.5 text-text-tertiary hover:text-text-primary"
          onClick={hide}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
