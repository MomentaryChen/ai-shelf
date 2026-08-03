import { useEffect, useId, useRef, useState } from "react";
import { Check, Clock3, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  COMMON_TIMEZONES,
  formatTimeFormats,
  getLocalTimeZone,
  parseTimeInput,
  type TimeFormats,
  type TimeUnit,
} from "../utils/time-tools";
import { Card } from "./Card";
import { SectionHeading } from "./SectionHeading";

type UnitMode = "auto" | TimeUnit;

type ResultRow = {
  id: string;
  labelKey: MessageKey;
  value: string;
};

const UNIT_MODES: { id: UnitMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "s", label: "s" },
  { id: "ms", label: "ms" },
  { id: "us", label: "µs" },
  { id: "ns", label: "ns" },
];

const monoField =
  "h-10 border-border bg-bg-primary font-mono text-[13px] text-text-primary placeholder:text-text-tertiary";

function buildRows(f: TimeFormats, zone: string): ResultRow[] {
  return [
    { id: "isoUtc", labelKey: "time.field.isoUtc", value: f.isoUtc },
    { id: "isoLocal", labelKey: "time.field.isoLocal", value: f.isoLocal },
    { id: "zoneFull", labelKey: "time.field.zone", value: f.zoneFull },
    { id: "rfc2822", labelKey: "time.field.rfc2822", value: f.rfc2822 },
    { id: "unixSeconds", labelKey: "time.field.unixSeconds", value: f.unixSeconds },
    { id: "unixMillis", labelKey: "time.field.unixMillis", value: f.unixMillis },
    { id: "unixMicros", labelKey: "time.field.unixMicros", value: f.unixMicros },
    { id: "unixNanos", labelKey: "time.field.unixNanos", value: f.unixNanos },
    { id: "relative", labelKey: "time.field.relative", value: f.relative },
    { id: "zoneOffset", labelKey: "time.field.offset", value: `${zone} · ${f.zoneOffset}` },
  ];
}

function CopyButton({ value }: { value: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!value || value === "—"}
      className="h-8 shrink-0 px-2 text-[12px]"
      onClick={() => {
        void (async () => {
          const ok = await writeClipboardText(value);
          if (!ok) return;
          setCopied(true);
          if (timerRef.current != null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => {
            setCopied(false);
            timerRef.current = null;
          }, 1600);
        })();
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? t("time.copied") : t("time.copy")}
    </Button>
  );
}

export function TimeToolsTab() {
  const { t } = useLocale();
  const inputId = useId();
  const zoneId = useId();
  const localZone = getLocalTimeZone();

  const [input, setInput] = useState("");
  const [unitMode, setUnitMode] = useState<UnitMode>("auto");
  const [timeZone, setTimeZone] = useState(localZone);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [detected, setDetected] = useState<string | null>(null);

  const zoneOptions = (() => {
    const set = new Set<string>([localZone, ...COMMON_TIMEZONES]);
    return [...set];
  })();

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!input.trim()) {
      setRows([]);
      setError(null);
      setDetected(null);
      return;
    }

    const parsed = parseTimeInput(input, {
      nowMs,
      forcedUnit: unitMode,
    });
    if (!parsed) {
      setRows([]);
      setDetected(null);
      setError(t("time.error.invalid"));
      return;
    }

    const formats = formatTimeFormats(parsed.epochMs, { timeZone, nowMs });
    setRows(buildRows(formats, timeZone));
    setError(null);

    if (parsed.unit === "now") setDetected(t("time.detected.now"));
    else if (parsed.unit === "iso") setDetected(t("time.detected.iso"));
    else if (parsed.inferred) setDetected(t("time.detected.inferred", { unit: parsed.unit }));
    else setDetected(t("time.detected.unit", { unit: parsed.unit }));
  }, [input, unitMode, timeZone, nowMs, t]);

  const nowFormats = formatTimeFormats(nowMs, { timeZone, nowMs });

  return (
    <>
      <SectionHeading icon={Clock3}>{t("tools.tab.time")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("time.subtitle")}
      </p>

      <Card className="mb-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-[12px] font-medium text-text-secondary">{t("time.now")}</Label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setInput("now")}
            >
              {t("time.useNow")}
            </Button>
          </div>
          <div className="grid gap-2 font-mono text-[12px] leading-relaxed text-text-primary sm:grid-cols-2">
            <div>
              <span className="text-text-tertiary">UTC</span>
              <div className="truncate">{nowFormats.isoUtc}</div>
            </div>
            <div>
              <span className="text-text-tertiary">{timeZone}</span>
              <div className="truncate">{nowFormats.zoneFull}</div>
            </div>
            <div>
              <span className="text-text-tertiary">unix ms</span>
              <div className="truncate">{nowFormats.unixMillis}</div>
            </div>
            <div>
              <span className="text-text-tertiary">unix s</span>
              <div className="truncate">{nowFormats.unixSeconds}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={inputId} className="text-[12px] font-medium text-text-secondary">
                {t("time.input")}
              </Label>
              <Input
                id={inputId}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                placeholder={t("time.inputPlaceholder")}
                className={monoField}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[12px] font-medium text-text-secondary">
                {t("time.unit")}
              </Label>
              <ToggleGroup
                type="single"
                value={unitMode}
                onValueChange={(v) => {
                  if (v) setUnitMode(v as UnitMode);
                }}
                className="gap-1"
              >
                {UNIT_MODES.map((mode) => (
                  <ToggleGroupItem key={mode.id} value={mode.id} size="sm">
                    {mode.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={zoneId} className="text-[12px] font-medium text-text-secondary">
              {t("time.timezone")}
            </Label>
            <select
              id={zoneId}
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className={`${monoField} cursor-pointer rounded-md border px-3 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50`}
            >
              {zoneOptions.map((z) => (
                <option key={z} value={z}>
                  {z === localZone ? `${z} (${t("time.timezone.local")})` : z}
                </option>
              ))}
            </select>
          </div>

          {(detected || error) && (
            <p
              role={error ? "alert" : undefined}
              className={`text-[12px] ${error ? "text-fail" : "text-text-tertiary"}`}
            >
              {error ?? detected}
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-hidden rounded-[22px] border border-border">
              <table className="w-full text-left text-[13px]">
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={i % 2 === 0 ? "bg-bg-primary" : "bg-secondary/40"}
                    >
                      <th
                        scope="row"
                        className="w-[140px] px-3 py-2 align-middle text-[12px] font-medium text-text-secondary"
                      >
                        {t(row.labelKey)}
                      </th>
                      <td className="min-w-0 px-2 py-2 align-middle font-mono text-[12px] text-text-primary">
                        <span className="break-all">{row.value}</span>
                      </td>
                      <td className="w-[1%] whitespace-nowrap px-2 py-1.5 align-middle">
                        <CopyButton value={row.value} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setInput("");
                setError(null);
                setRows([]);
                setDetected(null);
              }}
              disabled={!input && rows.length === 0}
            >
              {t("time.clear")}
            </Button>
            <span className="text-[12px] text-text-tertiary">{t("time.hint.live")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
