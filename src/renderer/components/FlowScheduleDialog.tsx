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
        className="max-w-lg border-[var(--sand)] bg-[var(--surface)] text-[var(--ink)]"
        data-surface="warm"
      >
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">
            {t("flow.schedule.dialogTitle", { id: flowId })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-[13px] text-[var(--muted)]">{t("flow.source.loading")}</p>
        ) : loadError ? (
          <p className="py-8 text-center text-[13px] text-red-700">{loadError}</p>
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
      </DialogContent>
    </Dialog>
  );
}
