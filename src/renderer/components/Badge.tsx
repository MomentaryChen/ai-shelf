import { useLocale } from "../i18n/LocaleProvider";

type Variant = "ok" | "fail" | "warn" | "info";

const VARIANT_CLASSES: Record<Variant, string> = {
  ok: "bg-ok/15 text-ok",
  fail: "bg-fail/15 text-fail",
  warn: "bg-warn/15 text-warn",
  info: "bg-accent/15 text-accent",
};

export function Badge({ text, variant }: { text: string; variant: Variant }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${VARIANT_CLASSES[variant]}`}
    >
      {text}
    </span>
  );
}

export function YesNo({ value }: { value?: boolean }) {
  const { t } = useLocale();
  return value ? (
    <Badge text={t("inventory.yes")} variant="ok" />
  ) : (
    <Badge text={t("inventory.no")} variant="fail" />
  );
}

export function AuthBadge({ auth }: { auth: string }) {
  const { t } = useLocale();
  if (auth === "ok") return <Badge text={t("inventory.authOk")} variant="ok" />;
  if (auth === "missing") return <Badge text={t("inventory.authMissing")} variant="fail" />;
  return <Badge text={auth} variant="warn" />;
}

export function InstallStatusBadge({ available }: { available: boolean }) {
  const { t } = useLocale();
  return available ? (
    <Badge text={t("inventory.installedBadge")} variant="ok" />
  ) : (
    <Badge text={t("inventory.notInstalledBadge")} variant="fail" />
  );
}

/** Auth column for tools that are not installed — avoid showing "Missing". */
export function AuthBadgeForEntry({ entry }: { entry: { available: boolean; auth: string } }) {
  if (!entry.available) {
    return <span className="text-[12px] text-text-tertiary">—</span>;
  }
  return <AuthBadge auth={entry.auth} />;
}
