import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, MessageSquare, Plus, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FlowListItem, FlowRunState } from "../types";
import { parseFlowDocument } from "../../shared/flow-parse.js";
import type { FlowDefinition, FlowRunStatus } from "../../shared/flow-types.js";
import { EmptyState } from "./EmptyState";
import { FlowCreateChat } from "./FlowCreateChat";
import { FlowDagView, type FlowDagPhase } from "./FlowDagView";
import { FlowOutputDialog } from "./FlowOutputDialog";
import { FlowOutputPanel } from "./FlowOutputPanel";
import { FlowRunDetailDialog } from "./FlowRunDetailDialog";
import { FlowRunHistoryPanel } from "./FlowRunHistoryPanel";
import { FlowRunnerSettingsDialog } from "./FlowRunnerSettingsDialog";
import { FlowScheduleDialog } from "./FlowScheduleDialog";
import { FlowSchedulerPanel } from "./FlowSchedulerPanel";
import { FlowSourceDialog } from "./FlowSourceDialog";
import { Spinner } from "./Spinner";
import { useLocale } from "../i18n/LocaleProvider";
import { loadSettings } from "../chat-settings";
import { resolveToolLaunchExtraArgs } from "../../tool-launch.js";

function isLiveRunStatus(status: FlowRunStatus | undefined): boolean {
  return status === "running" || status === "pending";
}

function mergeActiveRuns(
  prev: Record<string, FlowRunState>,
  runs: FlowRunState[],
): Record<string, FlowRunState> {
  const next = { ...prev };
  for (const run of runs) {
    next[run.flowId] = run;
  }
  return next;
}

export function FlowTab() {
  const { t } = useLocale();
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flowDef, setFlowDef] = useState<FlowDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRunsByFlowId, setActiveRunsByFlowId] = useState<Record<string, FlowRunState>>({});
  const [startingFlowIds, setStartingFlowIds] = useState<Set<string>>(() => new Set());
  const [cancellingFlowIds, setCancellingFlowIds] = useState<Set<string>>(() => new Set());
  const [errorsByFlowId, setErrorsByFlowId] = useState<Record<string, string>>({});
  const [sourceOpen, setSourceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [schedulerSaving, setSchedulerSaving] = useState(false);
  const [scheduleFlowId, setScheduleFlowId] = useState<string | null>(null);
  const [runnerFlowId, setRunnerFlowId] = useState<string | null>(null);
  const [expandedOutputPath, setExpandedOutputPath] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [chatFlowId, setChatFlowId] = useState<string | undefined>(undefined);
  const [historyRun, setHistoryRun] = useState<FlowRunState | null>(null);
  const [historyRefreshByFlowId, setHistoryRefreshByFlowId] = useState<Record<string, number>>({});
  const [taskScheduler, setTaskScheduler] = useState<{
    supported: boolean;
    installed: boolean;
    taskName: string;
  } | null>(null);
  const [taskSchedulerBusy, setTaskSchedulerBusy] = useState(false);
  const [lastOutput, setLastOutput] = useState<{
    runId: string;
    outputPath: string;
    startedAt: string;
  } | null>(null);
  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const items = await window.api.flowList();
      setFlows(items);
      setSelectedId((current) => {
        if (items.length === 0) return null;
        if (current && items.some((f) => f.id === current)) return current;
        return items[0]!.id;
      });
    } catch (e) {
      setErrorsByFlowId((prev) => ({
        ...prev,
        __global__: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDefinition = useCallback(async (flowId: string) => {
    const file = await window.api.flowReadFile(flowId);
    if (!file) {
      setFlowDef(null);
      return;
    }
    const fileName = file.path.split(/[/\\]/).pop() ?? `${flowId}.flow.md`;
    const parsed = parseFlowDocument(file.content, fileName, file.path);
    if ("error" in parsed) {
      setFlowDef(null);
      if (flowId) {
        setErrorsByFlowId((prev) => ({ ...prev, [flowId]: parsed.error }));
      }
      return;
    }
    setFlowDef(parsed);
  }, []);

  useEffect(() => {
    void refreshList();
    void window.api.flowGetSchedulePrefs().then((prefs) => {
      setSchedulerEnabled(prefs.schedulerEnabled);
    });
    void window.api.flowGetTaskSchedulerStatus().then((status) => {
      setTaskScheduler(status);
    });
    void window.api.flowListActiveRuns().then((runs) => {
      setActiveRunsByFlowId((prev) => mergeActiveRuns(prev, runs));
    });
  }, [refreshList]);

  useEffect(() => {
    if (selectedId) {
      setErrorsByFlowId((prev) => {
        if (!prev[selectedId]) return prev;
        const next = { ...prev };
        delete next[selectedId];
        return next;
      });
      void loadDefinition(selectedId);
    } else {
      setFlowDef(null);
    }
  }, [selectedId, loadDefinition]);

  const loadLastOutput = useCallback(async (flowId: string) => {
    const latest = await window.api.flowGetLatestRunOutput(flowId);
    setLastOutput(latest);
  }, []);

  useEffect(() => {
    const unsub = window.api.onFlowRunState((state) => {
      setActiveRunsByFlowId((prev) => ({ ...prev, [state.flowId]: state }));

      if (state.outputPath && state.flowId === selectedId) {
        setLastOutput({
          runId: state.runId,
          outputPath: state.outputPath,
          startedAt: state.startedAt,
        });
      }

      if (state.status === "completed" || state.status === "failed" || state.status === "cancelled") {
        setStartingFlowIds((prev) => {
          if (!prev.has(state.flowId)) return prev;
          const next = new Set(prev);
          next.delete(state.flowId);
          return next;
        });
        setCancellingFlowIds((prev) => {
          if (!prev.has(state.flowId)) return prev;
          const next = new Set(prev);
          next.delete(state.flowId);
          return next;
        });
        setHistoryRefreshByFlowId((prev) => ({
          ...prev,
          [state.flowId]: (prev[state.flowId] ?? 0) + 1,
        }));
        if (state.flowId === selectedId) {
          void loadLastOutput(state.flowId);
        }
        if (state.status === "failed" && state.flowId === selectedId) {
          setHistoryRun(state);
        }
      }
    });
    return unsub;
  }, [selectedId, loadLastOutput]);

  const selectedActiveRun = selectedId ? (activeRunsByFlowId[selectedId] ?? null) : null;

  useEffect(() => {
    if (!selectedId) {
      setLastOutput(null);
      return;
    }
    void loadLastOutput(selectedId);
  }, [selectedId, loadLastOutput, historyRefreshByFlowId, selectedActiveRun?.updatedAt]);

  const isFlowLive = useCallback(
    (flowId: string) =>
      startingFlowIds.has(flowId) || isLiveRunStatus(activeRunsByFlowId[flowId]?.status),
    [startingFlowIds, activeRunsByFlowId],
  );

  const selected = flows.find((f) => f.id === selectedId) ?? null;
  const scheduleFlow = flows.find((f) => f.id === scheduleFlowId) ?? null;
  const selectedRunning = selectedId ? isFlowLive(selectedId) : false;
  const selectedCancelling = selectedId ? cancellingFlowIds.has(selectedId) : false;
  const selectedError = selectedId ? errorsByFlowId[selectedId] : errorsByFlowId.__global__;

  const effectiveRunnerToolArgs = useMemo(() => {
    if (!flowDef || flowDef.runner !== "claude") return undefined;
    const fromFlow = flowDef.toolArgs?.trim();
    if (fromFlow) return fromFlow;
    const tool = flowDef.agentTool || "claude";
    return resolveToolLaunchExtraArgs(loadSettings().toolLaunchArgs, tool);
  }, [flowDef]);

  const dagPhases = useMemo((): FlowDagPhase[] => {
    const base = flowDef?.phases ?? [];
    if (!selectedActiveRun || selectedActiveRun.flowId !== selectedId || !isLiveRunStatus(selectedActiveRun.status)) {
      return base.map((p) => ({ id: p.id, label: p.label, status: "pending" as const }));
    }
    return base.map((p) => {
      const live = selectedActiveRun.phases.find((x) => x.id === p.id);
      return {
        id: p.id,
        label: p.label,
        status: live?.status ?? "pending",
        message: live?.message,
      };
    });
  }, [flowDef, selectedActiveRun, selectedId]);

  const handleRun = async () => {
    if (!selectedId) return;
    setErrorsByFlowId((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    setStartingFlowIds((prev) => new Set(prev).add(selectedId));
    const settings = loadSettings();
    const res = await window.api.flowRun(selectedId, {
      globalToolLaunchArgs: settings.toolLaunchArgs,
    });
    if (!res.ok) {
      setStartingFlowIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedId);
        return next;
      });
      setErrorsByFlowId((prev) => ({
        ...prev,
        [selectedId]: res.error ?? t("flow.run.failed"),
      }));
      return;
    }
    if (res.runId) {
      const state = await window.api.flowGetRunState(res.runId);
      if (state) {
        setActiveRunsByFlowId((prev) => ({ ...prev, [selectedId]: state }));
      }
      setHistoryRefreshByFlowId((prev) => ({
        ...prev,
        [selectedId]: (prev[selectedId] ?? 0) + 1,
      }));
    }
  };

  const handleCancel = async () => {
    if (!selectedId) return;
    setCancellingFlowIds((prev) => new Set(prev).add(selectedId));
    setErrorsByFlowId((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    const res = await window.api.flowCancelRun(selectedId);
    if (!res.ok) {
      setCancellingFlowIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedId);
        return next;
      });
      setErrorsByFlowId((prev) => ({
        ...prev,
        [selectedId]: res.error ?? t("flow.cancel.failed"),
      }));
    }
  };

  const handleInstallTaskScheduler = async () => {
    setTaskSchedulerBusy(true);
    setErrorsByFlowId((prev) => {
      const next = { ...prev };
      delete next.__global__;
      return next;
    });
    const res = await window.api.flowInstallTaskScheduler();
    setTaskSchedulerBusy(false);
    if (res.status) setTaskScheduler(res.status);
    if (!res.ok) {
      setErrorsByFlowId((prev) => ({
        ...prev,
        __global__: res.error ?? t("flow.taskScheduler.installFailed"),
      }));
    }
  };

  const handleRemoveTaskScheduler = async () => {
    setTaskSchedulerBusy(true);
    setErrorsByFlowId((prev) => {
      const next = { ...prev };
      delete next.__global__;
      return next;
    });
    const res = await window.api.flowRemoveTaskScheduler();
    setTaskSchedulerBusy(false);
    if (res.status) setTaskScheduler(res.status);
    if (!res.ok) {
      setErrorsByFlowId((prev) => ({
        ...prev,
        __global__: res.error ?? t("flow.taskScheduler.removeFailed"),
      }));
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeleting(true);
    setErrorsByFlowId((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    const res = await window.api.flowDelete(selectedId);
    setDeleting(false);
    if (!res.ok) {
      setErrorsByFlowId((prev) => ({
        ...prev,
        [selectedId]: res.error ?? t("flow.delete.failed"),
      }));
      return;
    }
    setDeleteOpen(false);
    setSourceOpen(false);
    setActiveRunsByFlowId((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    setStartingFlowIds((prev) => {
      const next = new Set(prev);
      next.delete(selectedId);
      return next;
    });
    setCancellingFlowIds((prev) => {
      const next = new Set(prev);
      next.delete(selectedId);
      return next;
    });
    await refreshList();
  };

  const openFlowsFolder = () => {
    void window.api.flowOpenFlowsDir();
  };

  const handleSchedulerToggle = async () => {
    setSchedulerSaving(true);
    const next = !schedulerEnabled;
    const res = await window.api.flowSetSchedulePrefs({ schedulerEnabled: next });
    setSchedulerSaving(false);
    if (res.ok && res.prefs) {
      setSchedulerEnabled(res.prefs.schedulerEnabled);
    }
  };

  const showLiveRun =
    Boolean(selectedActiveRun) &&
    selectedActiveRun!.flowId === selectedId &&
    (isLiveRunStatus(selectedActiveRun!.status) || (selectedId ? startingFlowIds.has(selectedId) : false));
  const liveHasOutput = Boolean(selectedRunning && selectedActiveRun?.outputPath);
  const panelOutputRunId = liveHasOutput
    ? selectedActiveRun!.runId
    : lastOutput?.runId ?? (selectedRunning ? selectedActiveRun?.runId : "") ?? "";
  const outputStartedAt = liveHasOutput
    ? selectedActiveRun!.startedAt
    : lastOutput?.startedAt ?? selectedActiveRun?.startedAt ?? null;
  const outputRefreshKey = liveHasOutput
    ? selectedActiveRun!.updatedAt
    : `${lastOutput?.runId ?? ""}-${selectedActiveRun?.updatedAt ?? ""}`;
  const outputWaiting = selectedRunning && !selectedActiveRun?.outputPath && !lastOutput;
  const outputInProgress = selectedRunning && !selectedActiveRun?.outputPath && Boolean(lastOutput);
  const showCreate = createOpen || (!loading && flows.length === 0);

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden bg-bg-primary text-text-primary"
    >
      <aside className="flex w-60 min-h-0 shrink-0 flex-col gap-1 border-r border-border bg-bg-secondary p-3">
        <div className="shrink-0 px-1 pb-2 text-[13px] font-medium text-text-primary">{t("flow.sidebar.title")}</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mb-1 w-full shrink-0 rounded-[22px] border-border text-[13px]"
          onClick={() => {
            setChatFlowId(undefined);
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {t("flow.create.new")}
        </Button>
        {loading && <Spinner label={t("flow.loading")} />}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {!loading && flows.length === 0 && (
          <p className="px-1 text-[13px] text-text-secondary">{t("flow.empty")}</p>
        )}
        {flows.map((flow) => {
          const isSelected = selectedId === flow.id;
          const flowLive = isFlowLive(flow.id);
          return (
            <div
              key={flow.id}
              className={`flex items-stretch gap-0.5 rounded-[22px] ${
                isSelected ? "bg-bg-card" : "hover:bg-bg-elevated/60"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(flow.id)}
                className={`min-w-0 flex-1 cursor-pointer px-3 py-2 text-left text-[13px] transition-colors duration-200 ${
                  isSelected ? "font-medium text-text-primary" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {flowLive && (
                    <span
                      className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent"
                      title={t("flow.running")}
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{flow.id}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-text-secondary">
                  {flow.schedule ?? t("flow.manualOnly")}
                </div>
              </button>
              <button
                type="button"
                title={t("flow.runner.open")}
                aria-label={t("flow.runner.open")}
                onClick={() => setRunnerFlowId(flow.id)}
                className="flex shrink-0 cursor-pointer items-center justify-center rounded-[18px] px-2 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent"
              >
                <Terminal className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                title={t("flow.schedule.open")}
                aria-label={t("flow.schedule.open")}
                onClick={() => setScheduleFlowId(flow.id)}
                className="flex shrink-0 cursor-pointer items-center justify-center rounded-[18px] px-2 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-accent"
              >
                <Clock className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
        </div>
        <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border pt-2">
          <FlowSchedulerPanel
            schedulerEnabled={schedulerEnabled}
            schedulerSaving={schedulerSaving}
            onSchedulerToggle={() => void handleSchedulerToggle()}
            taskScheduler={taskScheduler}
            taskSchedulerBusy={taskSchedulerBusy}
            onInstallTaskScheduler={() => void handleInstallTaskScheduler()}
            onRemoveTaskScheduler={() => void handleRemoveTaskScheduler()}
          />
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={openFlowsFolder}>
            {t("flow.openFolder")}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3">
          {showCreate && (
            <FlowCreateChat
              flowId={chatFlowId}
              onSaved={(flowId) => {
                setCreateOpen(false);
                setChatFlowId(undefined);
                void refreshList().then(() => setSelectedId(flowId));
              }}
              onCancel={
                flows.length > 0
                  ? () => {
                      setCreateOpen(false);
                      setChatFlowId(undefined);
                    }
                  : undefined
              }
            />
          )}

          {!showCreate && !selected && !loading && (
            <EmptyState title={t("flow.emptyTitle")} description={t("flow.emptyDesc")} />
          )}

          {!showCreate && selected && flowDef && (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h1 className="truncate text-[15px] font-semibold text-text-primary">{selected.id}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  {panelOutputRunId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-[22px]"
                      onClick={() => {
                        void window.api.flowReadRunOutput(panelOutputRunId).then((res) => {
                          if (res.ok && res.outputPath) {
                            setExpandedRunId(panelOutputRunId);
                            setExpandedOutputPath(res.outputPath);
                          }
                        });
                      }}
                    >
                      {t("flow.output.expand")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-[22px]"
                    onClick={() => {
                      setChatFlowId(selectedId ?? undefined);
                      setCreateOpen(true);
                    }}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {t("flow.chat.open")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-[22px]"
                    onClick={() => setSourceOpen(true)}
                  >
                    {t("flow.viewSource")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-[22px] text-fail hover:border-fail/40 hover:bg-fail/10"
                    disabled={selectedRunning}
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t("flow.delete")}
                  </Button>
                  <Button
                    type="button"
                    disabled={selectedRunning || !selected.enabled}
                    onClick={() => void handleRun()}
                    className="rounded-[22px]"
                  >
                    {selectedRunning ? t("flow.running") : t("flow.run")}
                  </Button>
                  {selectedRunning && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={selectedCancelling}
                      onClick={() => void handleCancel()}
                      className="rounded-[22px] border-fail/40 text-fail hover:bg-fail/10"
                    >
                      {selectedCancelling ? t("flow.cancelling") : t("flow.cancel")}
                    </Button>
                  )}
                </div>
              </header>

              {selectedError && !showLiveRun && (
                <p className="rounded-[20px] border border-fail/30 bg-fail/10 px-4 py-3 text-[13px] text-fail">
                  {selectedError}
                </p>
              )}

              <FlowDagView
                flowId={selected.id}
                runId={selectedActiveRun?.runId ?? lastOutput?.runId ?? null}
                globalToolLaunchArgs={loadSettings().toolLaunchArgs}
                phases={dagPhases}
                runner={flowDef.runner}
                httpUrl={flowDef.httpUrl}
                agentTool={flowDef.runner === "claude" ? flowDef.agentTool : undefined}
                toolArgs={effectiveRunnerToolArgs}
                cwd={flowDef.cwd}
                profileId={flowDef.profileId}
                schedule={selected.schedule}
                nextRunAt={selected.nextRunAt}
                runStatus={
                  showLiveRun && selectedActiveRun
                    ? selectedActiveRun.status
                    : selectedRunning
                      ? "running"
                      : null
                }
                error={showLiveRun && selectedActiveRun ? selectedActiveRun.error : selectedError}
                outputPath={selectedActiveRun?.outputPath ?? lastOutput?.outputPath ?? null}
              />

              <FlowOutputPanel
                runId={panelOutputRunId}
                runStartedAt={outputStartedAt}
                refreshKey={outputRefreshKey}
                waiting={outputWaiting}
                inProgress={outputInProgress}
                onExpand={(path) => {
                  setExpandedRunId(panelOutputRunId);
                  setExpandedOutputPath(path);
                }}
              />

              <FlowRunHistoryPanel
                flowId={selected.id}
                refreshKey={historyRefreshByFlowId[selected.id] ?? 0}
                onSelectRun={setHistoryRun}
              />
            </>
          )}
        </div>
      </main>

      {sourceOpen && selectedId && (
        <FlowSourceDialog
          flowId={selectedId}
          onClose={() => setSourceOpen(false)}
          onSaved={() => {
            void loadDefinition(selectedId);
            void refreshList();
          }}
        />
      )}

      {runnerFlowId && (
        <FlowRunnerSettingsDialog
          flowId={runnerFlowId}
          onClose={() => setRunnerFlowId(null)}
          onSaved={() => {
            if (selectedId === runnerFlowId) {
              void loadDefinition(runnerFlowId);
            }
          }}
        />
      )}

      {scheduleFlowId && (
        <FlowScheduleDialog
          flowId={scheduleFlowId}
          listItem={scheduleFlow}
          onClose={() => setScheduleFlowId(null)}
          onSaved={() => {
            void refreshList();
            if (selectedId === scheduleFlowId) {
              void loadDefinition(scheduleFlowId);
            }
          }}
        />
      )}

      {expandedOutputPath && (
        <FlowOutputDialog
          filePath={expandedOutputPath}
          runId={expandedRunId ?? undefined}
          onClose={() => {
            setExpandedOutputPath(null);
            setExpandedRunId(null);
          }}
        />
      )}

      {historyRun && (
        <FlowRunDetailDialog
          run={historyRun}
          onClose={() => setHistoryRun(null)}
          onOpenOutput={(path) => {
            setHistoryRun(null);
            setExpandedRunId(historyRun.runId);
            setExpandedOutputPath(path);
          }}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          className="max-w-md border-border bg-bg-secondary text-text-primary"
        >
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold">{t("flow.delete.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] leading-relaxed text-text-secondary">
            {t("flow.delete.body", { id: selected?.id ?? "" })}
          </p>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-[22px]"
              onClick={() => setDeleteOpen(false)}
            >
              {t("flow.source.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="rounded-[22px]"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? t("flow.delete.deleting") : t("flow.delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
