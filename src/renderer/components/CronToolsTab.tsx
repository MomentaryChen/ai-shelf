import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  COMMON_CRON_TIMEZONES,
  CRON_FIELD_ORDER,
  CRON_FIELD_RANGES,
  CRON_PRESETS,
  formatCronRun,
  getLocalTimeZone,
  previewCron,
  type CronFieldId,
  type CronPresetId,
} from "../utils/cron-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

const PRESET_LABEL_KEYS: Record<CronPresetId, MessageKey> = {
  every15min: "cron.preset.every15min",
  every30min: "cron.preset.every30min",
  everyHour: "cron.preset.everyHour",
  everyDay9: "cron.preset.everyDay9",
  weekdays9: "cron.preset.weekdays9",
  weeklyMon9: "cron.preset.weeklyMon9",
  noon: "cron.preset.noon",
  midnight: "cron.preset.midnight",
  firstOfMonth: "cron.preset.firstOfMonth",
  friday17: "cron.preset.friday17",
};

const FIELD_LABEL_KEYS: Record<CronFieldId, MessageKey> = {
  minute: "cron.field.minute",
  hour: "cron.field.hour",
  dayOfMonth: "cron.field.dayOfMonth",
  month: "cron.field.month",
  dayOfWeek: "cron.field.dayOfWeek",
};

const ERROR_KEYS: Record<string, MessageKey> = {
  empty: "cron.error.empty",
  fields: "cron.error.fields",
  timezone: "cron.error.timezone",
  invalid: "cron.error.invalid",
};

export function CronToolsTab() {
  const { t, locale } = useLocale();
  const expressionId = useId();
  const timezoneId = useId();
  const copiedTimerRef = useRef<number | null>(null);

  const [expression, setExpression] = useState("0 9 * * 1-5");
  const [timezone, setTimezone] = useState(() => getLocalTimeZone());
  const [copied, setCopied] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Refresh next-run relative clock once a minute while the tab is mounted.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const preview = useMemo(
    () => previewCron(expression, timezone, 8, new Date(nowTick)),
    [expression, timezone, nowTick],
  );

  const errorMessage = preview.ok ? null : t(ERROR_KEYS[preview.error] ?? "cron.error.invalid");

  const copyExpression = async () => {
    const value = expression.trim();
    if (!value) return;
    const ok = await writeClipboardText(value);
    if (!ok) return;
    setCopied(true);
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1600);
  };

  const tzOptions = useMemo(() => {
    const local = getLocalTimeZone();
    const set = new Set<string>([local, ...COMMON_CRON_TIMEZONES]);
    if (timezone.trim()) set.add(timezone.trim());
    return [...set];
  }, [timezone]);

  return (
    <>
      <SectionHeading icon={CalendarClock}>{t("tools.tab.cron")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("cron.subtitle")}
      </p>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 @md:grid-cols-[1fr_minmax(12rem,16rem)]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={expressionId} className="text-[12px] font-medium text-text-secondary">
                {t("cron.expression")}
              </Label>
              <Input
                id={expressionId}
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                spellCheck={false}
                placeholder="0 9 * * 1-5"
                aria-invalid={errorMessage ? true : undefined}
                className="rounded-[22px] border-border bg-bg-primary font-mono text-[13px] text-text-primary"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={timezoneId} className="text-[12px] font-medium text-text-secondary">
                {t("cron.timezone")}
              </Label>
              <Input
                id={timezoneId}
                list={`${timezoneId}-zones`}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                spellCheck={false}
                placeholder="Asia/Taipei"
                className="rounded-[22px] border-border bg-bg-primary font-mono text-[13px] text-text-primary"
              />
              <datalist id={`${timezoneId}-zones`}>
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-medium text-text-secondary">{t("cron.presets")}</p>
            <div className="flex flex-wrap gap-1.5">
              {CRON_PRESETS.map((preset) => {
                const active = expression.trim() === preset.cron;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setExpression(preset.cron)}
                    aria-pressed={active}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-[12px] transition-colors duration-200 ${
                      active
                        ? "bg-accent font-medium text-on-accent warm-shadow-accent"
                        : "bg-secondary text-text-primary hover:bg-accent-surface"
                    }`}
                    title={preset.cron}
                  >
                    <span>{t(PRESET_LABEL_KEYS[preset.id])}</span>
                    <span className="ml-1.5 hidden font-mono text-[11px] opacity-70 @sm:inline">
                      {preset.cron}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid items-start gap-3 @md:grid-cols-2">
            <div className="rounded-[22px] bg-bg-primary/60 px-3.5 py-3">
              <p className="mb-2 flex h-8 items-center text-[12px] font-medium text-text-secondary">
                {t("cron.fields")}
              </p>
              <ul className="flex flex-col gap-1.5">
                {CRON_FIELD_ORDER.map((field) => {
                  const value = preview.ok ? preview.parts[field] : "—";
                  return (
                    <li
                      key={field}
                      className="flex items-baseline justify-between gap-3 text-[13px] text-text-primary"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{t(FIELD_LABEL_KEYS[field])}</span>
                        <span className="ml-1.5 text-[11px] text-text-tertiary">
                          {CRON_FIELD_RANGES[field]}
                        </span>
                      </span>
                      <code className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[12px]">
                        {value}
                      </code>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-text-tertiary">
                {t("cron.fields.hint")}
              </p>
            </div>

            <div className="rounded-[22px] bg-bg-primary/60 px-3.5 py-3">
              <p className="mb-2 flex h-8 items-center text-[12px] font-medium text-text-secondary">
                {t("cron.nextRuns")}
              </p>
              {preview.ok ? (
                <ol className="flex flex-col gap-1.5 tabular-nums">
                  {preview.nextRuns.map((run, index) => (
                    <li
                      key={`${run.getTime()}-${index}`}
                      className="flex items-center gap-2 text-[13px] text-text-primary"
                    >
                      <span className="w-4 shrink-0 text-[11px] text-text-tertiary">
                        {index + 1}.
                      </span>
                      <span className="font-mono text-[12px]">
                        {formatCronRun(run, timezone, locale === "zh" ? "zh-TW" : "en-US")}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p role="alert" className="text-[12px] text-fail">
                  {errorMessage}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void copyExpression()}
              disabled={!expression.trim()}
              className="h-8 px-2 text-[12px]"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? t("cron.copied") : t("cron.copy")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setExpression("");
                setTimezone(getLocalTimeZone());
              }}
              disabled={!expression.trim()}
            >
              {t("cron.clear")}
            </Button>
            <span className="text-[12px] text-text-tertiary">{t("cron.hint.live")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
