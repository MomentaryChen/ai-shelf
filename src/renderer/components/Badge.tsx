import { useLocale } from "../i18n/LocaleProvider";

type Variant = "ok" | "fail" | "warn" | "info";

const VARIANT_CLASSES: Record<Variant, string> = {
  ok: "bg-ok/12 text-ok ring-ok/25",
  fail: "bg-fail/12 text-fail ring-fail/25",
  warn: "bg-warn/12 text-warn ring-warn/25",
  info: "bg-accent/12 text-accent ring-accent/25",
};

const DOT_CLASSES: Record<Variant, string> = {
  ok: "bg-ok",
  fail: "bg-fail",
  warn: "bg-warn",
  info: "bg-accent",
};

export function Badge({ text, variant, dot = false }: { text: string; variant: Variant; dot?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset ${VARIANT_CLASSES[variant]}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[variant]}`} aria-hidden />}
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
