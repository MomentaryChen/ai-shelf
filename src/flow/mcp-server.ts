#!/usr/bin/env node
/**
 * Stdio MCP server for AI Flow runs.
 * Spawned by `claude -p --mcp-config` with AISHELF_RUN_ID set by the runner.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { applyProgressToRun, writeRunOutput } from "./run-state-store.js";

const runId = process.env["AISHELF_RUN_ID"]?.trim();
if (!runId) {
  console.error("AISHELF_RUN_ID is required");
  process.exit(1);
}

const progressTypes = z.enum([
  "phase.started",
  "phase.done",
  "phase.failed",
  "phase.skipped",
  "phase.message",
]);

const server = new McpServer({
  name: "ai-shelf-flow",
  version: "1.0.0",
});

server.registerTool(
  "flow_progress",
  {
    description: "Update flow run phase progress (writes runs/{runId}/state.json)",
    inputSchema: {
      type: progressTypes,
      phaseId: z.string().min(1).describe("Phase id from the flow definition"),
      message: z.string().optional().describe("Optional status or error message"),
    },
  },
  async ({ type, phaseId, message }) => {
    const result = applyProgressToRun(runId, { type, phaseId, message });
    if (!result.ok) {
      return {
        content: [{ type: "text" as const, text: result.error ?? "failed" }],
        isError: true,
      };
    }

    const { progress, currentPhaseId } = result.state!;
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, progress, currentPhaseId }),
        },
      ],
    };
  },
);

server.registerTool(
  "flow_output",
  {
    description: "Write the final flow output report (markdown)",
    inputSchema: {
      content: z.string().describe("Full report body in markdown"),
    },
  },
  async ({ content }) => {
    const result = writeRunOutput(runId, content);
    if (!result.ok) {
      return {
        content: [{ type: "text" as const, text: result.error ?? "failed" }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, outputPath: result.outputPath }),
        },
      ],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
