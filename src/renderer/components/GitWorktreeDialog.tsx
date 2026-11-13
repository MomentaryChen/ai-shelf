import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deriveWorktreePath, type GitWorktreeAddResult } from "../../shared/git-worktree.js";
import { invalidateGitInfo, usePaneGitInfo } from "../terminal/git-info-store";

interface Props {
  open: boolean;
  /** Cwd of the pane the new worktree pane splits from. */
  cwd: string;
  onClose: () => void;
  /** Worktree is on disk; caller opens the pane. Returns an error message when that fails. */
  onCreated: (path: string) => Promise<string | null>;
}

const INPUT_CLASS =
  "border-chrome-border-input bg-chrome-surface-focus text-[13px] text-chrome-text focus-visible:border-chrome-border-focus";

/** Ask for a branch, run `git worktree add`, then hand the path back to open a pane there. */
export function GitWorktreeDialog({ open, cwd, onClose, onCreated }: Props) {
  const { t } = useLocale();
  const info = usePaneGitInfo(open ? cwd : null);
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingBranch, setExistingBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBranch("");
    setBase("");
    setError(null);
    setExistingBranch(null);
    setBusy(false);
  }, [open, cwd]);

  const trimmed = branch.trim();
  const defaultBase = info?.branch ?? "";
  const previewPath = info && trimmed ? deriveWorktreePath(info.mainRoot, trimmed) : "";

  function describeError(r: Extract<GitWorktreeAddResult, { ok: false }>): string {
    switch (r.code) {
      case "not-repo":
        return t("git.worktree.err.notRepo");
      case "unsupported-cwd":
        return t("git.worktree.err.unsupportedCwd");
      case "git-missing":
        return t("git.worktree.err.gitMissing");
      case "invalid-branch":
        return t("git.worktree.err.invalidBranch");
      case "invalid-base":
        return t("git.worktree.err.invalidBase", { base: base.trim() || defaultBase });
      case "path-exists":
        return t("git.worktree.err.pathExists", { path: r.path ?? "" });
      case "branch-exists":
        return t("git.worktree.branchExists", { branch: trimmed });
      case "git-failed":
        return t("git.worktree.err.gitFailed", { error: r.error ?? "" });
    }
  }

  async function submit(useExisting: boolean) {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.gitWorktreeAdd({
        cwd,
        branch: trimmed,
        base: base.trim() || defaultBase || undefined,
        useExisting,
      });
      if (!r.ok) {
        if (r.code === "branch-exists") setExistingBranch(trimmed);
        else setExistingBranch(null);
        setError(describeError(r));
        return;
      }
      invalidateGitInfo();
      const openErr = await onCreated(r.path);
      if (openErr) {
        setError(openErr);
        return;
      }
      onClose();
    } catch (err) {
      setError(t("git.worktree.err.gitFailed", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }

  const confirmExisting = existingBranch !== null && existingBranch === trimmed;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("git.worktree.title")}</DialogTitle>
          <DialogDescription className="text-[12px]">{t("git.worktree.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-chrome-text-secondary">{t("git.worktree.branchLabel")}</Label>
            <Input
              type="text"
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                setError(null);
              }}
              placeholder={t("git.worktree.branchPlaceholder")}
              className={INPUT_CLASS}
              spellCheck={false}
              autoFocus
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && trimmed) void submit(confirmExisting);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-chrome-text-secondary">{t("git.worktree.baseLabel")}</Label>
            <Input
              type="text"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder={defaultBase || t("git.worktree.basePlaceholder")}
              className={INPUT_CLASS}
              spellCheck={false}
              disabled={busy || confirmExisting}
            />
          </div>
          {previewPath ? (
            <p className="break-all text-[11px] text-chrome-text-subtle">
              {t("git.worktree.pathLabel")}: <span className="font-mono">{previewPath}</span>
            </p>
          ) : null}
          {error ? <p className="whitespace-pre-wrap break-words text-[11px] text-fail">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("profile.dialog.cancel")}
          </Button>
          <Button size="sm" disabled={busy || !trimmed} onClick={() => void submit(confirmExisting)}>
            {busy
              ? t("git.worktree.creating")
              : confirmExisting
                ? t("git.worktree.checkoutExisting")
                : t("git.worktree.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
