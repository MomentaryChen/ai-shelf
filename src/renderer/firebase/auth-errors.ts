/** Known Firebase Auth error codes surfaced in the settings UI. */
export type AuthErrorReason =
  | "not_configured"
  | "configuration-not-found"
  | "network-request-failed"
  | "unauthorized-domain"
  | "invalid-api-key"
  | "internal-error"
  | "unknown";

export interface ParsedAuthError {
  reason: AuthErrorReason;
  raw: string;
  code: string | null;
}

export function parseAuthError(err: unknown): ParsedAuthError {
  const raw = formatRawAuthError(err);
  const code = extractAuthCode(raw, err);
  const reason = mapCodeToReason(code, raw);
  return { reason, raw, code };
}

function formatRawAuthError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const code = String((err as { code: string }).code);
    const message = String((err as { message: string }).message);
    return `${code}: ${message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function extractAuthCode(raw: string, err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: string }).code);
  }
  const match = raw.match(/auth\/[a-z0-9-]+/i);
  return match?.[0] ?? null;
}

function mapCodeToReason(code: string | null, raw: string): AuthErrorReason {
  const haystack = `${code ?? ""} ${raw}`.toLowerCase();
  if (haystack.includes("not_configured")) return "not_configured";
  if (haystack.includes("configuration-not-found") || haystack.includes("configuration_not_found")) {
    return "configuration-not-found";
  }
  if (haystack.includes("network-request-failed")) return "network-request-failed";
  if (haystack.includes("unauthorized-domain")) return "unauthorized-domain";
  if (haystack.includes("invalid-api-key") || haystack.includes("api key not valid")) {
    return "invalid-api-key";
  }
  if (haystack.includes("internal-error")) return "internal-error";
  return "unknown";
}
