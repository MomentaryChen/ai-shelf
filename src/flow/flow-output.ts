import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { FlowRunState } from "../shared/flow-types.js";

export function buildFallbackOutputMarkdown(options: {
  flowId: string;
  runId: string;
  status: "failed" | "cancelled";
  error?: string | null;
  stderr?: string;
  partialStdout?: string;
}): string {
  const lines = [
    "# Flow run report",
    "",
    `- Flow: \`${options.flowId}\``,
    `- Run: \`${options.runId}\``,
    `- Status: ${options.status}`,
  ];
  if (options.error) lines.push(`- Error: ${options.error}`);
  lines.push("", "## Details", "");
  if (options.partialStdout?.trim()) {
    lines.push("### Captured stdout", "", "```", options.partialStdout.trim(), "```", "");
  }
  if (options.stderr?.trim()) {
    lines.push("### Captured stderr", "", "```", options.stderr.trim(), "```", "");
  }
  if (!options.partialStdout?.trim() && !options.stderr?.trim()) {
    lines.push("_No additional agent output captured._");
  }
  return lines.join("\n");
}

/** Write markdown to outputPath when the run has not produced output yet. */
export function writeRunOutputIfMissing(
  state: FlowRunState,
  outputPath: string,
  content: string,
): boolean {
  if (state.outputPath && existsSync(state.outputPath)) return false;
  mkdirSync(dirname(outputPath), { recursive: true });
  const body = content.endsWith("\n") ? content : `${content}\n`;
  writeFileSync(outputPath, body, "utf8");
  state.outputPath = outputPath;
  return true;
}
