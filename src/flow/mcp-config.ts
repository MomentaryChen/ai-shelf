import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAppDataDir } from "ai-shelf";
import { canonicalToolId } from "../tools.js";
import { backupFile, tryReadJson, writeJson } from "../utils/config.js";
import type { McpServerEntry } from "../utils/mcp-codex-toml.js";
import { adaptMcpEntry } from "../utils/mcp-sync.js";

export const FLOW_MCP_SERVER_NAME = "ai-shelf-flow";

export function bundledMcpServerPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "mcp-server.js");
}

export function buildFlowMcpServerEntry(runId: string, outputPath: string): McpServerEntry {
  return {
    type: "command",
    command: process.execPath,
    args: [bundledMcpServerPath()],
    env: {
      AISHELF_RUN_ID: runId,
      AISHELF_APP_DATA_DIR: getAppDataDir(),
      AISHELF_FLOW_OUTPUT_PATH: outputPath,
    },
  };
}

export function buildFlowMcpConfigJson(runId: string, outputPath: string): string {
  const config = {
    mcpServers: {
      [FLOW_MCP_SERVER_NAME]: buildFlowMcpServerEntry(runId, outputPath),
    },
  };
  return JSON.stringify(config);
}

/** Write MCP config to a temp file for `claude --mcp-config`. */
export function writeFlowMcpConfigFile(runId: string, outputPath: string): string {
  const path = join(tmpdir(), `ai-shelf-flow-mcp-${runId}.json`);
  writeFileSync(path, buildFlowMcpConfigJson(runId, outputPath), "utf8");
  return path;
}

export function flowMcpAllowedTools(): string[] {
  return [
    `mcp__${FLOW_MCP_SERVER_NAME}__flow_progress`,
    `mcp__${FLOW_MCP_SERVER_NAME}__flow_output`,
  ];
}

export type FlowMcpMount = {
  cleanup: () => void;
};

function cursorProjectMcpPath(cwd: string): string {
  const base = cwd.trim() || process.cwd();
  return join(base, ".cursor", "mcp.json");
}

/** Cursor reads MCP from project `.cursor/mcp.json` — inject per-run server env there. */
function mountFlowMcpInCursorProject(
  runId: string,
  outputPath: string,
  cwd: string,
): FlowMcpMount {
  const configPath = cursorProjectMcpPath(cwd);
  mkdirSync(dirname(configPath), { recursive: true });

  const existed = existsSync(configPath);
  const data = (existed ? tryReadJson<Record<string, unknown>>(configPath) : null) ?? {};
  const servers = { ...((data["mcpServers"] as Record<string, McpServerEntry>) ?? {}) };
  const hadEntry = FLOW_MCP_SERVER_NAME in servers;
  const previous = hadEntry ? structuredClone(servers[FLOW_MCP_SERVER_NAME]) : undefined;

  servers[FLOW_MCP_SERVER_NAME] = adaptMcpEntry(
    buildFlowMcpServerEntry(runId, outputPath),
    "cursor",
  );
  data["mcpServers"] = servers;

  if (existed) backupFile(configPath);
  writeJson(configPath, data);

  return {
    cleanup: () => {
      try {
        if (!existsSync(configPath)) return;
        const current = tryReadJson<Record<string, unknown>>(configPath);
        if (!current) return;
        const nextServers = { ...((current["mcpServers"] as Record<string, McpServerEntry>) ?? {}) };
        if (hadEntry && previous) {
          nextServers[FLOW_MCP_SERVER_NAME] = previous;
        } else {
          delete nextServers[FLOW_MCP_SERVER_NAME];
        }
        if (Object.keys(nextServers).length === 0 && !existed) {
          unlinkSync(configPath);
          return;
        }
        current["mcpServers"] = nextServers;
        writeJson(configPath, current);
      } catch {
        /* best-effort restore */
      }
    },
  };
}

export function mountFlowMcpForAgent(
  tool: string,
  runId: string,
  outputPath: string,
  cwd: string,
): FlowMcpMount {
  if (canonicalToolId(tool) === "cursor") {
    return mountFlowMcpInCursorProject(runId, outputPath, cwd);
  }
  return { cleanup: () => {} };
}

export function flowAgentPrintPrefix(tool: string): string[] {
  if (canonicalToolId(tool) === "cursor") {
    return ["-p", "--output-format", "text"];
  }
  return ["-p", "--input-format", "text"];
}

export function flowAgentMcpSpawnArgs(tool: string, runId: string, outputPath: string): string[] {
  const canonical = canonicalToolId(tool);
  if (canonical === "claude") {
    const mcpConfigPath = writeFlowMcpConfigFile(runId, outputPath);
    return ["--mcp-config", mcpConfigPath, "--allowedTools", ...flowMcpAllowedTools()];
  }
  if (canonical === "cursor") {
    return ["--approve-mcps", "--trust", "--force"];
  }
  return [];
}

export function prepareFlowAgentSpawn(
  tool: string,
  runId: string,
  outputPath: string,
  cwd: string,
): {
  mcpMount: FlowMcpMount;
  printPrefix: string[];
  extraArgs: string[];
} {
  return {
    mcpMount: mountFlowMcpForAgent(tool, runId, outputPath, cwd),
    printPrefix: flowAgentPrintPrefix(tool),
    extraArgs: flowAgentMcpSpawnArgs(tool, runId, outputPath),
  };
}
