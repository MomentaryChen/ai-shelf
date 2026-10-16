import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { collectMcpServersFromJsonFiles, parseCodexMcpServers } from "./mcp-helpers.js";

function tempFile(name: string, body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "aishelf-mcp-helpers-")), name);
  writeFileSync(path, body, "utf-8");
  return path;
}

describe("collectMcpServersFromJsonFiles", () => {
  it("reads only the requested key (Gemini's `mcp` settings block is not servers)", () => {
    const path = tempFile(
      "settings.json",
      JSON.stringify({ mcpServers: { a: {} }, mcp: { allowed: ["a"], excluded: [] } }),
    );
    assert.deepEqual(collectMcpServersFromJsonFiles([path], "mcpServers").servers, ["a"]);
  });

  it("folds legacy keys when asked (OpenCode `mcp` + legacy `mcpServers`)", () => {
    const path = tempFile(
      "opencode.jsonc",
      '{ // comment\n "mcp": { "new": {} }, "mcpServers": { "old": {} } }',
    );
    const result = collectMcpServersFromJsonFiles([path], "mcp", ["mcpServers"]);
    assert.deepEqual(result.servers, ["new", "old"]);
    assert.deepEqual(result.configPaths, [path]);
  });
});

describe("parseCodexMcpServers", () => {
  it("does not report `.env` sub-tables as servers", () => {
    const path = tempFile(
      "config.toml",
      [
        '[mcp_servers."Magic MCP"]',
        'command = "npx"',
        "",
        '[mcp_servers."Magic MCP".env]',
        'KEY = "v"',
        "",
        "[mcp_servers.github]",
        'command = "gh"',
      ].join("\n"),
    );
    assert.deepEqual(parseCodexMcpServers(path), ["Magic MCP", "github"]);
  });
});
