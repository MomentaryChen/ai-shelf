import type { PaneInfo } from "../terminal/split-tree";
import { profileToolLabel } from "../utils/available-tools";
import { useLocale } from "../i18n/LocaleProvider";

/** Bottom status strip — path, shell type, live session (Part I desktop chrome). */
export function TerminalStatusBar({ pane }: { pane: PaneInfo | null }) {
  const { t } = useLocale();
  if (!pane) return null;

  const cwd = pane.cwd?.trim() || "—";
  const shell = profileToolLabel(pane.tool);

  return (
    <div
      className="flex h-6 shrink-0 items-center gap-3 border-t border-chrome-border bg-chrome-bg px-3 text-[11px] text-chrome-text-muted"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" aria-hidden />
        <span className="shrink-0 text-chrome-text-subtle">{t("status.live")}</span>
      </span>
      <span className="min-w-0 truncate font-mono tabular-nums" title={cwd}>
        {cwd}
      </span>
      <span className="ml-auto shrink-0 text-chrome-text-subtle">{shell}</span>
    </div>
  );
}
