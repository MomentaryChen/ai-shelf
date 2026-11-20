import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages/en";
import {
  parseUnifiedDiff,
  type ChangedFile,
  type ChangeReviewBaselineInfo,
  type ChangeReviewError,
  type ChangeStatus,
  type UnifiedDiffLine,
} from "../../shared/git-change-review.js";
import { invalidateGitInfo } from "../terminal/git-info-store";
import { setChangeReviewCount } from "../terminal/change-review-store";
import { ConfirmDialog } from "./ConfirmDialog";

const DIFF_MAX_LINES = 4_000;

const STATUS_TONE: Record<ChangeStatus, string> = {
  A: "text-ok",
  M: "text-warn",
  D: "text-fail",
};

const STATUS_LABEL: Record<ChangeStatus, MessageKey> = {
  A: "git.review.status.A",
  M: "git.review.status.M",
  D: "git.review.status.D",
};

const ERROR_KEY: Record<ChangeReviewError["code"], MessageKey> = {
  remote: "git.review.err.remote",
  "unsupported-cwd": "git.review.err.unsupportedCwd",
  "not-repo": "git.review.err.notRepo",
  "git-missing": "git.review.err.gitMissing",
  "no-baseline": "git.review.err.noBaseline",
  "not-changed": "git.review.err.notChanged",
  "invalid-path": "git.review.err.invalidPath",
  gitlink: "git.review.err.gitlink",
  "git-failed": "git.review.err.gitFailed",
};

function lineTone(type: UnifiedDiffLine["type"]): string {
  if (type === "add") return "bg-ok/12 text-ok";
  if (type === "remove") return "bg-fail/12 text-fail";
  if (type === "hunk") return "bg-chrome-hover text-chrome-text-subtle";
  if (type === "note") return "italic text-chrome-text-dim";
  return "text-chrome-text-secondary";
}

function linePrefix(type: UnifiedDiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "remove") return "−";
  return " ";
}

type DiffState =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "ready"; path: string; text: string; truncated: boolean }
  | { kind: "error"; path: string; message: string };

interface Props {
  open: boolean;
  sessionId: string;
  cwd: string;
  onClose: () => void;
}

/** File list + diff of what changed in a pane's repo since its baseline, with per-file revert. */
export function ChangeReviewDialog({ open, sessionId, cwd, onClose }: Props) {
  const { t } = useLocale();
  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  const [baseline, setBaseline] = useState<ChangeReviewBaselineInfo | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<ChangedFile | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const listSeq = useRef(0);
  const diffSeq = useRef(0);

  const describe = useCallback(
    (e: ChangeReviewError) => t(ERROR_KEY[e.code], { error: e.error ?? "" }),
    [t],
  );

  const load = useCallback(async () => {
    const seq = ++listSeq.current;
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.gitChangeReviewList({ sessionId, cwd });
      if (seq !== listSeq.current) return;
      if (!r.ok) {
        setFiles(null);
        setSnapshot(null);
        setError(describe(r));
        setChangeReviewCount(sessionId, cwd, null);
        return;
      }
      setFiles(r.files);
      setBaseline(r.baseline);
      setSnapshot(r.snapshot);
      setChangeReviewCount(sessionId, cwd, r.files.length);
      setSelected((prev) =>
        prev && r.files.some((f) => f.path === prev) ? prev : (r.files[0]?.path ?? null),
      );
    } catch (err) {
      if (seq === listSeq.current) {
        setError(t("git.review.err.gitFailed", { error: err instanceof Error ? err.message : String(err) }));
      }
    } finally {
      if (seq === listSeq.current) setBusy(false);
    }
  }, [sessionId, cwd, describe, t]);

  useEffect(() => {
    if (!open) return;
    setFiles(null);
    setBaseline(null);
    setSnapshot(null);
    setSelected(null);
    setDiff({ kind: "idle" });
    setConfirmRevert(null);
    setConfirmReset(false);
    void load();
  }, [open, load]);

  const selectedFile = useMemo(
    () => files?.find((f) => f.path === selected) ?? null,
    [files, selected],
  );

  useEffect(() => {
    if (!open || !selected || !snapshot) {
      setDiff({ kind: "idle" });
      return;
    }
    const seq = ++diffSeq.current;
    const path = selected;
    setDiff({ kind: "loading", path });
    void window.api
      .gitChangeReviewDiff({ sessionId, cwd, path, snapshot })
      .then((r) => {
        if (seq !== diffSeq.current) return;
        if (!r.ok) setDiff({ kind: "error", path, message: describe(r) });
        else setDiff({ kind: "ready", path, text: r.diff, truncated: r.truncated });
      })
      .catch((err: unknown) => {
        if (seq !== diffSeq.current) return;
        setDiff({ kind: "error", path, message: err instanceof Error ? err.message : String(err) });
      });
  }, [open, selected, snapshot, sessionId, cwd, describe]);

  const parsed = useMemo(
    () => (diff.kind === "ready" ? parseUnifiedDiff(diff.text) : null),
    [diff],
  );

  async function revert(file: ChangedFile) {
    setConfirmRevert(null);
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.gitChangeReviewRevert({ sessionId, cwd, path: file.path });
      if (!r.ok) setError(describe(r));
      invalidateGitInfo();
    } catch (err) {
      setError(t("git.review.err.gitFailed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
    await load();
  }

  async function resetBaseline() {
    setConfirmReset(false);
    const seq = ++listSeq.current;
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.gitChangeReviewReset({ sessionId, cwd });
      if (seq !== listSeq.current) return;
      if (!r.ok) {
        setError(describe(r));
        return;
      }
      setFiles(r.files);
      setBaseline(r.baseline);
      setSnapshot(r.snapshot);
      setSelected(null);
      setChangeReviewCount(sessionId, cwd, 0);
    } catch (err) {
      setError(t("git.review.err.gitFailed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      if (seq === listSeq.current) setBusy(false);
    }
  }

  const baselineMeta = baseline
    ? t("git.review.baselineMeta", {
        time: new Date(baseline.at).toLocaleString(),
        head: baseline.head ?? t("git.review.baselineNoHead"),
        path: baseline.toplevel,
      })
    : "";

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="flex h-[min(85vh,720px)] max-w-5xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{t("git.review.title")}</DialogTitle>
            <DialogDescription className="text-[12px]">{t("git.review.description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-chrome-text-subtle"
              title={baselineMeta}
            >
              {baselineMeta}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-[12px]"
              disabled={busy}
              onClick={() => void load()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
              {t("git.review.refresh")}
            </Button>
            <Button
              type="button"
              variant="chromeOutline"
              size="sm"
              className="h-8 text-[12px]"
              disabled={busy || !baseline}
              onClick={() => setConfirmReset(true)}
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              {t("git.review.reset")}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="whitespace-pre-wrap break-words text-[12px] text-fail">
              {error}
            </p>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(200px,2fr)_5fr]">
            <div
              className="min-h-0 overflow-y-auto overscroll-contain rounded-lg border border-chrome-border-subtle"
              role="listbox"
              aria-label={t("git.review.title")}
            >
              {files === null ? (
                <p className="px-4 py-8 text-center text-[12px] text-chrome-text-dim">
                  {busy ? t("git.review.loading") : ""}
                </p>
              ) : files.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12px] text-chrome-text-dim">
                  {t("git.review.empty")}
                </p>
              ) : (
                files.map((f) => {
                  const active = f.path === selected;
                  const slash = f.path.lastIndexOf("/");
                  const name = f.path.slice(slash + 1);
                  const dir = slash >= 0 ? f.path.slice(0, slash) : "";
                  return (
                    <div
                      key={f.path}
                      role="option"
                      aria-selected={active}
                      tabIndex={0}
                      onClick={() => setSelected(f.path)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(f.path);
                        }
                      }}
                      className={`group flex cursor-pointer items-center gap-2 border-b border-chrome-border-subtle px-3 py-1.5 outline-none last:border-b-0 focus-visible:bg-chrome-hover ${
                        active ? "bg-chrome-ui-accent-soft" : "hover:bg-chrome-hover"
                      }`}
                      title={`${t(STATUS_LABEL[f.status])}: ${f.path}`}
                    >
                      <span
                        className={`w-3 shrink-0 font-mono text-[11px] font-semibold ${STATUS_TONE[f.status]}`}
                        aria-label={t(STATUS_LABEL[f.status])}
                      >
                        {f.status}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[12px] text-chrome-text">
                          {name}
                        </span>
                        {dir ? (
                          <span className="block truncate font-mono text-[10px] text-chrome-text-dim">
                            {dir}
                          </span>
                        ) : null}
                      </span>
                      {f.gitlink ? null : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmRevert(f);
                          }}
                          disabled={busy}
                          className="shrink-0 cursor-pointer rounded p-1 text-chrome-text-subtle opacity-0 transition-opacity hover:bg-chrome-hover-strong hover:text-chrome-text focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-default disabled:opacity-40"
                          title={t("git.review.revert")}
                          aria-label={`${t("git.review.revert")} ${f.path}`}
                        >
                          <Undo2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-chrome-border-subtle">
              {selectedFile ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-chrome-border-subtle px-3 py-1.5">
                  <span
                    className={`font-mono text-[11px] font-semibold ${STATUS_TONE[selectedFile.status]}`}
                  >
                    {selectedFile.status}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-[12px] text-chrome-text"
                    title={selectedFile.path}
                  >
                    {selectedFile.path}
                  </span>
                  {parsed && !parsed.binary && parsed.lines.length > 0 ? (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-chrome-text-subtle">
                      {t("git.review.stats", { added: parsed.added, removed: parsed.removed })}
                    </span>
                  ) : null}
                  {selectedFile.gitlink ? (
                    <span className="shrink-0 text-[11px] text-chrome-text-dim">
                      {t("git.review.gitlink")}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="chromeOutline"
                      size="sm"
                      className="h-7 min-h-7 px-2.5 text-[12px]"
                      disabled={busy}
                      onClick={() => setConfirmRevert(selectedFile)}
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      {t("git.review.revert")}
                    </Button>
                  )}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label={selected ?? undefined}>
                {diff.kind === "idle" ? (
                  <p className="px-4 py-8 text-center text-[12px] text-chrome-text-dim">
                    {files && files.length > 0 ? t("git.review.selectFile") : ""}
                  </p>
                ) : diff.kind === "loading" ? (
                  <p className="px-4 py-8 text-center text-[12px] text-chrome-text-dim">
                    {t("git.review.diffLoading")}
                  </p>
                ) : diff.kind === "error" ? (
                  <p role="alert" className="whitespace-pre-wrap break-words px-3 py-3 text-[12px] text-fail">
                    {diff.message}
                  </p>
                ) : parsed?.binary ? (
                  <p className="px-3 py-3 text-[12px] text-chrome-text-subtle">{t("git.review.binary")}</p>
                ) : !parsed || parsed.lines.length === 0 ? (
                  <p className="px-3 py-3 text-[12px] text-chrome-text-subtle">
                    {t("git.review.noTextChange")}
                  </p>
                ) : (
                  <>
                    <pre className="m-0 min-w-max p-0 font-mono text-[12px] leading-relaxed">
                      {parsed.lines.map((line, idx) => (
                        <div
                          key={idx}
                          className={`flex gap-2 whitespace-pre px-3 py-px ${lineTone(line.type)}`}
                        >
                          <span className="w-10 shrink-0 select-none text-right tabular-nums text-chrome-text-dim">
                            {line.oldNo ?? ""}
                          </span>
                          <span className="w-10 shrink-0 select-none text-right tabular-nums text-chrome-text-dim">
                            {line.newNo ?? ""}
                          </span>
                          <span className="w-3 shrink-0 select-none">{linePrefix(line.type)}</span>
                          <span className="flex-1">{line.text.length ? line.text : " "}</span>
                        </div>
                      ))}
                    </pre>
                    {diff.truncated ? (
                      <p className="border-t border-chrome-border-subtle px-3 py-2 text-[11px] text-warn">
                        {t("git.review.truncated", { count: DIFF_MAX_LINES })}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRevert !== null}
        title={t("git.review.revertTitle", { path: confirmRevert?.path ?? "" })}
        description={
          confirmRevert?.status === "A"
            ? t("git.review.revertBodyDelete")
            : t("git.review.revertBodyRestore")
        }
        confirmLabel={t("git.review.revert")}
        confirmVariant="destructive"
        defaultFocus="cancel"
        onCancel={() => setConfirmRevert(null)}
        onConfirm={() => {
          if (confirmRevert) void revert(confirmRevert);
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        title={t("git.review.resetTitle")}
        description={t("git.review.resetBody")}
        confirmLabel={t("git.review.reset")}
        defaultFocus="cancel"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void resetBaseline()}
      />
    </>
  );
}
