import { useLocale } from "../i18n/LocaleProvider";
import { Badge as UiBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Variant = "ok" | "fail" | "warn" | "info" | "neutral";

const DOT_CLASSES: Record<Variant, string> = {
  ok: "bg-ok",
  fail: "bg-fail",
  warn: "bg-warn",
  info: "bg-accent",
  neutral: "bg-secondary-foreground",
};

export function Badge({
  text,
  variant,
  dot = false,
  className,
}: {
  text: string;
  variant: Variant;
  dot?: boolean;
  className?: string;
}) {
  return (
    <UiBadge variant={variant} className={cn(className)}>
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASSES[variant])} aria-hidden />
      )}
      {text}
    </UiBadge>
  );
}

/** "No" is a capability fact, not an error — render it neutral, not red. */
export function YesNo({ value }: { value?: boolean }) {
  const { t } = useLocale();
  return value ? (
    <Badge text={t("inventory.yes")} variant="ok" />
  ) : (
    <Badge text={t("inventory.no")} variant="neutral" />
  );
}

export function AuthBadge({ auth }: { auth: string }) {
  const { t } = useLocale();
  if (auth === "ok") return <Badge text={t("inventory.authOk")} variant="ok" />;
  if (auth === "missing") return <Badge text={t("inventory.authMissing")} variant="fail" />;
  return <Badge text={auth} variant="warn" />;
}

/** "Not installed" is a state, not a failure — neutral keeps the page calm. */
export function InstallStatusBadge({ available }: { available: boolean }) {
  const { t } = useLocale();
  return available ? (
    <Badge text={t("inventory.installedBadge")} variant="ok" />
  ) : (
    <Badge text={t("inventory.notInstalledBadge")} variant="neutral" />
  );
}

/** Auth column for tools that are not installed — avoid showing "Missing". */
export function AuthBadgeForEntry({ entry }: { entry: { available: boolean; auth: string } }) {
  if (!entry.available) {
    return <span className="text-[12px] text-text-tertiary">—</span>;
  }
  return <AuthBadge auth={entry.auth} />;
}
