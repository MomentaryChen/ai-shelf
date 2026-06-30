import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { FlowDefinition } from "../../shared/flow-types.js";
import { EmptyState } from "./EmptyState";
import { FlowDagView, type FlowDagPhase } from "./FlowDagView";
import { FlowSourceDialog } from "./FlowSourceDialog";
import { Spinner } from "./Spinner";
import { useLocale } from "../i18n/LocaleProvider";

export function FlowTab() {
  const { t } = useLocale();
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flowDef, setFlowDef] = useState<FlowDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeRun, setActiveRun] = useState<FlowRunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      setError(e instanceof Error ? e.message : String(e));
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
      setError(parsed.error);
      return;
    }
    setFlowDef(parsed);
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (selectedId) {
      setError(null);
      void loadDefinition(selectedId);
    } else {
      setFlowDef(null);
    }
  }, [selectedId, loadDefinition]);

  useEffect(() => {
    const unsub = window.api.onFlowRunState((state) => {
      if (selectedId && state.flowId !== selectedId) return;
      setActiveRun(state);
      if (state.status === "completed" || state.status === "failed") {
        setRunning(false);
      }
    });
    return unsub;
  }, [selectedId]);

  const selected = flows.find((f) => f.id === selectedId) ?? null;

  const dagPhases = useMemo((): FlowDagPhase[] => {
    const base = flowDef?.phases ?? [];
    if (!activeRun || activeRun.flowId !== selectedId) {
      return base.map((p) => ({ id: p.id, label: p.label, status: "pending" as const }));
    }
    return base.map((p) => {
      const live = activeRun.phases.find((x) => x.id === p.id);
      return {
        id: p.id,
        label: p.label,
        status: live?.status ?? "pending",
        message: live?.message,
      };
    });
  }, [flowDef, activeRun, selectedId]);

  const handleRun = async () => {
    if (!selectedId) return;
    setError(null);
    setRunning(true);
    setActiveRun(null);
    const res = await window.api.flowRun(selectedId);
    if (!res.ok) {
      setRunning(false);
      setError(res.error ?? t("flow.run.failed"));
      return;
    }
    if (res.runId) {
      const state = await window.api.flowGetRunState(res.runId);
      if (state) setActiveRun(state);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeleting(true);
    setError(null);
    const res = await window.api.flowDelete(selectedId);
    setDeleting(false);
    if (!res.ok) {
      setError(res.error ?? t("flow.delete.failed"));
      return;
    }
    setDeleteOpen(false);
    setSourceOpen(false);
    setActiveRun(null);
    await refreshList();
  };

  const openFlowsFolder = () => {
    void window.api.flowOpenFlowsDir();
  };

  const showRun = activeRun && activeRun.flowId === selectedId;

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden bg-[var(--cream)] text-[var(--ink)]"
      data-surface="warm"
    >
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-[var(--sand)] bg-[var(--surface)] p-3">
        <div className="px-1 pb-2 text-[13px] font-medium text-[var(--ink)]">{t("flow.sidebar.title")}</div>
        {loading && <Spinner label={t("flow.loading")} />}
        {!loading && flows.length === 0 && (
          <p className="px-1 text-[13px] text-[var(--muted)]">{t("flow.empty")}</p>
        )}
        {flows.map((flow) => (
          <button
            key={flow.id}
            type="button"
            onClick={() => setSelectedId(flow.id)}
            className={`cursor-pointer rounded-[22px] px-3 py-2 text-left text-[13px] transition-colors duration-200 ${
              selectedId === flow.id
                ? "bg-[var(--sand)] font-medium text-[var(--ink)]"
                : "text-[var(--muted)] hover:bg-[var(--sand-deep)] hover:text-[var(--ink)]"
            }`}
          >
            <div>{flow.id}</div>
            {flow.schedule && (
              <div className="mt-0.5 text-[11px] text-[var(--muted)]">{flow.schedule}</div>
            )}
          </button>
        ))}
        <div className="mt-auto pt-2">
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={openFlowsFolder}>
            {t("flow.openFolder")}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          {!selected && !loading && (
            <EmptyState title={t("flow.emptyTitle")} description={t("flow.emptyDesc")} />
          )}

          {selected && flowDef && (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold text-[var(--ink)]">{selected.id}</h1>
                  <p className="mt-1 text-[13px] text-[var(--muted)]">
                    {selected.phaseCount} {t("flow.phases")}
                    {selected.schedule ? ` · ${selected.schedule}` : ` · ${t("flow.manualOnly")}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                    className="rounded-[22px] text-red-700 hover:border-red-300 hover:bg-red-50"
                    disabled={running}
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t("flow.delete")}
                  </Button>
                  <Button
                    type="button"
                    disabled={running || !selected.enabled}
                    onClick={() => void handleRun()}
                    className="rounded-[22px] bg-gradient-to-br from-[var(--clay-soft)] to-[var(--clay)] text-white shadow-[var(--shadow-accent)]"
                  >
                    {running ? t("flow.running") : t("flow.run")}
                  </Button>
                </div>
              </header>

              {error && !showRun && (
                <p className="rounded-[20px] border border-red-200 bg-red-50/80 px-4 py-3 text-[13px] text-red-800">
                  {error}
                </p>
              )}

              <FlowDagView
                phases={dagPhases}
                runner={flowDef.runner}
                httpUrl={flowDef.httpUrl}
                runStatus={showRun ? activeRun!.status : running ? "running" : null}
                runPercent={showRun ? activeRun!.progress.percent : running ? 0 : undefined}
                error={showRun ? activeRun!.error : error}
                outputPath={showRun ? activeRun!.outputPath : null}
                onOpenOutput={
                  showRun && activeRun?.outputPath
                    ? () => void window.api.openPath(activeRun.outputPath!)
                    : undefined
                }
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          className="max-w-md border-[var(--sand)] bg-[var(--surface)] text-[var(--ink)]"
          data-surface="warm"
        >
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold">{t("flow.delete.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] leading-relaxed text-[var(--muted)]">
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
              size="sm"
              className="rounded-[22px] bg-red-600 text-white hover:bg-red-700"
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
