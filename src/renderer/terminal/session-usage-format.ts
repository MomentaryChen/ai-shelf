/** Compact token count for the status bar: `950`, `12.3k`, `1.23M`. */
export function formatCompactTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 100 ? k.toFixed(1) : Math.round(k)}k`;
  }
  const m = n / 1_000_000;
  return `${m < 100 ? m.toFixed(2) : Math.round(m)}M`;
}

/** Estimated cost for the status bar: `<$0.01`, `$0.42`, `$12.30`, `$123`. */
export function formatSessionCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}

/** Full count with thousands separators for the tooltip. */
export function formatExactTokens(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
