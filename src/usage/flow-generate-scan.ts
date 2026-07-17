import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAppDataDir } from "ai-shelf";
import { FLOW_CHAT_DRAFT_ID, type FlowPromptLogEntry } from "../shared/flow-chat-types.js";
import type { AttributionRunInput } from "./attribution.js";

function flowChatRoot(): string {
  return join(getAppDataDir(), "flow-chat");
}

function promptsPath(flowId: string): string {
  return join(flowChatRoot(), flowId, "prompts.jsonl");
}

function listFlowChatIds(): string[] {
  const root = flowChatRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/**
 * Scan flow-chat prompt logs for measured generate costs and expose them as
 * attribution rows (same shape as runs) so Usage insights include authoring spend.
 */
export function scanFlowGenerateCostsForAttribution(limit = 500): AttributionRunInput[] {
  const rows: AttributionRunInput[] = [];

  for (const flowId of listFlowChatIds()) {
    const path = promptsPath(flowId);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]!) as FlowPromptLogEntry;
        if (entry.kind !== "generate") continue;
        const cost = entry.costUsd;
        if (cost == null || !Number.isFinite(cost) || cost <= 0) continue;
        const t = entry.t || new Date(0).toISOString();
        const attributedFlowId = entry.flowId?.trim() || flowId || FLOW_CHAT_DRAFT_ID;
        rows.push({
          runId: `generate:${attributedFlowId}:${t}:${i}`,
          flowId: attributedFlowId,
          status: "completed",
          startedAt: t,
          updatedAt: t,
          completedAt: t,
          agentTool: "claude",
          costUsd: cost,
          costEstimated: false,
        });
      } catch {
        /* skip malformed */
      }
    }
  }

  return rows
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
}
