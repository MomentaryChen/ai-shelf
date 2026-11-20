import { useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, History, Loader2, MessagesSquare, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "./EmptyState";
import { useLocale } from "../i18n/LocaleProvider";
import {
  conversationProjectKey,
  filterByProject,
  groupByProject,
  type ConversationDetail,
  type ConversationSearchHit,
  type ConversationSummary,
} from "../../shared/conversation-history.js";

/** Outcome of "Resume in new pane" (ChatTab decides; the dialog shows the message). */
export type ConversationResumeOutcome =
  | "ok"
  | "focused"
  | "busy"
  | "remote"
  | "failed"
  | "not-resumed";

interface Props {
  open: boolean;
  onClose: () => void;
  onResume: (session: ConversationSummary) => Promise<ConversationResumeOutcome>;
}

interface Row {
  summary: ConversationSummary;
  snippet?: string;
  /** Group header shown above this row (all-projects browse mode). */
  header?: string;
}

const SEARCH_DEBOUNCE_MS = 250;
const ALL_PROJECTS = "*";

function shortPath(cwd: string | null): string {
  if (!cwd) return "";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.length <= 3 ? cwd : `…/${parts.slice(-3).join("/")}`;
}

function useRelativeTime(locale: string) {
  return useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(locale === "zh" ? "zh-TW" : "en", { numeric: "auto" });
    return (ms: number) => {
      const diff = (ms - Date.now()) / 1000;
      const abs = Math.abs(diff);
      if (abs < 60) return rtf.format(Math.round(diff), "second");
      if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
      if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
      return new Date(ms).toLocaleDateString();
    };
  }, [locale]);
}

/**
 * Browse, search and resume past Claude Code conversations. Lists come from the
 * main process (head-only scan, cached); search and previews are read on demand.
 */
export function ConversationHistoryDialog({ open, onClose, onResume }: Props) {
  const { t, locale } = useLocale();
  const relTime = useRelativeTime(locale);
  const [sessions, setSessions] = useState<ConversationSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ q: string; hits: ConversationSearchHit[]; limited: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailSeq = useRef(0);

  const load = (refresh = false) => {
    setLoading(true);
    setLoadError(false);
    void window.api
      .conversationsList(refresh ? { refresh: true } : undefined)
      .then((r) => {
        if (r.success && r.sessions) setSessions(r.sessions);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) {
      // Stop any search still running in main.
      void window.api.conversationsSearch?.("");
      return;
    }
    setQuery("");
    setSearch(null);
    setNotice(null);
    setDetail(null);
    setSelectedId(null);
    load();
    // Reload only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced full-text search in main; a newer query cancels the older one there.
  const trimmed = query.trim();
  useEffect(() => {
    if (!open) return;
    if (!trimmed) {
      setSearch(null);
      setSearching(false);
      void window.api.conversationsSearch("");
      return;
    }
    let stale = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void window.api
        .conversationsSearch(trimmed)
        .then((r) => {
          if (stale || !r.success || !r.result || r.result.cancelled) return;
          setSearch({ q: trimmed, hits: r.result.hits, limited: r.result.limited });
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [open, trimmed]);

  const groups = useMemo(() => groupByProject(sessions ?? []), [sessions]);

  const rows: Row[] = useMemo(() => {
    if (trimmed) {
      const hits = search?.hits ?? [];
      return hits
        .filter((h) => project === null || conversationProjectKey(h.summary.cwd) === project)
        .map((h) => ({ summary: h.summary, snippet: h.snippet }));
    }
    if (project !== null) return filterByProject(sessions ?? [], project).map((summary) => ({ summary }));
    const out: Row[] = [];
    for (const g of groups) {
      g.sessions.forEach((summary, i) => {
        out.push({ summary, ...(i === 0 ? { header: g.cwd ?? t("conversations.unknownProject") } : {}) });
      });
    }
    return out;
  }, [trimmed, search, project, sessions, groups, t]);

  // Keep a valid selection.
  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((r) => r.summary.sessionId === selectedId)) {
      setSelectedId(rows[0]!.summary.sessionId);
    }
  }, [rows, selectedId]);

  const selected = rows.find((r) => r.summary.sessionId === selectedId)?.summary ?? null;

  // Load the preview for the selected session.
  useEffect(() => {
    if (!open || !selected) {
      setDetail(null);
      return;
    }
    const seq = ++detailSeq.current;
    setDetailLoading(true);
    const timer = window.setTimeout(() => {
      void window.api
        .conversationsRead(selected.provider, selected.sessionId)
        .then((r) => {
          if (seq !== detailSeq.current) return;
          setDetail(r.success && r.detail ? r.detail : null);
          if (r.success && r.detail) {
            // Fill in the message count the list scan does not compute.
            const full = r.detail.summary;
            setSessions((prev) =>
              prev?.map((s) => (s.sessionId === full.sessionId ? { ...s, messageCount: full.messageCount } : s)) ??
              prev,
            );
          }
        })
        .finally(() => {
          if (seq === detailSeq.current) setDetailLoading(false);
        });
    }, 80);
    return () => window.clearTimeout(timer);
    // Re-read only when the selected session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected?.provider, selected?.sessionId, selected?.updatedAt]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-session-id="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const resume = async (session: ConversationSummary) => {
    if (resuming || !session.resumable) return;
    setResuming(true);
    setNotice(null);
    try {
      const outcome = await onResume(session);
      if (outcome === "ok" || outcome === "focused") {
        onClose();
        return;
      }
      setNotice(t(`conversations.err.${outcome}`));
    } finally {
      setResuming(false);
    }
  };

  /** Rows match the typed query (not a previous query's hits still on screen). */
  const rowsCurrent = !trimmed || (!searching && search?.q === trimmed);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    // Row buttons take list navigation; other buttons / the select keep their own keys.
    if (target.tagName === "SELECT") return;
    if (target.tagName === "BUTTON" && !target.dataset.sessionId) return;
    const idx = rows.findIndex((r) => r.summary.sessionId === selectedId);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = rows[Math.min(rows.length - 1, idx + 1)];
      if (next) setSelectedId(next.summary.sessionId);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = rows[Math.max(0, idx - 1)];
      if (prev) setSelectedId(prev.summary.sessionId);
    } else if (e.key === "Enter" && selected) {
      e.preventDefault();
      if (rowsCurrent) void resume(selected);
    }
  };

  const shown = detail && selected && detail.summary.sessionId === selected.sessionId ? detail : null;
  const shownSummary = shown?.summary ?? selected;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="flex h-[min(85vh,760px)] max-w-5xl flex-col gap-3 sm:max-w-5xl"
        onKeyDown={onKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">{t("conversations.title")}</DialogTitle>
          <DialogDescription className="text-[12px]">{t("conversations.desc")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("conversations.search")}
            aria-label={t("conversations.search")}
            className="h-8 min-w-[200px] flex-1 border-chrome-border-subtle bg-chrome-surface text-[12px]"
          />
          <select
            // Prefixed so the unknown-folder group (key "") differs from "all".
            value={project === null ? ALL_PROJECTS : `k:${project}`}
            onChange={(e) => setProject(e.target.value === ALL_PROJECTS ? null : e.target.value.slice(2))}
            aria-label={t("conversations.project")}
            className="h-8 max-w-[240px] cursor-pointer truncate rounded-md border border-chrome-border-subtle bg-chrome-surface px-2 text-[12px] text-chrome-text outline-none"
          >
            <option value={ALL_PROJECTS}>{t("conversations.allProjects", { count: sessions?.length ?? 0 })}</option>
            {groups.map((g) => (
              <option key={g.key} value={`k:${g.key}`} title={g.cwd ?? ""}>
                {`${g.label || t("conversations.unknownProject")} (${g.sessions.length})`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            title={t("conversations.refresh")}
            aria-label={t("conversations.refresh")}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-chrome-text-muted transition-colors hover:bg-chrome-hover hover:text-chrome-text disabled:cursor-default disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>

        {notice && (
          <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-chrome-text" role="status">
            {notice}
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-3">
          {/* Session list */}
          <div
            ref={listRef}
            className="min-h-0 w-[42%] shrink-0 overflow-y-auto overscroll-contain rounded-lg border border-chrome-border-subtle"
          >
            {sessions === null && loading ? (
              <p className="flex items-center justify-center gap-2 px-4 py-8 text-[12px] text-chrome-text-dim">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("conversations.loading")}
              </p>
            ) : loadError ? (
              <EmptyState tone="chrome" compact title={t("conversations.loadFailed")} />
            ) : rows.length === 0 ? (
              trimmed && searching ? (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-[12px] text-chrome-text-dim">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {t("conversations.searching")}
                </p>
              ) : (
                <EmptyState
                  tone="chrome"
                  compact
                  icon={<History className="h-5 w-5 text-chrome-text-muted" aria-hidden />}
                  title={trimmed ? t("conversations.noMatch") : t("conversations.empty")}
                  description={trimmed ? undefined : t("conversations.emptyDesc")}
                />
              )
            ) : (
              <>
                {rows.map((row) => {
                  const s = row.summary;
                  const active = s.sessionId === selectedId;
                  return (
                    <div key={`${s.provider}:${s.sessionId}`}>
                      {row.header && (
                        <div
                          className="sticky top-0 z-[1] truncate border-b border-chrome-border-subtle bg-chrome-surface px-3 py-1 text-[10.5px] font-medium text-chrome-text-muted"
                          title={row.header}
                        >
                          {shortPath(row.header)}
                        </div>
                      )}
                      <button
                        type="button"
                        data-session-id={s.sessionId}
                        onClick={() => setSelectedId(s.sessionId)}
                        onDoubleClick={() => void resume(s)}
                        className={`block w-full cursor-pointer border-b border-chrome-border-subtle px-3 py-2 text-left last:border-b-0 ${
                          active ? "bg-chrome-hover-strong" : "hover:bg-chrome-hover"
                        }`}
                      >
                        <div className="truncate text-[12.5px] text-chrome-text" title={s.title}>
                          {s.title || t("conversations.untitled")}
                        </div>
                        {row.snippet && row.snippet !== s.title && (
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-chrome-text-muted">{row.snippet}</div>
                        )}
                        <div className="mt-0.5 flex min-w-0 gap-2 text-[10.5px] text-chrome-text-dim">
                          <span className="shrink-0">{relTime(s.updatedAt)}</span>
                          {(project !== null || trimmed) && s.cwd && (
                            <span className="truncate" title={s.cwd}>
                              {shortPath(s.cwd)}
                            </span>
                          )}
                          {s.gitBranch && (
                            <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
                              <GitBranch className="h-2.5 w-2.5 shrink-0" aria-hidden />
                              <span className="truncate">{s.gitBranch}</span>
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
                {trimmed && search?.limited && (
                  <p className="px-3 py-2 text-center text-[11px] text-chrome-text-dim">
                    {t("conversations.limited", { count: search.hits.length })}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Preview */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-chrome-border-subtle">
            {!shownSummary ? (
              <EmptyState
                tone="chrome"
                compact
                className="m-auto"
                icon={<MessagesSquare className="h-5 w-5 text-chrome-text-muted" aria-hidden />}
                title={t("conversations.selectHint")}
              />
            ) : (
              <>
                <div className="flex items-start gap-3 border-b border-chrome-border-subtle px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[13px] font-medium text-chrome-text">
                      {shownSummary.title || t("conversations.untitled")}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-chrome-text-dim">
                      {shownSummary.cwd && (
                        <span className="max-w-full truncate font-mono" title={shownSummary.cwd}>
                          {shownSummary.cwd}
                        </span>
                      )}
                      {shownSummary.gitBranch && (
                        <span className="inline-flex items-center gap-0.5">
                          <GitBranch className="h-2.5 w-2.5" aria-hidden />
                          {shownSummary.gitBranch}
                        </span>
                      )}
                      {shownSummary.startedAt !== null && (
                        <span>{t("conversations.started", { time: new Date(shownSummary.startedAt).toLocaleString() })}</span>
                      )}
                      <span>{t("conversations.updated", { time: new Date(shownSummary.updatedAt).toLocaleString() })}</span>
                      {shownSummary.messageCount !== null && (
                        <span>{t("conversations.messages", { count: shownSummary.messageCount })}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="chromeSolid"
                    size="sm"
                    disabled={!shownSummary.resumable || resuming}
                    title={shownSummary.resumable ? t("conversations.resumeTitle") : t("conversations.notResumable")}
                    onClick={() => void resume(shownSummary)}
                    className="shrink-0 text-[12px]"
                  >
                    {resuming ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Play className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {t("conversations.resume")}
                  </Button>
                </div>
                {!shownSummary.resumable && (
                  <p className="border-b border-chrome-border-subtle px-3 py-1.5 text-[11px] text-chrome-text-muted">
                    {t("conversations.notResumable")}
                  </p>
                )}
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-2.5">
                  {!shown && detailLoading ? (
                    <p className="flex items-center justify-center gap-2 py-8 text-[12px] text-chrome-text-dim">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {t("conversations.loading")}
                    </p>
                  ) : !shown ? (
                    <p className="py-8 text-center text-[12px] text-chrome-text-dim">{t("conversations.previewFailed")}</p>
                  ) : shown.messages.length === 0 ? (
                    <p className="py-8 text-center text-[12px] text-chrome-text-dim">{t("conversations.noMessages")}</p>
                  ) : (
                    <>
                      {shown.messages.map((m, i) => (
                        <div
                          key={i}
                          className={`rounded-lg px-2.5 py-1.5 ${
                            m.role === "user" ? "bg-chrome-ui-accent-soft" : "bg-chrome-hover"
                          }`}
                        >
                          <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-chrome-text-dim">
                            {m.role === "user" ? t("conversations.roleUser") : t("conversations.roleAssistant")}
                          </div>
                          <div className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-chrome-text">
                            {m.text}
                          </div>
                        </div>
                      ))}
                      {shown.truncated && (
                        <p className="py-1 text-center text-[11px] text-chrome-text-dim">
                          {t("conversations.truncated")}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <p className="text-[11px] text-chrome-text-dim">{t("conversations.footer")}</p>
      </DialogContent>
    </Dialog>
  );
}
