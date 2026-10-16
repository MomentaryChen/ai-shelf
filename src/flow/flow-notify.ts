import type { FlowDefinition, FlowNotifyEvent, FlowRunState } from "../shared/flow-types.js";
import { sendFlowWebhooks } from "./flow-webhook.js";

export type FlowNotifyHooks = {
  onRunFailed?: (flow: FlowDefinition, state: FlowRunState) => void | Promise<void>;
  onRunCompleted?: (flow: FlowDefinition, state: FlowRunState) => void | Promise<void>;
};

let hooks: FlowNotifyHooks = {};

export function setFlowNotifyHooks(next: FlowNotifyHooks): void {
  hooks = next;
}

/** True when the flow's `notify` policy allows a desktop notification for this outcome. */
export function flowDesktopNotifyAllowed(flow: FlowDefinition, outcome: FlowNotifyEvent): boolean {
  const mode = flow.notify ?? "all";
  if (mode === "none") return false;
  if (mode === "all") return true;
  return mode === outcome;
}

export async function notifyFlowRunFailed(
  flow: FlowDefinition,
  state: FlowRunState,
): Promise<void> {
  if (flow.onFail === "slack") {
    await postSlackWebhook(flow, state, "failure");
  }
  await sendFlowWebhooks(flow, state);
  if (flowDesktopNotifyAllowed(flow, "failure")) {
    await hooks.onRunFailed?.(flow, state);
  }
}

export async function notifyFlowRunCompleted(
  flow: FlowDefinition,
  state: FlowRunState,
): Promise<void> {
  if (flow.onSuccess === "slack") {
    await postSlackWebhook(flow, state, "success");
  }
  await sendFlowWebhooks(flow, state);
  if (flowDesktopNotifyAllowed(flow, "success")) {
    await hooks.onRunCompleted?.(flow, state);
  }
}

export function buildSlackText(
  flow: FlowDefinition,
  state: FlowRunState,
  outcome: FlowNotifyEvent,
): string {
  const lines =
    outcome === "failure"
      ? [
          `AI Shelf flow failed: *${flow.id}*`,
          state.error ? `Error: ${state.error}` : "",
          state.logPath ? `Log: ${state.logPath}` : "",
        ]
      : [
          `AI Shelf flow completed: *${flow.id}*`,
          state.outputPath ? `Output: ${state.outputPath}` : "",
        ];
  return lines.filter(Boolean).join("\n");
}

async function postSlackWebhook(
  flow: FlowDefinition,
  state: FlowRunState,
  outcome: FlowNotifyEvent,
): Promise<void> {
  const url = process.env.AISHELF_FLOW_SLACK_WEBHOOK?.trim();
  if (!url) {
    const field = outcome === "failure" ? "on_fail" : "on_success";
    console.warn(`[flow-notify] ${field}: slack set but AISHELF_FLOW_SLACK_WEBHOOK is missing`);
    return;
  }
  const text = buildSlackText(flow, state, outcome);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.warn(`[flow-notify] Slack webhook HTTP ${res.status}`);
    }
  } catch (err: unknown) {
    console.warn("[flow-notify] Slack webhook failed:", err instanceof Error ? err.message : err);
  }
}
