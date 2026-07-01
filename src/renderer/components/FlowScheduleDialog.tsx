import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseFlowDocument } from "../../shared/flow-parse.js";
import type { FlowListItem } from "../types";
import { FlowScheduleEditor } from "./FlowScheduleEditor";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  flowId: string;
  listItem?: FlowListItem | null;
  onClose: () => void;
  onSaved: () => void;
};

export function FlowScheduleDialog({ flowId, listItem, onClose, onSaved }: Props) {
  const { t } = useLocale();
  const [schedule, setSchedule] = useState<string | undefined>(listItem?.schedule);
  const [timezone, setTimezone] = useState<string | undefined>();
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
          return;
        }
        const fileName = file.path.split(/[/\\]/).pop() ?? `${flowId}.flow.md`;
        const parsed = parseFlowDocument(file.content, fileName, file.path);
        if ("error" in parsed) {
          setLoadError(parsed.error);
          return;
        }
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[min(88vh,640px)] max-w-lg flex-col gap-0 overflow-hidden border-border bg-bg-secondary p-0 text-text-primary"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-[15px] font-semibold">
            {t("flow.schedule.dialogTitle", { id: flowId })}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4">
        {loading ? (
          <p className="py-8 text-center text-[13px] text-text-secondary">{t("flow.source.loading")}</p>
        ) : loadError ? (
          <p className="py-8 text-center text-[13px] text-fail">{loadError}</p>
        ) : (
          <FlowScheduleEditor
            flowId={flowId}
            schedule={schedule}
            timezone={timezone}
            nextRunAt={listItem?.nextRunAt}
            onSaved={() => {
              onSaved();
              onClose();
            }}
            embedded
          />
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
