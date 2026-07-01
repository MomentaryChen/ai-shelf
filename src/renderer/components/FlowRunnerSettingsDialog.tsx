import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseFlowDocument } from "../../shared/flow-parse.js";
import type { FlowDefinition } from "../../shared/flow-types.js";
import type { ProfileInfo } from "../types";
import { FlowRunnerSettingsEditor } from "./FlowRunnerSettingsEditor";
import { useLocale } from "../i18n/LocaleProvider";

type Props = {
  flowId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function FlowRunnerSettingsDialog({ flowId, onClose, onSaved }: Props) {
  const { t } = useLocale();
  const [flowDef, setFlowDef] = useState<FlowDefinition | null>(null);
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

  const title = useMemo(() => t("flow.runner.dialogTitle", { id: flowId }), [flowId, t]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[min(88vh,760px)] max-w-lg flex-col gap-0 overflow-hidden border-[var(--sand)] bg-[var(--surface)] p-0 text-[var(--ink)]"
        data-surface="warm"
      >
        <DialogHeader className="shrink-0 border-b border-[var(--sand)] px-5 py-4 pr-12">
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-[13px] text-[var(--muted)]">{t("flow.source.loading")}</p>
          ) : loadError ? (
            <p className="py-8 text-center text-[13px] text-red-700">{loadError}</p>
          ) : flowDef ? (
            <FlowRunnerSettingsEditor
              flowId={flowId}
              flowDef={flowDef}
              claudeModels={claudeModels}
              cursorModels={cursorModels}
              profiles={profiles}
              onSaved={() => {
                onSaved();
                onClose();
              }}
              embedded
              stickyFooter
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
