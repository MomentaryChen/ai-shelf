import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { claudeJsonPath, tryReadJson } from "../utils/config.js";
import type { MCPInfo, McpServerDetail } from "./types.js";

interface ClaudeJson {
  mcpServers?: Record<string, unknown>;
  projects?: Record<string, { mcpServers?: Record<string, unknown> } | undefined>;
}

function serverNames(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function projectKey(path: string): string {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export interface ClaudeMcpScanOptions {
  /** Override the Claude global state file (defaults to `claudeJsonPath()`). */
  claudeJson?: string;
  /** Extra project roots to probe for `.mcp.json` (defaults to `[process.cwd()]`). */
  projectRoots?: string[];
}

/**
 * Collect Claude Code MCP servers across all three scopes:
 * - user:    top-level `mcpServers` in `~/.claude.json`
 * - local:   `projects[<path>].mcpServers` in `~/.claude.json`
 * - project: `<root>/.mcp.json` for the cwd and every project known to `~/.claude.json`
 */
export function scanClaudeMcp(opts: ClaudeMcpScanOptions = {}): MCPInfo {
  const claudeJson = opts.claudeJson ?? claudeJsonPath();
  const data = tryReadJson<ClaudeJson>(claudeJson);
  const details: McpServerDetail[] = [];
  const configPaths: string[] = [];

  if (data && existsSync(claudeJson)) configPaths.push(claudeJson);

  for (const name of serverNames(data?.mcpServers)) {
    details.push({ name, scope: "user", source: claudeJson });
  }

  const projects = data?.projects && typeof data.projects === "object" ? data.projects : {};
  for (const [project, entry] of Object.entries(projects)) {
    for (const name of serverNames(entry?.mcpServers)) {
      details.push({ name, scope: "local", source: claudeJson, project });
    }
  }

  const seenRoots = new Set<string>();
  const roots = [...(opts.projectRoots ?? [process.cwd()]), ...Object.keys(projects)];
  for (const root of roots) {
    const key = projectKey(root);
    if (seenRoots.has(key)) continue;
    seenRoots.add(key);

    const mcpJson = join(root, ".mcp.json");
    if (!existsSync(mcpJson)) continue;
    const projectData = tryReadJson<{ mcpServers?: Record<string, unknown> }>(mcpJson);
    if (!projectData) continue;
    configPaths.push(mcpJson);
    for (const name of serverNames(projectData.mcpServers)) {
      details.push({ name, scope: "project", source: mcpJson, project: root });
    }
  }

  return {
    supported: true,
    servers: [...new Set(details.map((d) => d.name))],
    configPaths,
    serverDetails: details,
  };
}
