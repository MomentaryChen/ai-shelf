import { useLayoutEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PaneAgentStatus } from "../../shared/pane-agent-state.js";
import { useLocale } from "../i18n/LocaleProvider";
import { alignAnimationsToTimeline } from "../utils/animation-sync";

const STATUS_CLASS: Record<PaneAgentStatus, string> = {
  idle: "bg-chrome-text-dim/50",
  running: "pane-agent-dot-running bg-chrome-ui-accent",
  waiting_input: "pane-agent-dot-attention bg-chrome-ui-accent",
  stalled: "pane-agent-dot-stalled bg-warn/90",
};

/**
 * Keep the dot's pulse on the shared timeline phase. Pane headers remount on
 * profile switch and layout changes; without this the pulse restarts from
 * frame 0 each time. `animationstart` covers a pulse that only begins later
 * (status change, or a pane un-hidden after maximize).
 */
function useTimelinePulse<T extends HTMLElement>(status: PaneAgentStatus | null | undefined) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    alignAnimationsToTimeline(el);
    const onStart = () => alignAnimationsToTimeline(el);
    el.addEventListener("animationstart", onStart);
    return () => el.removeEventListener("animationstart", onStart);
  }, [status]);
  return ref;
}

export function PaneAgentStatusDot({ status }: { status: PaneAgentStatus }) {
  const { t } = useLocale();
  const labelKey = `pane.agent.status.${status}` as const;
  const dotRef = useTimelinePulse<HTMLSpanElement>(status);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center`}
          aria-label={t(labelKey)}
        >
          <span
            ref={dotRef}
            className={`h-2 w-2 rounded-full ${STATUS_CLASS[status]}`}
            aria-hidden
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {t(labelKey)}
      </TooltipContent>
    </Tooltip>
  );
}

/** Compact status light for sidebar rows; renders nothing when idle. */
export function PaneAgentStatusLight({
  status,
  className = "",
}: {
  status: PaneAgentStatus | null | undefined;
  className?: string;
}) {
  const { t } = useLocale();
  const lightRef = useTimelinePulse<HTMLSpanElement>(status);
  if (!status || status === "idle") return null;
  const label = t(`pane.agent.status.${status}` as const);
  return (
    <span
      ref={lightRef}
      role="status"
      aria-label={label}
      title={label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_CLASS[status]} ${className}`}
    />
  );
}
