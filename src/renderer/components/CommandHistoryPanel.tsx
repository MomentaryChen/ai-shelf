import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bookmark, Check, Copy, CornerDownRight, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocale } from "../i18n/LocaleProvider";
import type { PaneInfo } from "../terminal/split-tree";
import { formatCommandDuration } from "../terminal/command-marks";
import {
  buildHistoryRows,
  getCommandHistorySource,
  getCommandHistoryVersion,
  isReplayableCommand,
  subscribeCommandHistory,
  type CommandHistoryGroup,
  type CommandHistoryRow,
} from "../terminal/command-history";
import { writeClipboardText } from "../terminal/xterm-clipboard";
import { paneDisplayLabel } from "../utils/pane-label";

export type SaveCommandResult = "saved" | "exists" | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  panes: PaneInfo[];
  focusedPaneId: string | null;
  /** Panes a re-run reaches (> 1 while broadcast input is on → confirm first). */
  broadcastCount: number;
  onFocusPane: (paneId: string) => void;
  /** Type the command into the pane (through the normal input path) and press Enter. */
  onRerun: (sessionId: string, command: string) => void;
  /** Add to the active profile's saved commands; omitted when there is no profile. */
  onSave?: (command: string) => Promise<SaveCommandResult>;
}

type Scope = "pane" | "all";

const iconBtn =
  "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-chrome-text-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";

function shortCwd(cwd: string | undefined): string {
  if (!cwd) return "";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.length <= 2 ? cwd : `…/${parts.slice(-2).join("/")}`;
}

/**
 * Searchable list of shell commands (OSC 133) for the focused pane or every
 * pane in the workspace: jump to the output, copy it, re-run, or save it.
 */
export function CommandHistoryPanel({
  open,
  onClose,
  panes,
  focusedPaneId,
  broadcastCount,
  onFocusPane,
  onRerun,
  onSave,
}: Props) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("pane");
  const [selected, setSelected] = useState(0);
  const [confirmRerun, setConfirmRerun] = useState<CommandHistoryRow | null>(null);
  const [flash, setFlash] = useState<{ key: string; kind: "copied" | SaveCommandResult } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const version = useSyncExternalStore(subscribeCommandHistory, getCommandHistoryVersion);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setConfirmRerun(null);
    setFlash(null);
    setScope(panes.length > 1 && !focusedPaneId ? "all" : "pane");
    // Reset only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const paneById = useMemo(() => new Map(panes.map((p) => [p.id, p])), [panes]);

  const rows = useMemo(() => {
    if (!open) return [];
    const scoped =
      scope === "all" || !focusedPaneId ? panes : panes.filter((p) => p.id === focusedPaneId);
    const groups: CommandHistoryGroup[] = [];
    for (const p of scoped) {
      const source = getCommandHistorySource(p.sessionId);
      if (!source) continue;
      groups.push({ paneId: p.id, sessionId: p.sessionId, fallbackCwd: p.cwd, items: source.list() });
    }
    return buildHistoryRows(groups, query);
    // `version` changes whenever any pane's history does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, focusedPaneId, panes, query, version]);

  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${selected}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const showFlash = (key: string, kind: "copied" | SaveCommandResult) => {
    setFlash({ key, kind });
    window.setTimeout(() => setFlash((f) => (f?.key === key && f.kind === kind ? null : f)), 1500);
  };

  const jump = (row: CommandHistoryRow) => {
    if (!row.canJump) return;
    onFocusPane(row.paneId);
    onClose();
    // Let the pane take focus / become visible before scrolling its viewport.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => getCommandHistorySource(row.sessionId)?.jump(row.id)),
    );
  };

  const copyOutput = (row: CommandHistoryRow) => {
    const text = getCommandHistorySource(row.sessionId)?.outputText(row.id);
    if (!text) return;
    void writeClipboardText(text).then((ok) => {
      if (ok) showFlash(row.key, "copied");
    });
  };

  const runNow = (row: CommandHistoryRow) => {
    setConfirmRerun(null);
    if (!isReplayableCommand(row.command)) return;
    onFocusPane(row.paneId);
    onClose();
    onRerun(row.sessionId, row.command);
  };

  const rerun = (row: CommandHistoryRow) => {
    if (broadcastCount > 1) setConfirmRerun(row);
    else runNow(row);
  };

  const save = (row: CommandHistoryRow) => {
    if (!onSave || !isReplayableCommand(row.command)) return;
    void onSave(row.command).then((r) => showFlash(row.key, r));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (confirmRerun) return;
    // Enter / Space on a row's action button runs that button, not "jump".
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const row = rows[selected];
      if (!row) return;
      e.preventDefault();
      jump(row);
    }
  };

  const multiPane = panes.length > 1;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[min(80vh,640px)] max-w-2xl flex-col gap-3" onKeyDown={onKeyDown}>
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t("terminal.history.title")}</DialogTitle>
          <DialogDescription className="text-[12px]">{t("terminal.history.desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder={t("terminal.history.search")}
            className="h-8 flex-1 border-chrome-border-subtle bg-chrome-surface font-mono text-[12px]"
          />
          {multiPane && (
            <div className="flex shrink-0 rounded-lg border border-chrome-border-subtle p-0.5 text-[11px]">
              {(["pane", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setScope(s);
                    setSelected(0);
                  }}
                  className={`cursor-pointer rounded-md px-2 py-1 transition-colors ${
                    scope === s
                      ? "bg-chrome-ui-accent-soft text-chrome-text"
                      : "text-chrome-text-muted hover:text-chrome-text"
                  }`}
                >
                  {s === "pane" ? t("terminal.history.scopePane") : t("terminal.history.scopeAll")}
                </button>
              ))}
            </div>
          )}
        </div>

        {confirmRerun && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-chrome-ui-accent/30 bg-chrome-ui-accent/10 px-3 py-2 text-[12px] text-chrome-accent-text">
            <span className="min-w-0 flex-1">
              {t("terminal.history.rerunBroadcast", { count: broadcastCount })}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRerun(null)}>
              {t("profile.dialog.cancel")}
            </Button>
            <Button type="button" variant="chromeSolid" size="sm" onClick={() => runNow(confirmRerun)}>
              {t("terminal.history.rerunConfirm", { count: broadcastCount })}
            </Button>
          </div>
        )}

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-chrome-border-subtle"
        >
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-chrome-text-dim">
              {query ? t("terminal.history.noMatch") : t("terminal.history.empty")}
            </p>
          ) : (
            rows.map((row, i) => {
              const failed = row.exitCode !== null && row.exitCode !== 0;
              const pane = paneById.get(row.paneId);
              const time = row.endedAt !== null ? new Date(row.endedAt).toLocaleTimeString() : "";
              const f = flash?.key === row.key ? flash.kind : null;
              // Multi-line input is captured with continuation prompts; never replay it.
              const replayable = isReplayableCommand(row.command);
              return (
                <div
                  key={row.key}
                  data-row-index={i}
                  onMouseEnter={() => setSelected(i)}
                  onDoubleClick={() => jump(row)}
                  className={`group flex items-center gap-2 border-b border-chrome-border-subtle px-3 py-1.5 last:border-b-0 ${
                    i === selected ? "bg-chrome-hover" : ""
                  }`}
                >
                  <span className="w-4 shrink-0" title={failed ? t("terminal.marks.status.failed", { code: row.exitCode ?? "" }) : undefined}>
                    {row.exitCode === null ? null : failed ? (
                      <X className="h-3.5 w-3.5 text-fail" aria-hidden />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-ok" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12px] text-chrome-text" title={row.command}>
                      {row.command}
                    </div>
                    <div className="flex min-w-0 gap-2 truncate text-[10.5px] text-chrome-text-dim">
                      {scope === "all" && pane && <span className="shrink-0">{paneDisplayLabel(pane)}</span>}
                      {row.cwd && (
                        <span className="truncate" title={row.cwd}>
                          {shortCwd(row.cwd)}
                        </span>
                      )}
                      {failed && <span className="shrink-0 text-fail">exit {row.exitCode}</span>}
                      {row.durationMs !== null && (
                        <span className="shrink-0">{formatCommandDuration(row.durationMs)}</span>
                      )}
                      {time && <span className="shrink-0">{time}</span>}
                    </div>
                  </div>
                  {f && (
                    <span className="shrink-0 text-[11px] text-chrome-accent-text">
                      {f === "copied"
                        ? t("terminal.history.copied")
                        : f === "saved"
                          ? t("terminal.history.saved")
                          : f === "exists"
                            ? t("terminal.history.alreadySaved")
                            : t("terminal.history.saveFailed")}
                    </span>
                  )}
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={!row.canJump}
                      title={t("terminal.history.jump")}
                      aria-label={t("terminal.history.jump")}
                      onClick={() => jump(row)}
                    >
                      <CornerDownRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={!row.hasOutput}
                      title={t("terminal.history.copyOutput")}
                      aria-label={t("terminal.history.copyOutput")}
                      onClick={() => copyOutput(row)}
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={!replayable}
                      title={replayable ? t("terminal.history.rerun") : t("terminal.history.multiLine")}
                      aria-label={t("terminal.history.rerun")}
                      onClick={() => rerun(row)}
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    {onSave && (
                      <button
                        type="button"
                        className={iconBtn}
                        disabled={!replayable}
                        title={replayable ? t("terminal.history.save") : t("terminal.history.multiLine")}
                        aria-label={t("terminal.history.save")}
                        onClick={() => save(row)}
                      >
                        <Bookmark className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <p className="text-[11px] text-chrome-text-dim">{t("terminal.history.footer")}</p>
      </DialogContent>
    </Dialog>
  );
}
