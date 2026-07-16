import type { McpSyncPreviewItem } from "../types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "../i18n/LocaleProvider";

export function McpSyncPreviewDialog({
  open,
  items,
  syncing,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  items: McpSyncPreviewItem[];
  syncing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();

  const adds = items.filter((i) => i.action === "add");
  const skips = items.filter((i) => i.action === "skip");
  const conflicts = items.filter((i) => i.action === "conflict");
  const blocked = items.filter((i) => i.action === "blocked");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("healthMonitor.mcpPreviewTitle")}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-text-secondary">{t("healthMonitor.mcpPreviewHint")}</p>

        {blocked.length > 0 && (
          <section className="rounded-lg border border-fail/40 bg-fail/5 p-3">
            <p className="mb-2 text-xs font-medium text-fail">
              {t("healthMonitor.mcpPreviewBlocked", { count: blocked.length })}
            </p>
            <ul className="space-y-1 text-xs text-text-primary">
              {blocked.map((item) => (
                <li key={`blocked:${item.targetTool}:${item.serverName}`}>
                  {item.serverName} → {item.targetTool}
                  {item.reason ? ` (${item.reason})` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        {conflicts.length > 0 && (
          <section className="rounded-lg border border-warn/40 bg-warn/5 p-3">
            <p className="mb-2 text-xs font-medium text-warn">
              {t("healthMonitor.mcpPreviewConflicts", { count: conflicts.length })}
            </p>
            <ul className="space-y-2 text-xs">
              {conflicts.map((item) => (
                <li key={`${item.targetTool}:${item.serverName}`} className="rounded bg-bg-primary/60 p-2">
                  <p className="font-medium">
                    {item.serverName} → {item.targetTool}
                  </p>
                  <p className="mt-1 text-text-tertiary">{t("healthMonitor.mcpPreviewConflictSkip")}</p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-text-secondary">
                      {t("healthMonitor.mcpPreviewShowDiff")}
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <pre className="overflow-x-auto rounded bg-bg-primary p-2 font-mono text-[10px]">
                        {item.existingJson}
                      </pre>
                      <pre className="overflow-x-auto rounded bg-bg-primary p-2 font-mono text-[10px]">
                        {item.incomingJson}
                      </pre>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}

        {adds.length > 0 && (
          <section className="rounded-lg border border-border bg-bg-primary/40 p-3">
            <p className="mb-2 text-xs font-medium text-ok">
              {t("healthMonitor.mcpPreviewAdds", { count: adds.length })}
            </p>
            <ul className="space-y-2 text-xs">
              {adds.map((item) => (
                <li key={`${item.targetTool}:${item.serverName}`}>
                  <p className="font-medium">
                    + {item.serverName} → {item.targetTool}
                    {item.sourceTool ? ` (${t("healthMonitor.mcpPreviewFrom", { tool: item.sourceTool })})` : ""}
                  </p>
                  {item.incomingJson && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-text-secondary">
                        {t("healthMonitor.mcpPreviewShowEntry")}
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-bg-primary p-2 font-mono text-[10px]">
                        {item.incomingJson}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {skips.length > 0 && (
          <p className="text-xs text-text-tertiary">
            {t("healthMonitor.mcpPreviewSkips", { count: skips.length })}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={syncing}>
            {t("healthMonitor.mcpPreviewCancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={syncing || adds.length === 0}>
            {syncing
              ? t("inventory.diffFix.syncing")
              : t("healthMonitor.mcpPreviewConfirm", { count: adds.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
