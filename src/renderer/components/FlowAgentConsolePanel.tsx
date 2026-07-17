import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useFlowConsole } from "../hooks/useFlowConsole";
import { useLocale } from "../i18n/LocaleProvider";
import { stripAnsi } from "../utils/strip-ansi";

type Props = {
  runId: string;
  /** Fallback phase label from run state when chunks have not set one yet. */
  phaseId?: string | null;
  live?: boolean;
};

export function FlowAgentConsolePanel({ runId, phaseId = null, live = false }: Props) {
  const { t } = useLocale();
  const consoleView = useFlowConsole(runId);
  const [open, setOpen] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);
  const stickRef = useRef(true);

  const displayText = stripAnsi(consoleView.text);
  const hasText = Boolean(displayText.trim());
  const activePhase = consoleView.phaseId ?? phaseId;

  useEffect(() => {
    if (!open || !stickRef.current || !preRef.current) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [displayText, open]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="rounded-[28px] border border-border bg-bg-secondary p-5 shadow-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,123,90,0.35)]"
          >
            <div className="min-w-0">
              <h2 className="text-[13px] font-medium text-text-primary">{t("flow.console.panelTitle")}</h2>
              <p className="mt-1 text-[12px] text-text-secondary">
                {live
                  ? activePhase
                    ? t("flow.console.livePhase", { phase: activePhase })
                    : t("flow.console.live")
                  : t("flow.console.finished")}
              </p>
            </div>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-4">
            {consoleView.truncated && (
              <p className="mb-2 text-[12px] text-text-secondary">{t("flow.console.truncated")}</p>
            )}

            {!hasText ? (
              <div className="rounded-[20px] border border-dashed border-border bg-bg-primary px-4 py-8 text-center">
                <p className="text-[13px] text-text-secondary">
                  {live ? t("flow.console.waiting") : t("flow.console.empty")}
                </p>
              </div>
            ) : (
              <pre
                ref={preRef}
                className="max-h-[min(280px,40vh)] overflow-auto whitespace-pre-wrap break-words rounded-[20px] border border-border bg-bg-primary px-4 py-3 font-mono text-[12px] leading-[1.45] text-text-primary tabular-nums"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                }}
              >
                {displayText}
              </pre>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
