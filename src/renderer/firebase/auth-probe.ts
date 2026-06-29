import { getFirebaseConfig } from "./config.js";
import type { AuthErrorReason } from "./auth-errors.js";

export type AuthProbeResult =
  | { ok: true }
  | { ok: false; reason: AuthErrorReason; detail?: string };

/**
 * Calls Identity Toolkit to verify Auth is enabled for this Firebase project.
 * Returns configuration-not-found when Authentication was never set up in Console.
 */
export async function probeFirebaseAuthSetup(): Promise<AuthProbeResult> {
  const config = getFirebaseConfig();
  if (!config) return { ok: false, reason: "not_configured" };

  const url = `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(config.apiKey)}`;
  try {
    const res = await fetch(url);
    if (res.ok) return { ok: true };

    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    const message = String(body.error?.message ?? res.statusText);

    if (message.includes("CONFIGURATION_NOT_FOUND") || message.includes("configuration-not-found")) {
      return { ok: false, reason: "configuration-not-found", detail: message };
    }
    if (message.toLowerCase().includes("api key not valid") || res.status === 403) {
      return { ok: false, reason: "invalid-api-key", detail: message };
    }
    return { ok: false, reason: "unknown", detail: message };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "network-request-failed", detail };
  }
}
