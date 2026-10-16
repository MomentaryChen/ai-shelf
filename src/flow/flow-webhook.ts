import { expandEnvPlaceholders } from "../shared/flow-env.js";
import type {
  FlowDefinition,
  FlowNotifyEvent,
  FlowRunState,
  FlowWebhookDef,
} from "../shared/flow-types.js";

export type FlowWebhookRequest = {
  url: string;
  init: { method: string; headers: Record<string, string>; body?: string };
};

export function flowRunOutcome(state: FlowRunState): FlowNotifyEvent | null {
  if (state.status === "completed") return "success";
  if (state.status === "failed") return "failure";
  return null;
}

function durationSec(state: FlowRunState): number | null {
  const start = Date.parse(state.startedAt);
  const end = Date.parse(state.completedAt ?? state.updatedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 1000));
}

/** Placeholder values available to webhook payload templates. */
export function flowWebhookVariables(
  flow: FlowDefinition,
  state: FlowRunState,
): Record<string, string> {
  const duration = durationSec(state);
  return {
    flow_id: flow.id,
    run_id: state.runId,
    status: state.status,
    error: state.error ?? "",
    output_path: state.outputPath ?? "",
    duration_sec: duration === null ? "" : String(duration),
    started_at: state.startedAt,
    completed_at: state.completedAt ?? "",
  };
}

function jsonEscape(value: string): string {
  // JSON.stringify adds the surrounding quotes; templates already contain them.
  return JSON.stringify(value).slice(1, -1);
}

/**
 * Expand `{flow_id}`-style placeholders (JSON-escaped when the body is JSON, so
 * `"text": "{error}"` stays valid with quotes/newlines) and `${ENV_VAR}` references.
 */
export function renderWebhookTemplate(
  template: string,
  vars: Record<string, string>,
  options: { json: boolean; env?: Record<string, string | undefined> },
): string {
  const withVars = template.replace(/\{([a-z_]+)\}/g, (match, name: string) => {
    if (!(name in vars)) return match;
    const value = vars[name]!;
    return options.json ? jsonEscape(value) : value;
  });
  return expandEnvPlaceholders(withVars, options.env ?? {});
}

export function defaultWebhookPayload(vars: Record<string, string>): string {
  return JSON.stringify({
    flowId: vars.flow_id,
    runId: vars.run_id,
    status: vars.status,
    error: vars.error || null,
    outputPath: vars.output_path || null,
    durationSec: vars.duration_sec ? Number(vars.duration_sec) : null,
    startedAt: vars.started_at,
    completedAt: vars.completed_at || null,
  });
}

/** Build the fetch request for one webhook, or null when it does not fire for this outcome. */
export function buildFlowWebhookRequest(
  hook: FlowWebhookDef,
  flow: FlowDefinition,
  state: FlowRunState,
  env: Record<string, string | undefined> = process.env,
): FlowWebhookRequest | null {
  const outcome = flowRunOutcome(state);
  if (!outcome || !hook.on.includes(outcome)) return null;

  const vars = flowWebhookVariables(flow, state);
  const contentType = hook.contentType?.trim() || "application/json";
  const json = /json/i.test(contentType);
  const url = expandEnvPlaceholders(hook.url, env);
  const headers: Record<string, string> = {};
  if (hook.authorization) {
    headers.Authorization = expandEnvPlaceholders(hook.authorization, env);
  }

  if (hook.method === "GET") {
    // GET carries no body; placeholders in the URL are URL-encoded.
    const encoded = Object.fromEntries(
      Object.entries(vars).map(([k, v]) => [k, encodeURIComponent(v)]),
    );
    return {
      url: renderWebhookTemplate(url, encoded, { json: false }),
      init: { method: "GET", headers },
    };
  }

  headers["Content-Type"] = contentType;
  const body = hook.payload
    ? renderWebhookTemplate(hook.payload, vars, { json, env })
    : defaultWebhookPayload(vars);
  return { url, init: { method: hook.method, headers, body } };
}

export type WebhookFetch = (
  url: string,
  init: FlowWebhookRequest["init"],
) => Promise<{ ok: boolean; status: number }>;

/** Fire every matching webhook; failures are logged, never thrown. */
export async function sendFlowWebhooks(
  flow: FlowDefinition,
  state: FlowRunState,
  fetchImpl: WebhookFetch = (url, init) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
): Promise<{ url: string; ok: boolean; status?: number; error?: string }[]> {
  const results: { url: string; ok: boolean; status?: number; error?: string }[] = [];
  for (const hook of flow.webhooks ?? []) {
    const req = buildFlowWebhookRequest(hook, flow, state);
    if (!req) continue;
    try {
      const res = await fetchImpl(req.url, req.init);
      if (!res.ok) console.warn(`[flow-notify] webhook ${hook.method} HTTP ${res.status}`);
      results.push({ url: req.url, ok: res.ok, status: res.status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[flow-notify] webhook failed:", message);
      results.push({ url: req.url, ok: false, error: message });
    }
  }
  return results;
}
