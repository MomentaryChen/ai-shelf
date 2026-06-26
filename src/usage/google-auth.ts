import { createSign } from "node:crypto";

export interface GcpServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function parseServiceAccountJson(raw: string): GcpServiceAccount {
  const parsed = JSON.parse(raw.trim()) as Partial<GcpServiceAccount>;
  if (!parsed.client_email?.trim() || !parsed.private_key?.trim() || !parsed.project_id?.trim()) {
    throw new Error("Invalid service account JSON (need project_id, client_email, private_key)");
  }
  return {
    project_id: parsed.project_id.trim(),
    client_email: parsed.client_email.trim(),
    private_key: parsed.private_key.trim(),
  };
}

function base64url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

export async function getGcpAccessToken(sa: GcpServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(body.error || `GCP auth failed (HTTP ${res.status})`);
  }
  return body.access_token;
}
