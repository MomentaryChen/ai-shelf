import { useEffect, useRef, useState } from "react";
import { Check, Copy, Cpu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { useLocale } from "../i18n/LocaleProvider";
import {
  formatBytesPerSec,
  formatMemoryPair,
  memoryPercent,
  type HostResourceSnapshot,
} from "../../shared/host-env.js";
import { Card } from "./Card";
import { FlowMarkdownContent } from "./FlowMarkdownContent";
import { SectionHeading } from "./SectionHeading";

const HOST_STATS_POLL_MS = 5_000;

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-text-tertiary motion-safe:animate-[warm-dot-blink_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: `${String(i * 0.2)}s` }}
        />
      ))}
    </span>
  );
}

function formatPercent(value: number | null, fallback: string): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${String(value)}%`;
}

function MeterBar({ percent }: { percent: number | null }) {
  const width = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-deep" aria-hidden>
      <div
        className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-300"
        style={{ width: `${String(width)}%` }}
      />
    </div>
  );
}

function ResourceMeters({ stats }: { stats: HostResourceSnapshot | null }) {
  const { t } = useLocale();
  const dash = t("system.meter.unavailable");
  const cpu = stats?.cpu.usagePercent ?? null;
  const memPct = stats ? memoryPercent(stats.memory.usedBytes, stats.memory.totalBytes) : null;
  const gpuPct = stats?.gpu?.usagePercent ?? null;
  const gpuMem =
    stats?.gpu?.memoryUsedBytes != null && stats.gpu.memoryTotalBytes != null
      ? formatMemoryPair(stats.gpu.memoryUsedBytes, stats.gpu.memoryTotalBytes)
      : null;

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 @lg:grid-cols-4">
      <div className="rounded-[22px] bg-sand px-3.5 py-3">
        <div className="text-[12px] font-medium text-text-secondary">{t("system.meter.cpu")}</div>
        <div className="mt-1 text-[18px] font-medium tabular-nums text-ink">
          {stats ? formatPercent(cpu, dash) : <TypingDots />}
        </div>
        <MeterBar percent={cpu} />
      </div>
      <div className="rounded-[22px] bg-sand px-3.5 py-3">
        <div className="text-[12px] font-medium text-text-secondary">{t("system.meter.memory")}</div>
        <div className="mt-1 text-[18px] font-medium tabular-nums text-ink">
          {stats ? formatMemoryPair(stats.memory.usedBytes, stats.memory.totalBytes) : <TypingDots />}
        </div>
        <MeterBar percent={memPct} />
      </div>
      <div className="rounded-[22px] bg-sand px-3.5 py-3">
        <div className="text-[12px] font-medium text-text-secondary">{t("system.meter.network")}</div>
        <div className="mt-1 flex flex-col gap-0.5 text-[13px] font-medium tabular-nums text-ink">
          {stats ? (
            <>
              <span>
                {t("system.meter.down")} {formatBytesPerSec(stats.network.rxBytesPerSec)}
              </span>
              <span>
                {t("system.meter.up")} {formatBytesPerSec(stats.network.txBytesPerSec)}
              </span>
            </>
          ) : (
            <TypingDots />
          )}
        </div>
      </div>
      <div className="rounded-[22px] bg-sand px-3.5 py-3" title={stats?.gpu?.name ?? undefined}>
        <div className="text-[12px] font-medium text-text-secondary">{t("system.meter.gpu")}</div>
        <div className="mt-1 text-[18px] font-medium tabular-nums text-ink">
          {stats ? formatPercent(gpuPct, dash) : <TypingDots />}
        </div>
        {gpuMem ? (
          <div className="mt-0.5 truncate text-[11px] tabular-nums text-text-secondary">{gpuMem}</div>
        ) : null}
        <MeterBar percent={gpuPct} />
      </div>
    </div>
  );
}

export function SystemToolsTab({ active = true }: { active?: boolean }) {
  const { t, locale } = useLocale();
  const [stats, setStats] = useState<HostResourceSnapshot | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const analyzingRef = useRef(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight || document.hidden || !window.api?.portsHostStats) return;
      inFlight = true;
      try {
        const result = await window.api.portsHostStats();
        if (!cancelled && result.ok) setStats(result.stats);
      } catch {
        /* keep last sample */
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, HOST_STATS_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  const analyzeEnv = async () => {
    if (analyzingRef.current) return;
    if (!window.api?.portsAnalyzeEnv) {
      setAnalyzeError(t("system.error.unavailable"));
      return;
    }
    analyzingRef.current = true;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await window.api.portsAnalyzeEnv(locale);
      if (!result.ok) {
        setReport(null);
        if (result.code === "no-claude") setAnalyzeError(t("system.analyze.error.noClaude"));
        else if (result.code === "timeout") setAnalyzeError(t("system.analyze.error.timeout"));
        else setAnalyzeError(t("system.analyze.error.failed"));
        return;
      }
      setReport(result.report);
    } catch {
      setReport(null);
      setAnalyzeError(t("system.analyze.error.failed"));
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  };

  const copyReport = async () => {
    if (!report) return;
    const ok = await writeClipboardText(report);
    if (!ok) return;
    setCopied(true);
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1600);
  };

  return (
    <>
      <SectionHeading icon={Cpu}>{t("tools.tab.system")}</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
        {t("system.subtitle")}
      </p>
      {stats ? (
        <p className="mb-3 max-w-2xl truncate text-[12px] leading-relaxed text-text-secondary">
          {stats.platform} {stats.release} ({stats.arch}) · {stats.cpu.model} × {stats.cpu.cores}
        </p>
      ) : null}
      <ResourceMeters stats={stats} />

      <Card>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={analyzing}
              className="h-10 px-4"
              onClick={() => void analyzeEnv()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {analyzing ? t("system.analyze.working") : t("system.analyze")}
            </Button>
            {analyzing && <TypingDots />}
          </div>
          <p className="max-w-2xl text-[12px] leading-relaxed text-text-secondary">
            {t("system.analyze.hint")}
          </p>
          {analyzeError && (
            <p className="text-[13px] leading-relaxed text-text-primary" role="alert">
              {analyzeError}
            </p>
          )}
        </div>
      </Card>

      {(report || analyzing) && (
        <Card>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-text-secondary">{t("system.analyze.report")}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!report || analyzing}
                className="h-8 px-2 text-[12px]"
                title={copied ? t("system.analyze.copied") : t("system.analyze.copy")}
                onClick={() => void copyReport()}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden @sm:inline">
                  {copied ? t("system.analyze.copied") : t("system.analyze.copy")}
                </span>
              </Button>
            </div>
            {analyzing && !report ? (
              <p className="flex items-center gap-2 text-[13px] text-text-secondary">
                <TypingDots />
                {t("system.analyze.workingHint")}
              </p>
            ) : report ? (
              <FlowMarkdownContent content={report} />
            ) : null}
          </div>
        </Card>
      )}
    </>
  );
}
