import { useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { waitDuration, type AttentionInboxItem } from "../../shared/attention-inbox.js";
import { useLocale } from "../i18n/LocaleProvider";
import { BackgroundAttentionBadge } from "./BackgroundAttentionBadge";
import { EmptyState } from "./EmptyState";

/** One queued pane, resolved for display (labels come from the live layout). */
export interface AttentionInboxViewItem extends AttentionInboxItem {
  paneLabel: string;
  /** Profile the pane belongs to; null when unknown. */
  profileName: string | null;
}

const TICK_MS = 5_000;

/**
 * Title-bar entry point for the attention inbox: a count badge that opens the
 * persistent list of panes waiting on the user. Choosing one jumps to it.
 */
export function AttentionInbox({
  items,
  onOpen,
  onJumpNext,
  jumpShortcut,
  embedded = false,
}: {
  items: AttentionInboxViewItem[];
  onOpen: (paneId: string) => void;
  onJumpNext: () => void;
  /** Formatted "jump to next waiting pane" combo, when bound. */
  jumpShortcut?: string;
  embedded?: boolean;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** Closed by choosing a pane: keep focus on that terminal, not the trigger. */
  const selectedRef = useRef(false);

  // Tick the "waiting for" labels only while the list is open.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [open]);

  const count = items.length;
  const label = count > 0 ? t("pane.agent.inbox.buttonCount", { count }) : t("pane.agent.inbox.button");

  const waitLabel = (since: number) => {
    const d = waitDuration(now - since);
    return d.unit === "now"
      ? t("pane.agent.inbox.wait.now")
      : t(`pane.agent.inbox.wait.${d.unit}` as const, { n: d.value });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="chromeOutline"
          size="sm"
          className={`relative ${embedded ? "min-h-7 px-2 text-[12px]" : ""} ${
            count > 0 ? "border-chrome-ui-accent/60 text-chrome-text" : ""
          }`}
          aria-label={label}
          title={jumpShortcut ? `${label} (${jumpShortcut})` : label}
          data-testid="attention-inbox-button"
        >
          <Inbox />
          {count > 0 && (
            <span className="min-w-4 rounded-full bg-chrome-ui-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent tabular-nums">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(360px,calc(100vw-1.5rem))] p-1"
        onCloseAutoFocus={(e) => {
          if (selectedRef.current) e.preventDefault();
          selectedRef.current = false;
        }}
      >
        <DropdownMenuLabel className="flex items-center gap-2">
          <span className="flex-1">{t("pane.agent.inbox.title")}</span>
          {count > 0 && <span className="tabular-nums">{count}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <EmptyState
            tone="chrome"
            compact
            icon={<Inbox className="size-5" />}
            title={t("pane.agent.inbox.empty")}
            description={t("pane.agent.inbox.emptyHint")}
          />
        ) : (
          <>
            <div className="max-h-[min(420px,60vh)] overflow-y-auto">
              {items.map((item) => (
                <DropdownMenuItem
                  key={item.paneId}
                  onSelect={() => {
                    selectedRef.current = true;
                    onOpen(item.paneId);
                  }}
                  title={t("pane.agent.inbox.openPane")}
                  className="items-start gap-2 py-2"
                >
                  <BackgroundAttentionBadge kind={item.kind} className="mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                        {item.profileName
                          ? t("pane.agent.bg.paneLabel", {
                              profile: item.profileName,
                              pane: item.paneLabel,
                            })
                          : item.paneLabel}
                      </span>
                      <span className="shrink-0 text-[11px] text-chrome-text-muted tabular-nums">
                        {waitLabel(item.since)}
                      </span>
                    </div>
                    <div className="text-[11px] text-chrome-text-muted">
                      {t(`pane.agent.bg.kind.${item.kind}` as const)}
                      {item.exitCode !== undefined &&
                        ` · ${t("pane.agent.inbox.exitCode", { code: item.exitCode })}`}
                    </div>
                    {item.line && (
                      <div className="mt-0.5 truncate font-mono text-[11px] text-chrome-text-subtle">
                        {item.line}
                      </div>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                selectedRef.current = true;
                onJumpNext();
              }}
              className="text-[12px]"
            >
              {t("pane.agent.inbox.jumpNext")}
              {jumpShortcut && <DropdownMenuShortcut>{jumpShortcut}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
