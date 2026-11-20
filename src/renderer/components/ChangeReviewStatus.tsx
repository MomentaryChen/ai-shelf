import { useState } from "react";
import { FileDiff } from "lucide-react";
import { isRemoteCwd } from "../../shared/git-change-review.js";
import { useLocale } from "../i18n/LocaleProvider";
import { usePaneGitInfo } from "../terminal/git-info-store";
import { useChangeReviewCount } from "../terminal/change-review-store";
import { ChangeReviewDialog } from "./ChangeReviewDialog";

const CHIP_CLASS =
  "inline-flex shrink-0 items-center gap-1 rounded px-1 font-sans text-[11px] transition-colors";

/**
 * Status bar entry point for agent change review: "N files changed" since the
 * pane's baseline, opening the review dialog. Hidden outside git repos; a
 * disabled chip explains why remote (SSH) panes have no review.
 */
export function ChangeReviewStatus({
  sessionId,
  cwd,
}: {
  sessionId: string | undefined;
  cwd: string | undefined;
}) {
  const { t } = useLocale();
  const dir = cwd?.trim() ?? "";
  const remote = !!dir && isRemoteCwd(dir);
  const info = usePaneGitInfo(remote ? null : dir);
  const count = useChangeReviewCount(sessionId, dir, !!info);
  const [open, setOpen] = useState(false);

  if (remote) {
    return (
      <span
        className={`${CHIP_CLASS} cursor-default text-chrome-text-dim opacity-60`}
        title={t("git.review.remoteTitle")}
        aria-disabled
      >
        <FileDiff className="h-3 w-3" aria-hidden />
      </span>
    );
  }
  if (!info || !sessionId) return null;

  const label =
    count === null
      ? null
      : count === 0
        ? t("git.review.chipNone")
        : count === 1
          ? t("git.review.chipOne")
          : t("git.review.chipMany", { count });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${CHIP_CLASS} cursor-pointer hover:bg-chrome-hover-strong hover:text-chrome-text ${
          count ? "text-chrome-text-secondary" : "text-chrome-text-subtle"
        }`}
        title={t("git.review.chipTitle")}
      >
        <FileDiff className={`h-3 w-3 ${count ? "text-warn" : ""}`} aria-hidden />
        {label ? <span className="tabular-nums">{label}</span> : null}
      </button>
      {open ? (
        <ChangeReviewDialog open sessionId={sessionId} cwd={dir} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
