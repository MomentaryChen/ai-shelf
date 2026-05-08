#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runInventory } from "./commands/inventory.js";
import { runDoctor } from "./commands/doctor.js";
import { runRaw } from "./commands/raw.js";
import { runUpdate } from "./commands/update.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
});

const [command, ...rest] = positionals;

if (values.version) {
  console.log("ai-cli-inventory v0.1.0");
  process.exit(0);
}

if (values.help || !command) {
  printHelp();
  process.exit(0);
}

switch (command) {
  case "inventory":
  case "inv":
    await runInventory(rest, { json: values.json ?? false });
    break;
  case "doctor":
    await runDoctor({ json: values.json ?? false });
    break;
  case "raw":
    await runRaw(rest);
    break;
  case "update":
    await runUpdate(rest);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`
AI CLI Inventory v0.1.0

Usage:
  ai inventory [models|skills|mcp|config]   Show AI tool overview
  ai doctor                                  Check environment health
  ai raw <tool> [args...]                    Pass-through to underlying CLI
  ai update [tool|self]                      Update AI tools (claude, copilot, cursor, self)

Options:
  --json       Output as JSON
  -h, --help   Show help
  -v, --version  Show version
`);
}
