import { detectAll } from "../inventory/index.js";
import { tryReadJson } from "../utils/config.js";
import { validateMcpConfigPath } from "../utils/mcp-sync.js";

type Options = { json: boolean };

interface DiagnosticResult {
  tool: string;
  checks: { name: string; status: "pass" | "fail" | "warn"; detail: string }[];
}

export async function runDoctor(opts: Options) {
  const entries = await detectAll();
  const results: DiagnosticResult[] = [];

  for (const entry of entries) {
    const checks: DiagnosticResult["checks"] = [];

    // Binary available
    checks.push({
      name: "binary",
      status: entry.available ? "pass" : "fail",
      detail: entry.available ? `${entry.tool} found (${entry.version})` : `${entry.tool} not found in PATH`,
    });

    // Auth
    if (entry.available) {
      checks.push({
        name: "auth",
        status: entry.auth === "ok" ? "pass" : entry.auth === "missing" ? "fail" : "warn",
        detail: `auth: ${entry.auth}`,
      });
    }

    // Config files parseable
    for (const p of entry.config.paths) {
      if (p.endsWith(".json")) {
        const ok = tryReadJson(p) !== null;
        checks.push({ name: "config", status: ok ? "pass" : "fail", detail: `${ok ? "valid" : "invalid"} JSON: ${p}` });
      }
    }

    // MCP config parseable
    for (const p of entry.mcp.configPaths) {
      const ok = validateMcpConfigPath(entry.tool, p);
      const kind = p.endsWith(".toml") ? "TOML" : "JSON";
      checks.push({
        name: "mcp-config",
        status: ok ? "pass" : "fail",
        detail: `${ok ? "valid" : "invalid"} MCP config (${kind}): ${p}`,
      });
    }

    results.push({ tool: entry.tool, checks });
  }

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log("\n  AI Doctor\n");
  for (const r of results) {
    console.log(`  ${r.tool}:`);
    for (const c of r.checks) {
      const icon = c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "!";
      console.log(`    ${icon} ${c.detail}`);
    }
  }
  console.log();
}
