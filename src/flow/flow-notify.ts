import type { FlowDefinition, FlowRunState } from "../shared/flow-types.js";

export type FlowNotifyHooks = {
  onRunFailed?: (flow: FlowDefinition, state: FlowRunState) => void | Promise<void>;
};

let hooks: FlowNotifyHooks = {};

export function setFlowNotifyHooks(next: FlowNotifyHooks): void {
  hooks = next;
}

export async function notifyFlowRunFailed(
  flow: FlowDefinition,
  state: FlowRunState,
): Promise<void> {
  if (flow.onFail === "slack") {
    await postSlackWebhook(flow, state);
  }
  await hooks.onRunFailed?.(flow, state);
}

async function postSlackWebhook(flow: FlowDefinition, state: FlowRunState): Promise<void> {
  const url = process.env.AISHELF_FLOW_SLACK_WEBHOOK?.trim();
  if (!url) {
    console.warn("[flow-notify] on_fail: slack set but AISHELF_FLOW_SLACK_WEBHOOK is missing");
    return;
  }
  const text = [
    `AI Shelf flow failed: *${flow.id}*`,
    state.error ? `Error: ${state.error}` : "",
    state.logPath ? `Log: ${state.logPath}` : "",
  ]
    .filter(Boolean)
    .join("\n");

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
