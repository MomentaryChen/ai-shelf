import { useEffect, useState } from "react";
import { formatGitBuildLabel, type GitBuildInfo } from "../../utils/git-build-info.js";

export function AppVersionBadge({ className = "" }: { className?: string }) {
  const [git, setGit] = useState<GitBuildInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.getSelfInfo().then((info) => {
      if (cancelled) return;
      if (info.branch || info.commitShort) {
        setGit({
          branch: info.branch ?? null,
          commitShort: info.commitShort ?? null,
          dirty: info.dirty ?? false,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const gitLabel = git ? formatGitBuildLabel(git) : null;
  const title = gitLabel
    ? `AI Shelf v${__APP_VERSION__} — ${gitLabel}${git?.dirty ? " (uncommitted changes)" : ""}`
    : `AI Shelf v${__APP_VERSION__}`;

  return (
    <span
      className={`shrink-0 font-mono text-[11px] text-text-secondary tabular-nums ${className}`.trim()}
      title={title}
    >
      v{__APP_VERSION__}
      {gitLabel && <span className="text-text-secondary/80"> · {gitLabel}</span>}
    </span>
  );
}
