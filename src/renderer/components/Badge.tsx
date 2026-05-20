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
      className={`inline-block rounded-xl px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${VARIANT_CLASSES[variant]}`}
    >
      {text}
    </span>
  );
}

export function YesNo({ value }: { value?: boolean }) {
  return value ? <Badge text="Yes" variant="ok" /> : <Badge text="No" variant="fail" />;
}

export function AuthBadge({ auth }: { auth: string }) {
  if (auth === "ok") return <Badge text="✓ OK" variant="ok" />;
  if (auth === "missing") return <Badge text="✗ Missing" variant="fail" />;
  return <Badge text={auth} variant="warn" />;
}

export function InstallStatusBadge({ available }: { available: boolean }) {
  return available ? (
    <Badge text="已安裝" variant="ok" />
  ) : (
    <Badge text="未安裝" variant="fail" />
  );
}

/** Auth column for tools that are not installed — avoid showing "Missing". */
export function AuthBadgeForEntry({ entry }: { entry: { available: boolean; auth: string } }) {
  if (!entry.available) {
    return <span className="text-[12px] text-text-tertiary">—</span>;
  }
  return <AuthBadge auth={entry.auth} />;
}
