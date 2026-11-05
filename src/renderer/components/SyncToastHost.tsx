import { useEffect } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDismissibleSurface } from "../hooks/useDismissibleSurface";
import { subscribeSyncToast, type SyncToast } from "../sync-status-store.js";

export function SyncToastHost() {
  const { item: toast, exiting, show, hide } = useDismissibleSurface<SyncToast>();

  useEffect(() => {
    return subscribeSyncToast((next) => {
      if (next) show(next);
      else hide();
    });
  }, [show, hide]);

  if (!toast) return null;

  const isSuccess = toast.variant === "success";

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[100] max-w-[min(320px,calc(100vw-1.5rem))]"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          exiting ? "ui-toast-exit" : "ui-toast-enter",
          "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[11px] shadow-lg backdrop-blur-sm",
          isSuccess
            ? "border-chrome-ui-accent/35 bg-chrome-surface-raised/95 text-chrome-text"
            : "border-fail/40 bg-chrome-surface-raised/95 text-fail",
        )}
      >
        <span
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
            isSuccess ? "bg-chrome-ui-accent/15 text-chrome-accent-text" : "bg-fail/10 text-fail"
          }`}
        >
          {isSuccess ? <Check className="size-3" strokeWidth={2.5} /> : <X className="size-3" />}
        </span>
        <p className="min-w-0 leading-snug">{toast.message}</p>
      </div>
    </div>
  );
}
