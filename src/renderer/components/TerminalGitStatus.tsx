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

function GitSegment({ info }: { info: GitCwdInfo }) {
  const { t } = useLocale();
  const title = useGitTitle(info);
  return (
    <span className="inline-flex min-w-0 shrink items-center gap-1 font-mono" title={title}>
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
    </span>
  );
}

/** Status bar segment: branch, worktree marker, dirty dot. Hidden outside git repos. */
export function TerminalGitStatus({ cwd }: { cwd: string | undefined }) {
  const info = usePaneGitInfo(cwd);
  if (!info) return null;
  return <GitSegment info={info} />;
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
      className="inline-flex min-w-0 max-w-[30%] shrink items-center gap-0.5 text-[10px] text-chrome-text-dim"
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
