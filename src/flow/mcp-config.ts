import { existsSync, mkdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAppDataDir } from "ai-shelf";
import { canonicalToolId } from "../tools.js";
import { backupFile, tryReadJson, writeJson } from "../utils/config.js";
import type { McpServerEntry } from "../utils/mcp-codex-toml.js";
import { readMcpServers, adaptMcpEntry } from "../utils/mcp-sync.js";

export const FLOW_MCP_SERVER_NAME = "ai-shelf-flow";

export type FlowAgentSpawnScope = {
  extraMcpServers?: string[];
  agentAllowedTools?: string[];
};

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

export function buildFlowMcpConfigJson(
  runId: string,
  outputPath: string,
  extraServerNames: string[] = [],
): string {
  const servers: Record<string, McpServerEntry> = {
    [FLOW_MCP_SERVER_NAME]: buildFlowMcpServerEntry(runId, outputPath),
  };

  if (extraServerNames.length > 0) {
    const userServers = readMcpServers("claude");
    for (const raw of extraServerNames) {
      const name = raw.trim();
      if (!name) continue;
      const entry = userServers[name];
      if (entry) servers[name] = entry;
    }
  }

  const config = { mcpServers: servers };
  return JSON.stringify(config);
}

export function flowMcpConfigTempPath(runId: string): string {
  return join(tmpdir(), `ai-shelf-flow-mcp-${runId}.json`);
}

/** Best-effort delete of a per-run MCP config temp file. */
export function deleteFlowMcpConfigFile(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* best-effort */
  }
}

/** Write MCP config to a temp file for `claude -p --mcp-config`. */
export function writeFlowMcpConfigFile(
  runId: string,
  outputPath: string,
  extraServerNames: string[] = [],
): string {
  const path = flowMcpConfigTempPath(runId);
  writeFileSync(path, buildFlowMcpConfigJson(runId, outputPath, extraServerNames), "utf8");
  return path;
}

export type FlowAgentSpawnOptions = {
  /** When false, args reference the temp path but no file is written (preview only). */
  writeMcpConfig?: boolean;
};

export function flowMcpAllowedTools(): string[] {
  return [
    `mcp__${FLOW_MCP_SERVER_NAME}__flow_progress`,
    `mcp__${FLOW_MCP_SERVER_NAME}__flow_output`,
  ];
}

/** Build `--allowedTools` patterns: flow MCP + optional extra servers/tools from frontmatter. */
export function buildFlowAgentAllowedTools(
  extraServerNames: string[] = [],
  extraPatterns: string[] = [],
): string[] {
  const fromServers = extraServerNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `mcp__${name}__*`);
  const merged = [
    ...flowMcpAllowedTools(),
    ...fromServers,
    ...extraPatterns.map((p) => p.trim()).filter(Boolean),
  ];
  return [...new Set(merged)];
}

export type FlowMcpMount = {
  cleanup: () => void;
};

function cursorProjectMcpPath(cwd: string): string {
  const base = cwd.trim() || process.cwd();
  const resolvedBase = existsSync(base) ? realpathSync.native(base) : resolve(base);
  return join(resolvedBase, ".cursor", "mcp.json");
}

type CursorMcpMountEntry = {
  mountId: number;
  runId: string;
  outputPath: string;
};

type CursorMcpMountGroup = {
  fileExisted: boolean;
  hadEntry: boolean;
  originalEntry?: McpServerEntry;
  mounts: CursorMcpMountEntry[];
};

/** Per-project mount registry so concurrent runs in the same cwd don't clobber cleanup. */
const cursorMcpMountGroups = new Map<string, CursorMcpMountGroup>();
let nextCursorMcpMountId = 0;

function flowMcpEntryForCursor(runId: string, outputPath: string): McpServerEntry {
  return adaptMcpEntry(buildFlowMcpServerEntry(runId, outputPath), "cursor");
}

function writeFlowMcpToCursorProject(
  configPath: string,
  runId: string,
  outputPath: string,
): void {
  const existed = existsSync(configPath);
  const data = (existed ? tryReadJson<Record<string, unknown>>(configPath) : null) ?? {};
  const servers = { ...((data["mcpServers"] as Record<string, McpServerEntry>) ?? {}) };
  servers[FLOW_MCP_SERVER_NAME] = flowMcpEntryForCursor(runId, outputPath);
  data["mcpServers"] = servers;
  writeJson(configPath, data);
}

function restoreCursorProjectMcp(group: CursorMcpMountGroup, configPath: string): void {
  try {
    if (!existsSync(configPath)) return;
    const current = tryReadJson<Record<string, unknown>>(configPath);
    if (!current) return;
    const nextServers = { ...((current["mcpServers"] as Record<string, McpServerEntry>) ?? {}) };
    if (group.hadEntry && group.originalEntry) {
      nextServers[FLOW_MCP_SERVER_NAME] = group.originalEntry;
    } else {
      delete nextServers[FLOW_MCP_SERVER_NAME];
    }
    if (Object.keys(nextServers).length === 0 && !group.fileExisted) {
      unlinkSync(configPath);
      return;
    }
    current["mcpServers"] = nextServers;
    writeJson(configPath, current);
  } catch {
    /* best-effort restore */
  }
}

/** Cursor reads MCP from project `.cursor/mcp.json` — inject per-run server env there. */
function mountFlowMcpInCursorProject(
  runId: string,
  outputPath: string,
  cwd: string,
): FlowMcpMount {
  const configPath = cursorProjectMcpPath(cwd);
  mkdirSync(dirname(configPath), { recursive: true });

  let group = cursorMcpMountGroups.get(configPath);
  if (!group) {
    const existed = existsSync(configPath);
    const data = (existed ? tryReadJson<Record<string, unknown>>(configPath) : null) ?? {};
    const servers = (data["mcpServers"] as Record<string, McpServerEntry>) ?? {};
    const hadEntry = FLOW_MCP_SERVER_NAME in servers;
    const originalEntry = hadEntry ? structuredClone(servers[FLOW_MCP_SERVER_NAME]) : undefined;

    group = { fileExisted: existed, hadEntry, originalEntry, mounts: [] };
    cursorMcpMountGroups.set(configPath, group);

    if (existed) backupFile(configPath);
  }

  group.mounts.push({ mountId: ++nextCursorMcpMountId, runId, outputPath });
  writeFlowMcpToCursorProject(configPath, runId, outputPath);

  const mountId = nextCursorMcpMountId;
  return {
    cleanup: () => {
      const g = cursorMcpMountGroups.get(configPath);
      if (!g) return;

      const idx = g.mounts.findIndex((m) => m.mountId === mountId);
      if (idx === -1) return;
      g.mounts.splice(idx, 1);

      if (g.mounts.length === 0) {
        cursorMcpMountGroups.delete(configPath);
        restoreCursorProjectMcp(g, configPath);
        return;
      }

      const last = g.mounts[g.mounts.length - 1]!;
      writeFlowMcpToCursorProject(configPath, last.runId, last.outputPath);
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

export function flowAgentMcpSpawnArgs(
  tool: string,
  runId: string,
  outputPath: string,
  scope: FlowAgentSpawnScope = {},
  options: FlowAgentSpawnOptions = {},
): { args: string[]; mcpConfigPath?: string } {
  const writeMcpConfig = options.writeMcpConfig !== false;
  const canonical = canonicalToolId(tool);
  if (canonical === "claude") {
    const extraMcp = scope.extraMcpServers ?? [];
    const mcpConfigPath = flowMcpConfigTempPath(runId);
    if (writeMcpConfig) {
      writeFileSync(
        mcpConfigPath,
        buildFlowMcpConfigJson(runId, outputPath, extraMcp),
        "utf8",
      );
    }
    const allowed = buildFlowAgentAllowedTools(extraMcp, scope.agentAllowedTools ?? []);
    return {
      args: [
        "--strict-mcp-config",
        "--mcp-config",
        mcpConfigPath,
        "--tools",
        "",
        "--allowedTools",
        ...allowed,
      ],
      mcpConfigPath: writeMcpConfig ? mcpConfigPath : undefined,
    };
  }
  if (canonical === "cursor") {
    return { args: ["--approve-mcps", "--trust", "--force"] };
  }
  return { args: [] };
}

export function prepareFlowAgentSpawn(
  tool: string,
  runId: string,
  outputPath: string,
  cwd: string,
  scope: FlowAgentSpawnScope = {},
  options: FlowAgentSpawnOptions = {},
): {
  mcpMount: FlowMcpMount;
  printPrefix: string[];
  extraArgs: string[];
} {
  const writeMcpConfig = options.writeMcpConfig !== false;
  const agentMount = writeMcpConfig
    ? mountFlowMcpForAgent(tool, runId, outputPath, cwd)
    : { cleanup: () => {} };
  const { args: extraArgs, mcpConfigPath } = flowAgentMcpSpawnArgs(
    tool,
    runId,
    outputPath,
    scope,
    options,
  );
  return {
    mcpMount: {
      cleanup: () => {
        agentMount.cleanup();
        if (mcpConfigPath) deleteFlowMcpConfigFile(mcpConfigPath);
      },
    },
    printPrefix: flowAgentPrintPrefix(tool),
    extraArgs,
  };
}
