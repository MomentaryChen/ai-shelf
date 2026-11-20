import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/index.js";
import type { TaskDef, TaskRunOutput, TaskRunRecord, TaskRunStatus } from "../types";
import { toolDisplayName } from "../../tool-sort.js";
import {
  formatCostUsd,
  formatRunDuration,
  formatTokenCount,
  runStatusTone,
} from "../tasks/task-utils.js";
import { ConfirmDialog } from "./ConfirmDialog";
import { Spinner } from "./Spinner";

const STATUS_KEY: Record<TaskRunStatus, MessageKey> = {
  running: "tasks.runs.status.running",
  exited: "tasks.runs.status.exited",
  closed: "tasks.runs.status.closed",
  interrupted: "tasks.runs.status.interrupted",
  "prompt-not-sent": "tasks.runs.status.promptNotSent",
};

const STATUS_HINT_KEY: Record<TaskRunStatus, MessageKey> = {
  running: "tasks.runs.statusHint.running",
  exited: "tasks.runs.statusHint.exited",
  closed: "tasks.runs.statusHint.closed",
  interrupted: "tasks.runs.statusHint.interrupted",
  "prompt-not-sent": "tasks.runs.statusHint.promptNotSent",
};

const TONE_CLASS = {
  live: "bg-accent/15 text-accent",
  ok: "bg-ok/15 text-ok",
  neutral: "bg-bg-primary/70 text-text-secondary",
  warn: "bg-warn/15 text-warn",
} as const;

export function useRunTime(locale: string) {
  return useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const sameYear = d.getFullYear() === new Date().getFullYear();
      return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en", {
        ...(sameYear ? {} : { year: "numeric" }),
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    },
    [locale],
  );
}

export function RunStatusPill({ run }: { run: Pick<TaskRunRecord, "status" | "exitCode"> }) {
  const { t } = useLocale();
  const tone = runStatusTone(run.status, run.exitCode);
  const code = String(run.exitCode ?? "?");
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px]", TONE_CLASS[tone])}
      title={t(STATUS_HINT_KEY[run.status], { code })}
    >
      {tone === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />}
      {t(STATUS_KEY[run.status], { code })}
    </span>
  );
}

/** Elapsed time; unknown for runs whose end was not recorded (app crash). */
function runDuration(run: TaskRunRecord): string | null {
  if (!run.endedAt && run.status !== "running") return null;
  return formatRunDuration(run.startedAt, run.endedAt);
}

function CostText({ run }: { run: TaskRunRecord }) {
  const { t } = useLocale();
  const cost = formatCostUsd(run.usage?.costUsd);
  return cost ? (
    <span title={t("tasks.runs.costHint")}>≈ {cost}</span>
  ) : (
    <span title={t("tasks.runs.costUnknownHint")}>{t("tasks.runs.costUnknown")}</span>
  );
}

/** Run history of one task: a list, and a detail view with the run's output. */
export function TaskRunsDialog({
  task,
  onClose,
  onChanged,
}: {
  task: TaskDef | null;
  onClose: () => void;
  /** History changed (deleted / cleared): the page refreshes its last-run badges. */
  onChanged: () => void;
}) {
  const { t, locale } = useLocale();
  const fmtTime = useRunTime(locale);
  const [shownTask, setShownTask] = useState<TaskDef | null>(task);
  const [runs, setRuns] = useState<TaskRunRecord[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!task) return;
    setShownTask(task);
    setSelectedId(null);
    setError(null);
    setRuns(null);
  }, [task]);

  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    setLoadFailed(false);
    window.api
      .tasksRunsList(task.id)
      .then((list) => !cancelled && setRuns(list))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [task, tick]);

  const refresh = () => setTick((n) => n + 1);
  const selected = runs?.find((r) => r.id === selectedId) ?? null;

  const clearAll = async () => {
    setConfirmClear(false);
    if (!shownTask) return;
    const res = await window.api.tasksRunsClear(shownTask.id).catch((e: unknown) => ({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }));
    if (!res.ok) setError(t("tasks.runs.clearFailed", { error: res.error ?? "" }));
    refresh();
    onChanged();
  };

  const deleteRun = async (run: TaskRunRecord) => {
    const res = await window.api.tasksRunDelete(run.taskId, run.id).catch((e: unknown) => ({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }));
    if (!res.ok) {
      setError(t("tasks.runs.deleteFailed", { error: res.error ?? "" }));
      return;
    }
    setSelectedId(null);
    refresh();
    onChanged();
  };

  if (!shownTask) return null;
  const hasFinished = runs?.some((r) => r.status !== "running") ?? false;

  return (
    <>
      <Dialog open={task !== null} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="flex h-[min(88vh,820px)] max-w-4xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{t("tasks.runs.title", { name: shownTask.name })}</DialogTitle>
            <DialogDescription className="text-[12px]">{t("tasks.runs.desc")}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            {selected && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                <ArrowLeft />
                {t("tasks.runs.back")}
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw />
              {t("tasks.runs.refresh")}
            </Button>
            {selected ? (
              selected.status !== "running" && (
                <Button variant="ghost" size="sm" onClick={() => void deleteRun(selected)}>
                  <Trash2 />
                  {t("tasks.runs.delete")}
                </Button>
              )
            ) : (
              hasFinished && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
                  <Trash2 />
                  {t("tasks.runs.clear")}
                </Button>
              )
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-fail/10 px-3 py-2 text-[12px] text-fail">
              {error}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadFailed ? (
              <p className="py-10 text-center text-[13px] text-chrome-text-muted">{t("tasks.runs.loadFailed")}</p>
            ) : runs === null ? (
              <Spinner label={t("tasks.runs.loading")} />
            ) : selected ? (
              <RunDetail run={selected} tick={tick} fmtTime={fmtTime} />
            ) : runs.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-chrome-text-muted">{t("tasks.runs.empty")}</p>
            ) : (
              <ul className="space-y-1.5">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(run.id)}
                      className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-lg border border-chrome-border-subtle px-3 py-2.5 text-left transition-colors hover:border-chrome-border-hover hover:bg-chrome-hover"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-chrome-text">
                        <span className="font-medium">{fmtTime(run.startedAt)}</span>
                        <RunStatusPill run={run} />
                        <span className="text-[12px] text-chrome-text-muted">{toolDisplayName(run.tool)}</span>
                      </span>
                      <span className="text-right text-[12px] tabular-nums text-chrome-text-secondary">
                        <CostText run={run} />
                      </span>
                      <span className="min-w-0 truncate text-[12px] text-chrome-text-muted">
                        {run.variables
                          ? Object.entries(run.variables)
                              .map(([k, v]) => `${k}=${v.split("\n")[0]}`)
                              .join("  ·  ")
                          : run.cwd}
                      </span>
                      <span className="text-right text-[12px] tabular-nums text-chrome-text-muted">
                        {runDuration(run) ?? "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClear}
        title={t("tasks.runs.clearTitle")}
        description={t("tasks.runs.clearDesc", { name: shownTask.name })}
        confirmLabel={t("tasks.runs.clearConfirm")}
        confirmVariant="destructive"
        defaultFocus="cancel"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearAll()}
      />
    </>
  );
}

function RunDetail({
  run,
  tick,
  fmtTime,
}: {
  run: TaskRunRecord;
  tick: number;
  fmtTime: (iso: string) => string;
}) {
  const { t } = useLocale();
  const [output, setOutput] = useState<TaskRunOutput | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<"conversation" | "terminal">("conversation");

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    window.api
      .tasksRunOutput(run.taskId, run.id)
      .then((out) => {
        if (cancelled) return;
        if (!out) setFailed(true);
        setOutput(out);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [run.taskId, run.id, tick]);

  const hasConversation = !!output?.conversation?.length;
  const activeTab = hasConversation ? tab : "terminal";
  const usage = run.usage;
  const duration = runDuration(run);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-4">
        <Meta label={t("tasks.runs.started")}>{fmtTime(run.startedAt)}</Meta>
        <Meta label={t("tasks.runs.duration")}>{duration ?? "—"}</Meta>
        <Meta label={t("tasks.runs.cost")}>
          <CostText run={run} />
        </Meta>
        <Meta label={t("tasks.runs.tool")}>{toolDisplayName(run.tool)}</Meta>
        <div className="col-span-2 sm:col-span-4">
          <RunStatusPill run={run} />
          <span className="ml-2 text-chrome-text-muted">
            {t(STATUS_HINT_KEY[run.status], { code: String(run.exitCode ?? "?") })}
          </span>
        </div>
        {usage && (
          <div className="col-span-2 text-chrome-text-muted sm:col-span-4">
            {usage.model ? `${usage.model} · ` : ""}
            {t("tasks.runs.tokens", {
              input: formatTokenCount(usage.inputTokens),
              output: formatTokenCount(usage.outputTokens),
              cache: formatTokenCount(usage.cacheReadTokens + usage.cacheWriteTokens),
            })}
          </div>
        )}
        <div className="col-span-2 min-w-0 sm:col-span-4">
          <dt className="text-chrome-text-dim">{t("tasks.runs.folder")}</dt>
          <dd className="truncate font-mono text-chrome-text-secondary" title={run.cwd}>
            {run.cwd}
          </dd>
        </div>
      </dl>

      {run.variables && (
        <section>
          <h4 className="mb-1 text-[12px] font-medium text-chrome-text-secondary">{t("tasks.runs.variables")}</h4>
          <dl className="space-y-1 text-[12px]">
            {Object.entries(run.variables).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="shrink-0 font-mono text-chrome-text-muted">{`{{${k}}}`}</dt>
                <dd className="min-w-0 font-mono break-words whitespace-pre-wrap text-chrome-text">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <details>
        <summary className="cursor-pointer text-[12px] font-medium text-chrome-text-secondary">
          {t("tasks.runs.prompt")}
        </summary>
        <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-chrome-bg px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-chrome-text-secondary">
          {run.prompt}
        </pre>
      </details>

      {run.status === "running" && <p className="text-[12px] text-chrome-text-muted">{t("tasks.runs.liveNote")}</p>}

      {failed ? (
        <p className="text-[12px] text-fail">{t("tasks.runs.outputFailed")}</p>
      ) : !output ? (
        <Spinner />
      ) : (
        <section>
          {hasConversation && (
            <div role="tablist" className="mb-2 flex gap-1 border-b border-chrome-border-subtle">
              {(["conversation", "terminal"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-[12px]",
                    activeTab === id
                      ? "border-accent text-chrome-text"
                      : "border-transparent text-chrome-text-muted hover:text-chrome-text",
                  )}
                >
                  {t(id === "conversation" ? "tasks.runs.tab.conversation" : "tasks.runs.tab.terminal")}
                </button>
              ))}
            </div>
          )}
          {activeTab === "conversation" && output.conversation ? (
            <div className="space-y-2">
              {output.conversation.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg px-3 py-2 text-[13px]",
                    m.role === "user" ? "bg-accent/10" : "bg-chrome-bg",
                  )}
                >
                  <p className="mb-1 text-[11px] font-medium text-chrome-text-muted">
                    {m.role === "user" ? t("tasks.runs.you") : t("tasks.runs.agent")}
                    {m.timestamp ? ` · ${fmtTime(m.timestamp)}` : ""}
                  </p>
                  <p className="break-words whitespace-pre-wrap text-chrome-text">{m.text}</p>
                </div>
              ))}
            </div>
          ) : output.terminal ? (
            <>
              {run.outputTruncated && (
                <p className="mb-2 text-[12px] text-warn">{t("tasks.runs.truncated")}</p>
              )}
              <TerminalReplay data={output.terminal} cols={run.cols} rows={run.rows} />
            </>
          ) : (
            <p className="text-[12px] text-chrome-text-muted">{t("tasks.runs.noOutput")}</p>
          )}
        </section>
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-chrome-text-dim">{label}</dt>
      <dd className="truncate text-chrome-text">{children}</dd>
    </div>
  );
}

/**
 * Read-only xterm that replays recorded output at the run's last terminal size, so agent
 * TUIs (cursor moves, redraws) end up looking like they did on screen.
 */
function TerminalReplay({ data, cols, rows }: { data: string; cols: number; rows: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const term = new Terminal({
      cols: Math.max(20, Math.min(cols || 120, 400)),
      rows: Math.max(10, Math.min(rows || 30, 80)),
      disableStdin: true,
      cursorBlink: false,
      scrollback: 20_000,
      fontSize: 12,
      fontFamily: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace',
      theme: { background: "#0b0d10" },
    });
    term.open(el);
    let cancelled = false;
    // Write in slices so a large log does not stall the dialog.
    const CHUNK = 256 * 1024;
    let offset = 0;
    const pump = () => {
      if (cancelled || offset >= data.length) return;
      const slice = data.slice(offset, offset + CHUNK);
      offset += CHUNK;
      term.write(slice, pump);
    };
    pump();
    return () => {
      cancelled = true;
      term.dispose();
    };
  }, [data, cols, rows]);
  return <div ref={ref} className="max-w-full overflow-x-auto rounded-md bg-[#0b0d10] p-2" />;
}
