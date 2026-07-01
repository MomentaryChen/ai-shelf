import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseFlowDocument } from "../../shared/flow-parse.js";
import type { FlowDefinition } from "../../shared/flow-types.js";
import type { FlowListItem, ProfileInfo } from "../types";
import { FlowRunnerSettingsEditor } from "./FlowRunnerSettingsEditor";
import { FlowScheduleEditor } from "./FlowScheduleEditor";
import { FlowSchedulerPanel } from "./FlowSchedulerPanel";
import { useLocale } from "../i18n/LocaleProvider";

type TaskSchedulerStatus = {
  supported: boolean;
  installed: boolean;
  taskName: string;
};

type Props = {
  flowId: string;
  listItem?: FlowListItem | null;
  schedulerEnabled: boolean;
  schedulerSaving: boolean;
  onSchedulerToggle: () => void;
  taskScheduler: TaskSchedulerStatus | null;
  taskSchedulerBusy: boolean;
  onInstallTaskScheduler: () => void;
  onRemoveTaskScheduler: () => void;
  onClose: () => void;
  onSaved: () => void;
};

export function FlowSettingsDialog({
  flowId,
  listItem,
  schedulerEnabled,
  schedulerSaving,
  onSchedulerToggle,
  taskScheduler,
  taskSchedulerBusy,
  onInstallTaskScheduler,
  onRemoveTaskScheduler,
  onClose,
  onSaved,
}: Props) {
  const { t } = useLocale();
  const [flowDef, setFlowDef] = useState<FlowDefinition | null>(null);
  const [schedule, setSchedule] = useState<string | undefined>(listItem?.schedule);
  const [timezone, setTimezone] = useState<string | undefined>();
  const [claudeModels, setClaudeModels] = useState<string[]>([]);
  const [cursorModels, setCursorModels] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void window.api
      .flowReadFile(flowId)
      .then((file) => {
        if (cancelled) return;
        if (!file) {
          setLoadError(t("flow.source.notFound"));
          setFlowDef(null);
          return;
        }
        const fileName = file.path.split(/[/\\]/).pop() ?? `${flowId}.flow.md`;
        const parsed = parseFlowDocument(file.content, fileName, file.path);
        if ("error" in parsed) {
          setLoadError(parsed.error);
          setFlowDef(null);
          return;
        }
        setFlowDef(parsed);
        setSchedule(parsed.schedule);
        setTimezone(parsed.timezone);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [flowId, t]);

  useEffect(() => {
    let cancelled = false;

    void window.api
      .getInventory()
      .then((inventory) => {
        if (cancelled) return;
        const claude = inventory.find((e) => e.tool === "claude");
        if (claude?.models?.length) setClaudeModels(claude.models);
        const cursor = inventory.find((e) => e.tool === "agent" || e.tool === "cursor");
        if (cursor?.models?.length) setCursorModels(cursor.models);
      })
      .catch(() => {
        /* keep default tool list */
      });

    void window.api
      .profileGroupGetForest()
      .then((forest) => {
        if (cancelled || !forest.success) return;
        const allProfiles = forest.forest?.groups.flatMap((g) => g.profiles) ?? [];
        setProfiles(allProfiles);
      })
      .catch(() => {
        /* profiles optional */
      });

    return () => {
      cancelled = true;
    };
  }, [flowId]);

  const title = useMemo(() => t("flow.settings.dialogTitle", { id: flowId }), [flowId, t]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[min(88vh,800px)] max-w-lg flex-col gap-0 overflow-hidden border-border bg-bg-secondary p-0 text-text-primary"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-[13px] text-text-secondary">{t("flow.source.loading")}</p>
          ) : loadError ? (
            <p className="py-8 text-center text-[13px] text-fail">{loadError}</p>
          ) : flowDef ? (
            <div className="flex flex-col gap-6">
              <FlowSchedulerPanel
                schedulerEnabled={schedulerEnabled}
                schedulerSaving={schedulerSaving}
                onSchedulerToggle={onSchedulerToggle}
                taskScheduler={taskScheduler}
                taskSchedulerBusy={taskSchedulerBusy}
                onInstallTaskScheduler={onInstallTaskScheduler}
                onRemoveTaskScheduler={onRemoveTaskScheduler}
              />

              <section className="border-t border-border pt-6">
                <h3 className="text-[13px] font-medium text-text-primary">{t("flow.schedule.title")}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{t("flow.schedule.hint")}</p>
                <FlowScheduleEditor
                  flowId={flowId}
                  schedule={schedule}
                  timezone={timezone}
                  nextRunAt={listItem?.nextRunAt}
                  onSaved={() => {
                    onSaved();
                  }}
                  embedded
                />
              </section>

              <section className="border-t border-border pt-6">
                <h3 className="text-[13px] font-medium text-text-primary">{t("flow.runner.title")}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{t("flow.runner.hint")}</p>
                <FlowRunnerSettingsEditor
                  flowId={flowId}
                  flowDef={flowDef}
                  claudeModels={claudeModels}
                  cursorModels={cursorModels}
                  profiles={profiles}
                  onSaved={() => {
                    onSaved();
                  }}
                  embedded
                />
              </section>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
