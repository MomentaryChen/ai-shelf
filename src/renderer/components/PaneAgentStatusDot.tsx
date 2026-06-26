import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PaneAgentStatus } from "../../shared/pane-agent-state.js";
import { useLocale } from "../i18n/LocaleProvider";

const STATUS_CLASS: Record<PaneAgentStatus, string> = {
  idle: "bg-chrome-text-dim/50",
  running: "pane-agent-dot-running bg-chrome-ui-accent",
  waiting_input: "pane-agent-dot-attention bg-[var(--clay,#C97B5A)]",
  stalled: "pane-agent-dot-stalled bg-amber-500/90",
};

export function PaneAgentStatusDot({ status }: { status: PaneAgentStatus }) {
  const { t } = useLocale();
  const labelKey = `pane.agent.status.${status}` as const;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center`}
          aria-label={t(labelKey)}
        >
          <span
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
