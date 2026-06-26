import type { ProviderEntry } from "../inventory/types.js";
import { tryReadJson } from "../utils/config.js";
import { validateMcpConfigPath } from "../utils/mcp-sync.js";

export type DoctorCheck = {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
};

export type DoctorToolResult = {
  tool: string;
  checks: DoctorCheck[];
};

export function runChecksForEntry(entry: ProviderEntry): DoctorToolResult {
  const checks: DoctorCheck[] = [];

  checks.push({
    name: "binary",
    status: entry.available ? "pass" : "fail",
    detail: entry.available
      ? `${entry.tool} found (${entry.version})`
      : `${entry.tool} not found in PATH`,
  });

  if (entry.available) {
    checks.push({
      name: "auth",
      status: entry.auth === "ok" ? "pass" : entry.auth === "missing" ? "fail" : "warn",
      detail: `auth: ${entry.auth}`,
    });
  }

  for (const p of entry.config.paths) {
    if (p.endsWith(".json")) {
      const ok = tryReadJson(p) !== null;
      checks.push({
        name: "config",
        status: ok ? "pass" : "fail",
        detail: `${ok ? "valid" : "invalid"} JSON: ${p}`,
      });
    }
  }

  for (const p of entry.mcp.configPaths) {
    const ok = validateMcpConfigPath(entry.tool, p);
    const kind = p.endsWith(".toml") ? "TOML" : "JSON";
    checks.push({
      name: "mcp-config",
      status: ok ? "pass" : "fail",
      detail: `${ok ? "valid" : "invalid"} MCP config (${kind}): ${p}`,
    });
  }

  return { tool: entry.tool, checks };
}
