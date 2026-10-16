import { useEffect } from "react";
import { X } from "lucide-react";
import type { BackgroundAgentNotice } from "../hooks/usePaneAgentAwareness";
import { useLocale } from "../i18n/LocaleProvider";
import { BackgroundAttentionBadge } from "./BackgroundAttentionBadge";

export interface BackgroundAgentToast extends BackgroundAgentNotice {
  id: number;
}

const AUTO_DISMISS_MS = 8_000;

function ToastItem({
  toast,
  onOpen,
  onDismiss,
}: {
  toast: BackgroundAgentToast;
  onOpen: (toast: BackgroundAgentToast) => void;
  onDismiss: (id: number) => void;
}) {
  const { t } = useLocale();

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id]);

  return (
    <div
      className="pointer-events-auto flex items-start gap-2 rounded-lg border border-chrome-border bg-chrome-surface-raised/95 px-3 py-2.5 text-[11px] text-chrome-text shadow-lg backdrop-blur-sm"
      role="status"
    >
      <BackgroundAttentionBadge kind={toast.kind} className="mt-1" />
      <button
        type="button"
        onClick={() => onOpen(toast)}
        className="min-w-0 flex-1 cursor-pointer text-left"
        title={t("pane.agent.bg.toastOpen")}
      >
        <p className="truncate font-medium leading-snug">{toast.title}</p>
        <p className="leading-snug text-chrome-text-muted">{toast.body}</p>
      </button>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 cursor-pointer rounded p-0.5 text-chrome-text-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text"
        aria-label={t("pane.agent.bg.toastDismiss")}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/** In-app toasts for background profile agents; clicking one opens that profile/pane. */
export function BackgroundAgentToasts({
  toasts,
  onOpen,
  onDismiss,
}: {
  toasts: BackgroundAgentToast[];
  onOpen: (toast: BackgroundAgentToast) => void;
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-10 right-3 z-[100] flex w-[min(320px,calc(100vw-1.5rem))] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
