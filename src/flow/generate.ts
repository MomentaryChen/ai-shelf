import { applyFlowClaudeDefaultModel } from "../shared/claude-tool-args.js";
import { extractFlowMarkdown } from "../shared/flow-extract.js";
import {
  buildFlowGeneratePrompt,
  type FlowGenerateMcpInventory,
  type FlowGenerateTurn,
} from "../shared/flow-generate-prompt.js";
import { buildToolLaunchCommand } from "../tool-launch.js";
import { TOOL_LAUNCH_CMD } from "../tools.js";
import { parseAgentCostFromText } from "../usage/parse-agent-cost.js";
import { listMcpServersDetailed } from "../utils/mcp-edit.js";
import { readTeamPolicy } from "../utils/team-policy-store.js";
import { spawnClaudePrint } from "./claude-spawn.js";
import { readFlowFile } from "./core.js";
import {
  FLOW_CHAT_DRAFT_ID,
  patchLatestFlowPromptLog,
} from "./flow-chat-store.js";

const GENERATE_TIMEOUT_MS = 120_000;

export type GenerateFlowOptions = {
  /** Flow id for prompt logs; defaults to draft bucket before first save. */
  flowId?: string;
  /** Optional override; when omitted, loaded from disk for existing flows. */
  currentFlowMd?: string | null;
};

export type GenerateFlowResult =
  | { ok: true; content: string; raw: string; costUsd?: number }
  | { ok: false; error: string; raw?: string; costUsd?: number };

function resolveCurrentFlowMd(flowId: string | undefined, override?: string | null): string | null {
  if (typeof override === "string" && override.trim()) return override.trim();
  const id = flowId?.trim();
  if (!id || id === FLOW_CHAT_DRAFT_ID) return null;
  return readFlowFile(id)?.content ?? null;
}

export function loadFlowGenerateMcpInventory(): FlowGenerateMcpInventory {
  const listed = listMcpServersDetailed("claude");
  const enabled: string[] = [];
  const disabled: string[] = [];
  for (const server of listed.servers ?? []) {
    const name = server.name?.trim();
    if (!name) continue;
    if (server.enabled) enabled.push(name);
    else disabled.push(name);
  }
  enabled.sort((a, b) => a.localeCompare(b));
  disabled.sort((a, b) => a.localeCompare(b));

  const policy = readTeamPolicy();
  return {
    enabled,
    disabled,
    policyRequired: policy.mcp?.required,
    policyForbidden: policy.mcp?.forbidden,
  };
}

export async function generateFlowFromChat(
  turns: FlowGenerateTurn[],
  options: GenerateFlowOptions = {},
): Promise<GenerateFlowResult> {
  if (turns.length === 0 || !turns.some((t) => t.role === "user" && t.content.trim())) {
    return { ok: false, error: "Describe the automation you want" };
  }

  const logFlowId = options.flowId?.trim() || FLOW_CHAT_DRAFT_ID;
  const currentFlowMd = resolveCurrentFlowMd(logFlowId, options.currentFlowMd);
  const mcpInventory = loadFlowGenerateMcpInventory();
  const prompt = buildFlowGeneratePrompt(turns, { currentFlowMd, mcpInventory });

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const child = spawnClaudePrint({
      launchCommand: buildToolLaunchCommand(
        TOOL_LAUNCH_CMD.claude,
        applyFlowClaudeDefaultModel(""),
      ),
      prompt,
      promptLog: { flowId: logFlowId, kind: "generate" },
    });

    const finish = (result: GenerateFlowResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      try {
        const parsed = parseAgentCostFromText(stdout, stderr);
        if (parsed.costUsd != null || parsed.inputTokens != null || parsed.outputTokens != null) {
          patchLatestFlowPromptLog(logFlowId, "generate", {
            costUsd: parsed.costUsd,
            inputTokens: parsed.inputTokens,
            outputTokens: parsed.outputTokens,
          });
        }
        resolve(parsed.costUsd != null ? { ...result, costUsd: parsed.costUsd } : result);
      } catch {
        resolve(result);
      }
    };

    timeout = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: "Generation timed out", raw: stdout });
    }, GENERATE_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      const raw = stdout.trim();
      if (code !== 0) {
        finish({
          ok: false,
          error: stderr.trim() || `claude exited with code ${code ?? "unknown"}`,
          raw,
        });
        return;
      }
      const content = extractFlowMarkdown(raw);
      if (!content) {
        finish({
          ok: false,
          error: "Could not parse a .flow.md document from the response",
          raw,
        });
        return;
      }
      finish({ ok: true, content, raw });
    });

    child.on("error", (err) => {
      finish({ ok: false, error: err.message });
    });
  });
}
