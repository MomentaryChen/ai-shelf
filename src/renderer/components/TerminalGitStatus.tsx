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

/**
 * Branch label for a pane header: branch, worktree marker, dirty mark. Hidden
 * outside git repos. This is the only place a pane's branch is shown, so with
 * `onClick` it doubles as the entry point to the worktree dialog.
 */
export function PaneGitBranch({
  cwd,
  onClick,
}: {
  cwd: string | undefined;
  onClick?: () => void;
}) {
  const info = usePaneGitInfo(cwd);
  if (!info) return null;
  return <PaneGitBranchLabel info={info} onClick={onClick} />;
}

const LABEL_CLASS =
  "inline-flex min-w-0 max-w-[30%] shrink items-center gap-0.5 text-[11px] text-chrome-text-subtle";

function PaneGitBranchLabel({ info, onClick }: { info: GitCwdInfo; onClick?: () => void }) {
  const { t } = useLocale();
  const title = useGitTitle(info);
  const body = (
    <>
      {info.isLinkedWorktree ? (
        <FolderGit2 className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span className={`min-w-0 truncate font-mono ${info.detached ? "italic" : ""}`}>
        {info.branch}
      </span>
      {info.dirty ? <span className="text-warn" aria-hidden>*</span> : null}
    </>
  );
  if (!onClick) {
    return (
      <span className={LABEL_CLASS} title={title}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${LABEL_CLASS} relative z-10 cursor-pointer rounded px-1 transition-colors hover:bg-chrome-hover-strong hover:text-chrome-text-secondary`}
      title={`${title}\n\n${t("git.worktree.ctx")}`}
    >
      {body}
    </button>
  );
}
