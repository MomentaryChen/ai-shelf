import type { BackgroundAttentionKind } from "../../shared/background-agent-attention.js";
import { useLocale } from "../i18n/LocaleProvider";

const KIND_CLASS: Record<BackgroundAttentionKind, string> = {
  waiting_input: "pane-agent-dot-attention bg-chrome-ui-accent",
  finished: "bg-ok",
  error: "bg-fail",
};

/** Small dot on a sidebar profile / terminal whose background agent needs attention. */
export function BackgroundAttentionBadge({
  kind,
  count,
  className = "",
}: {
  kind: BackgroundAttentionKind;
  count?: number;
  className?: string;
}) {
  const { t } = useLocale();
  const kindLabel = t(`pane.agent.bg.kind.${kind}` as const);
  const label =
    count !== undefined ? t("pane.agent.bg.badgeHint", { kind: kindLabel, count }) : kindLabel;
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${KIND_CLASS[kind]} ${className}`}
    />
  );
}
