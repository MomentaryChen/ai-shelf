import { FolderGit2, GitBranch } from "lucide-react";
import type { GitCwdInfo } from "../../shared/git-worktree.js";
import { useLocale } from "../i18n/LocaleProvider";
import { usePaneGitInfo } from "../terminal/git-info-store";

function useGitTitle(info: GitCwdInfo): string {
  const { t } = useLocale();
  const lines = [
    info.detached
      ? t("git.status.detached", { sha: info.branch })
      : t("git.status.branch", { branch: info.branch }),
  ];
  if (info.isLinkedWorktree) lines.push(t("git.status.worktree", { path: info.toplevel }));
  if (info.dirty === true) lines.push(t("git.status.dirty"));
  else if (info.dirty === false) lines.push(t("git.status.clean"));
  if (info.wsl) lines.push(t("git.status.wsl"));
  return lines.join("\n");
}

function GitSegment({ info, onClick }: { info: GitCwdInfo; onClick?: () => void }) {
  const { t } = useLocale();
  const title = useGitTitle(info);
  const body = (
    <>
      <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
      <span className={`min-w-0 max-w-[220px] truncate ${info.detached ? "italic" : ""}`}>
        {info.branch}
      </span>
      {info.isLinkedWorktree ? (
        <FolderGit2
          className="h-3 w-3 shrink-0 text-chrome-accent-text"
          aria-label={t("git.status.worktreeShort")}
        />
      ) : null}
      {info.dirty ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn"
          aria-label={t("git.status.dirty")}
        />
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 rounded px-1 font-mono transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text"
        title={`${title}\n\n${t("git.worktree.ctx")}`}
      >
        {body}
      </button>
    );
  }
  return (
    <span className="inline-flex min-w-0 shrink items-center gap-1 font-mono" title={title}>
      {body}
    </span>
  );
}

/**
 * Status bar segment: branch, worktree marker, dirty dot. Hidden outside git repos.
 * With `onClick` it is a button (the status bar opens the worktree dialog).
 */
export function TerminalGitStatus({
  cwd,
  onClick,
}: {
  cwd: string | undefined;
  onClick?: () => void;
}) {
  const info = usePaneGitInfo(cwd);
  if (!info) return null;
  return <GitSegment info={info} onClick={onClick} />;
}

/** Compact branch label for a pane header. Hidden outside git repos. */
export function PaneGitBranch({ cwd }: { cwd: string | undefined }) {
  const info = usePaneGitInfo(cwd);
  if (!info) return null;
  return <PaneGitBranchLabel info={info} />;
}

function PaneGitBranchLabel({ info }: { info: GitCwdInfo }) {
  const title = useGitTitle(info);
  return (
    <span
      className="inline-flex min-w-0 max-w-[30%] shrink items-center gap-0.5 text-[11px] text-chrome-text-subtle"
      title={title}
    >
      {info.isLinkedWorktree ? (
        <FolderGit2 className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 truncate font-mono">{info.branch}</span>
      {info.dirty ? <span className="text-warn" aria-hidden>*</span> : null}
    </span>
  );
}
