import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FlowTemplateListItem } from "../types";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";

function templateTitleKey(messageId: string): MessageKey {
  return `flow.template.${messageId}.title` as MessageKey;
}

function templateDescKey(messageId: string): MessageKey {
  return `flow.template.${messageId}.desc` as MessageKey;
}

function templateTagKey(messageId: string): MessageKey {
  return `flow.template.${messageId}.tag` as MessageKey;
}

function categoryLabelKey(category: FlowTemplateListItem["category"]): MessageKey {
  return `flow.template.category.${category}` as MessageKey;
}

export function FlowTemplateMarketplace({
  open,
  onClose,
  onInstalled,
}: {
  open: boolean;
  onClose: () => void;
  onInstalled: (flowId: string) => void;
}) {
  const { t } = useLocale();
  const [templates, setTemplates] = useState<FlowTemplateListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await window.api.flowListTemplates();
      setTemplates(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const sorted = useMemo(
    () =>
      [...templates].sort((a, b) => {
        if (a.installed !== b.installed) return a.installed ? 1 : -1;
        return a.id.localeCompare(b.id);
      }),
    [templates],
  );

  const handleInstall = async (item: FlowTemplateListItem) => {
    if (item.installed) return;
    setInstallingId(item.id);
    setError(null);
    try {
      const res = await window.api.flowInstallTemplate(item.id);
      if (!res.ok) {
        setError(res.error ?? t("flow.template.installFailed"));
        return;
      }
      await refresh();
      if (res.flowId) onInstalled(res.flowId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[min(88vh,760px)] max-w-2xl overflow-hidden rounded-[28px] border-border bg-surface p-0 text-ink warm-shadow-card">
        <DialogHeader className="space-y-1 border-b border-sand px-5 py-4 text-left">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted" aria-hidden />
            <DialogTitle className="text-[17px] font-semibold text-ink">
              {t("flow.template.marketplaceTitle")}
            </DialogTitle>
          </div>
          <p className="text-[13px] leading-normal text-muted">{t("flow.template.marketplaceDesc")}</p>
        </DialogHeader>

        <div className="max-h-[min(62vh,560px)] overflow-y-auto overscroll-y-contain px-5 py-4">
          {loading && templates.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted">{t("flow.template.loading")}</p>
          )}
          {!loading && sorted.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted">{t("flow.template.empty")}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {sorted.map((item) => {
              const busy = installingId === item.id;
              const title = t(templateTitleKey(item.messageId));
              const desc = t(templateDescKey(item.messageId));
              const tag = t(templateTagKey(item.messageId));
              return (
                <article
                  key={item.id}
                  className="flex flex-col gap-3 rounded-[22px] border border-sand bg-cream/50 p-4 warm-shadow-card"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] text-ink">
                        {t(categoryLabelKey(item.category))}
                      </span>
                      <span className="rounded-full bg-sand-deep/80 px-2 py-0.5 text-[11px] text-muted">
                        {tag}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
                    <p className="mt-1 text-[13px] leading-normal text-muted">{desc}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={item.installed ? "outline" : "default"}
                    disabled={item.installed || busy}
                    className="w-full rounded-[22px]"
                    onClick={() => void handleInstall(item)}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                        {t("flow.template.installing")}
                      </>
                    ) : item.installed ? (
                      <>
                        <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        {t("flow.template.installed")}
                      </>
                    ) : (
                      t("flow.template.install")
                    )}
                  </Button>
                </article>
              );
            })}
          </div>
          {error && (
            <p className="mt-3 rounded-[14px] bg-sand px-3 py-2 text-[13px] text-ink" role="alert">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
