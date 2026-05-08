import type { ProviderEntry } from "../inventory/types.js";
import { detectAll } from "../inventory/index.js";
import { detectClaude } from "../inventory/claude.js";
import { detectCopilot } from "../inventory/copilot.js";
import { detectCursor } from "../inventory/cursor.js";

type Options = { json: boolean };

export async function runInventory(args: string[], opts: Options) {
  const [sub, ...rest] = args;

  if (!sub) {
    return showOverview(opts);
  }

  switch (sub) {
    case "models":
      return showModels(opts);
    case "skills":
      return showSkills(opts);
    case "mcp":
      return showMcp(opts);
    case "config":
      return showConfig(opts);
    default:
      // Treat as specific tool detail
      return showToolDetail(sub, opts);
  }
}

async function showOverview(opts: Options) {
  const entries = await detectAll();
  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log("\n  AI CLI Inventory\n");

  // Capability matrix table
  const header = padRow("TOOL", "AUTH", "MCP", "MODEL", "CTX", "STREAM", "TOOLS", "SKILLS");
  console.log(header);
  console.log("  " + "─".repeat(90));

  for (const e of entries) {
    const ctx = e.capabilities.contextTokens
      ? `${Math.round(e.capabilities.contextTokens / 1000)}k`
      : "—";
    const skills = e.skills.slice(0, 4).join(",");
    console.log(
      padRow(
        e.tool,
        e.available ? e.auth : "n/a",
        e.mcp.supported ? "yes" : "no",
        e.model ?? "default",
        ctx,
        e.capabilities.streaming ? "yes" : "no",
        e.capabilities.toolCalls ? "yes" : "no",
        skills
      )
    );
  }

  // MCP summary
  const allMcp = entries.flatMap((e) => e.mcp.servers);
  if (allMcp.length > 0) {
    console.log(`\n  MCP Servers: ${[...new Set(allMcp)].join(", ")}`);
  }

  // Config files
  const allConfigs = entries.flatMap((e) => [...e.config.paths, ...e.config.instructionFiles]);
  if (allConfigs.length > 0) {
    console.log("\n  Config Files:");
    for (const c of [...new Set(allConfigs)]) {
      console.log(`    ${c}`);
    }
  }

  // Warnings
  const warnings = entries.filter((e) => !e.available || e.auth === "missing");
  if (warnings.length > 0) {
    console.log("\n  Warnings:");
    for (const w of warnings) {
      if (!w.available) console.log(`    ! ${w.tool}: not found in PATH`);
      if (w.auth === "missing") console.log(`    ! ${w.tool}: auth not configured`);
    }
  }

  console.log();
}

async function showModels(opts: Options) {
  const entries = await detectAll();
  if (opts.json) {
    console.log(JSON.stringify(entries.map((e) => ({ tool: e.tool, model: e.model, capabilities: e.capabilities })), null, 2));
    return;
  }
  console.log("\n  Models\n");
  for (const e of entries) {
    const status = e.available ? "✓" : "✗";
    const ctx = e.capabilities.contextTokens ? `${Math.round(e.capabilities.contextTokens / 1000)}k ctx` : "";
    console.log(`  ${status} ${e.tool.padEnd(16)} ${(e.model ?? "default").padEnd(24)} ${ctx}`);
  }
  console.log();
}

async function showSkills(opts: Options) {
  const entries = await detectAll();
  if (opts.json) {
    console.log(JSON.stringify(entries.map((e) => ({ tool: e.tool, skills: e.skills })), null, 2));
    return;
  }
  console.log("\n  Skills\n");
  for (const e of entries) {
    console.log(`  ${e.tool}:`);
    for (const s of e.skills) {
      console.log(`    ✓ ${s}`);
    }
  }
  console.log();
}

async function showMcp(opts: Options) {
  const entries = await detectAll();
  if (opts.json) {
    console.log(JSON.stringify(entries.map((e) => ({ tool: e.tool, mcp: e.mcp })), null, 2));
    return;
  }
  console.log("\n  MCP Servers\n");
  for (const e of entries) {
    if (!e.mcp.supported) {
      console.log(`  ${e.tool}: not supported`);
      continue;
    }
    console.log(`  ${e.tool}:`);
    if (e.mcp.servers.length === 0) {
      console.log("    (none configured)");
    } else {
      for (const s of e.mcp.servers) {
        console.log(`    ✓ ${s}`);
      }
    }
    for (const p of e.mcp.configPaths) {
      console.log(`    config: ${p}`);
    }
  }
  console.log();
}

async function showConfig(opts: Options) {
  const entries = await detectAll();
  if (opts.json) {
    console.log(JSON.stringify(entries.map((e) => ({ tool: e.tool, config: e.config })), null, 2));
    return;
  }
  console.log("\n  Config Files\n");
  for (const e of entries) {
    console.log(`  ${e.tool}:`);
    for (const p of e.config.paths) {
      console.log(`    config: ${p}`);
    }
    for (const p of e.config.instructionFiles) {
      console.log(`    instructions: ${p}`);
    }
    for (const p of e.mcp.configPaths) {
      console.log(`    mcp: ${p}`);
    }
    if (e.config.paths.length + e.config.instructionFiles.length + e.mcp.configPaths.length === 0) {
      console.log("    (no config files found)");
    }
  }
  console.log();
}

async function showToolDetail(tool: string, opts: Options) {
  const detectors: Record<string, () => Promise<ProviderEntry>> = {
    claude: detectClaude,
    copilot: detectCopilot,
    cursor: detectCursor,
  };
  const detect = detectors[tool];
  if (!detect) {
    console.error(`Unknown tool: ${tool}`);
    return;
  }
  const entry = await detect();
  if (opts.json) {
    console.log(JSON.stringify(entry, null, 2));
    return;
  }
  console.log(`\n  ${entry.tool}`);
  console.log(`    Provider:     ${entry.provider}`);
  console.log(`    Available:    ${entry.available ? "yes" : "no"}`);
  console.log(`    Version:      ${entry.version ?? "—"}`);
  console.log(`    Auth:         ${entry.auth}`);
  console.log(`    Model:        ${entry.model ?? "default"}`);
  console.log(`    Context:      ${entry.capabilities.contextTokens ? `${Math.round(entry.capabilities.contextTokens / 1000)}k` : "—"}`);
  console.log(`    Streaming:    ${entry.capabilities.streaming ? "yes" : "no"}`);
  console.log(`    Tool calls:   ${entry.capabilities.toolCalls ? "yes" : "no"}`);
  console.log(`    MCP:          ${entry.mcp.supported ? "yes" : "no"}`);
  if (entry.mcp.servers.length > 0) {
    console.log(`      Servers:    ${entry.mcp.servers.join(", ")}`);
  }
  if (entry.mcp.configPaths.length > 0) {
    console.log(`      Config:     ${entry.mcp.configPaths.join(", ")}`);
  }
  console.log(`    Skills:       ${entry.skills.join(", ")}`);
  if (entry.config.paths.length > 0) {
    console.log(`    Config files:`);
    for (const p of entry.config.paths) console.log(`      ${p}`);
  }
  if (entry.config.instructionFiles.length > 0) {
    console.log(`    Instructions:`);
    for (const p of entry.config.instructionFiles) console.log(`      ${p}`);
  }
  if (entry.recommendation) {
    console.log(`    Tip:          ${entry.recommendation}`);
  }
  console.log();
}

function padRow(...cols: string[]): string {
  const widths = [16, 6, 5, 24, 6, 8, 7, 20];
  return "  " + cols.map((c, i) => c.padEnd(widths[i] ?? 12)).join(" ");
}
