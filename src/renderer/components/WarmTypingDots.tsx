import { cn } from "@/lib/utils";

export type WarmTypingDotsTone = "warm" | "chrome";

const DOT_SIZE = {
  sm: "h-1 w-1",
  md: "h-1.5 w-1.5",
  lg: "h-2 w-2",
} as const;

const DOT_COLOR: Record<WarmTypingDotsTone, string> = {
  warm: "bg-text-tertiary",
  chrome: "bg-chrome-text-faint",
};

/** Three-dot loading indicator (Warm & Soft — no spinner). */
export function WarmTypingDots({
  tone = "warm",
  size = "md",
  className,
  label,
}: {
  tone?: WarmTypingDotsTone;
  size?: keyof typeof DOT_SIZE;
  className?: string;
  /** Accessible name when dots stand alone (no visible label). */
  label?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "inline-block rounded-full motion-safe:animate-[warm-dot-blink_1.2s_ease-in-out_infinite]",
            DOT_SIZE[size],
            DOT_COLOR[tone],
          )}
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

export function LoadingRow({
  label,
  tone = "warm",
  className,
}: {
  label: string;
  tone?: WarmTypingDotsTone;
  className?: string;
}) {
  const text =
    tone === "chrome" ? "text-chrome-text-muted" : "text-text-secondary";
  return (
    <div className={cn("flex items-center gap-2.5 text-[13px]", text, className)}>
      <WarmTypingDots tone={tone} size="sm" label={label} />
      <span aria-hidden>{label}</span>
    </div>
  );
}
