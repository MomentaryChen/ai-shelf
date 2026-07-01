import { applyFlowClaudeDefaultModel } from "../shared/claude-tool-args.js";
import { extractFlowMarkdown } from "../shared/flow-extract.js";
import {
  buildFlowGeneratePrompt,
  type FlowGenerateTurn,
} from "../shared/flow-generate-prompt.js";
import { buildToolLaunchCommand } from "../tool-launch.js";
import { TOOL_LAUNCH_CMD } from "../tools.js";
import { spawnClaudePrint } from "./claude-spawn.js";
import { FLOW_CHAT_DRAFT_ID } from "./flow-chat-store.js";

const GENERATE_TIMEOUT_MS = 120_000;

export type GenerateFlowOptions = {
  /** Flow id for prompt logs; defaults to draft bucket before first save. */
  flowId?: string;
};

export type GenerateFlowResult =
  | { ok: true; content: string; raw: string }
  | { ok: false; error: string; raw?: string };

export async function generateFlowFromChat(
  turns: FlowGenerateTurn[],
  options: GenerateFlowOptions = {},
): Promise<GenerateFlowResult> {
  if (turns.length === 0 || !turns.some((t) => t.role === "user" && t.content.trim())) {
    return { ok: false, error: "Describe the automation you want" };
  }

  const prompt = buildFlowGeneratePrompt(turns);
  const logFlowId = options.flowId?.trim() || FLOW_CHAT_DRAFT_ID;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawnClaudePrint({
      launchCommand: buildToolLaunchCommand(
        TOOL_LAUNCH_CMD.claude,
        applyFlowClaudeDefaultModel(""),
      ),
      prompt,
      promptLog: { flowId: logFlowId, kind: "generate" },
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: "Generation timed out", raw: stdout });
    }, GENERATE_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const raw = stdout.trim();
      if (code !== 0) {
        resolve({
          ok: false,
          error: stderr.trim() || `claude exited with code ${code ?? "unknown"}`,
          raw,
        });
        return;
      }
      const content = extractFlowMarkdown(raw);
      if (!content) {
        resolve({
          ok: false,
          error: "Could not parse a .flow.md document from the response",
          raw,
        });
        return;
      }
      resolve({ ok: true, content, raw });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: err.message });
    });
  });
}
