import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  adaptMcpForOpenCode,
  adaptMcpFromOpenCode,
  migrateOpenCodeLegacyMcp,
} from "./mcp-opencode.js";
import { readMcpServers, writeMcpServers } from "./mcp-sync.js";
import { listMcpServersDetailed, setMcpServerEnabled, upsertMcpServer } from "./mcp-edit.js";
import { getMcpConfigPath } from "./config.js";

describe("OpenCode MCP entry adaptation", () => {
  it("converts stdio entries to local command arrays", () => {
    assert.deepEqual(
      adaptMcpForOpenCode({ type: "stdio", command: "npx", args: ["-y", "pkg"], env: { K: "v" } }),
      { type: "local", command: ["npx", "-y", "pkg"], environment: { K: "v" }, enabled: true },
    );
  });

  it("converts url entries to remote", () => {
    assert.deepEqual(
      adaptMcpForOpenCode({ type: "http", url: "https://x", headers: { A: "b" } }, false),
      { type: "remote", url: "https://x", headers: { A: "b" }, enabled: false },
    );
  });

  it("round-trips back to the canonical shape", () => {
    const canonical = { command: "npx", args: ["-y", "pkg"], env: { K: "v" } };
    assert.deepEqual(adaptMcpFromOpenCode(adaptMcpForOpenCode(canonical)), canonical);
    assert.deepEqual(adaptMcpFromOpenCode({ type: "remote", url: "https://x" }), {
      url: "https://x",
    });
  });

  it("migrates legacy mcpServers into mcp without overwriting existing entries", () => {
    const data: Record<string, unknown> = {
      model: "m",
      mcp: { keep: { type: "local", command: ["keep"] } },
      mcpServers: { keep: { command: "other" }, legacy: { command: "node", args: ["s.js"] } },
    };
    assert.equal(migrateOpenCodeLegacyMcp(data), true);
    assert.equal(data["mcpServers"], undefined);
    assert.deepEqual(data["mcp"], {
      keep: { type: "local", command: ["keep"] },
      legacy: { type: "local", command: ["node", "s.js"], enabled: true },
    });
    assert.equal(migrateOpenCodeLegacyMcp(data), false);
  });
});

describe("OpenCode MCP sync on disk", () => {
  let xdg: string;
  let savedXdg: string | undefined;

  beforeEach(() => {
    xdg = mkdtempSync(join(tmpdir(), "aishelf-opencode-"));
    mkdirSync(join(xdg, "opencode"), { recursive: true });
    savedXdg = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = xdg;
  });

  afterEach(() => {
    if (savedXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
    else process.env["XDG_CONFIG_HOME"] = savedXdg;
  });

  function readConfig(): Record<string, unknown> {
    return JSON.parse(readFileSync(getMcpConfigPath("opencode"), "utf-8")) as Record<
      string,
      unknown
    >;
  }

  it("resolves the config under XDG_CONFIG_HOME, preferring an existing .jsonc", () => {
    assert.equal(getMcpConfigPath("opencode"), join(xdg, "opencode", "opencode.json"));
    writeFileSync(join(xdg, "opencode", "opencode.jsonc"), "{ // c\n}", "utf-8");
    assert.equal(getMcpConfigPath("opencode"), join(xdg, "opencode", "opencode.jsonc"));
  });

  it("writes synced servers under the mcp key and migrates legacy entries", () => {
    const configPath = join(xdg, "opencode", "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({ model: "m", mcpServers: { old: { command: "old-cmd" } } }),
      "utf-8",
    );

    const result = writeMcpServers("opencode", ["fresh", "old"], {
      fresh: { command: "npx", args: ["fresh"] },
      old: { command: "ignored" },
    });

    assert.deepEqual(result, { added: ["fresh"], skipped: ["old"] });
    const data = readConfig();
    assert.equal(data["model"], "m");
    assert.equal(data["mcpServers"], undefined);
    assert.deepEqual(data["mcp"], {
      old: { type: "local", command: ["old-cmd"], enabled: true },
      fresh: { type: "local", command: ["npx", "fresh"], enabled: true },
    });

    assert.deepEqual(readMcpServers("opencode"), {
      old: { command: "old-cmd" },
      fresh: { command: "npx", args: ["fresh"] },
    });
  });

  it("migrates a legacy-only file even when nothing new is added", () => {
    writeFileSync(
      join(xdg, "opencode", "opencode.json"),
      JSON.stringify({ mcpServers: { old: { url: "https://x" } } }),
      "utf-8",
    );
    const result = writeMcpServers("opencode", ["old"], { old: { url: "https://x" } });
    assert.deepEqual(result, { added: [], skipped: ["old"] });
    assert.deepEqual(readConfig()["mcp"], {
      old: { type: "remote", url: "https://x", enabled: true },
    });
  });

  it("toggles servers with OpenCode's native enabled flag", () => {
    assert.deepEqual(upsertMcpServer("opencode", "srv", { command: "run" }), { success: true });
    assert.deepEqual(setMcpServerEnabled("opencode", "srv", false), { success: true });

    const data = readConfig();
    assert.equal(data["mcpServersDisabled"], undefined);
    assert.deepEqual(data["mcp"], { srv: { type: "local", command: ["run"], enabled: false } });

    const listed = listMcpServersDetailed("opencode");
    assert.equal(listed.supported, true);
    assert.deepEqual(listed.servers, [{ name: "srv", entry: { command: "run" }, enabled: false }]);
  });
});
