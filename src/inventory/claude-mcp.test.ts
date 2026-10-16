import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { scanClaudeMcp } from "./claude-mcp.js";

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

describe("scanClaudeMcp", () => {
  let root: string;
  let savedConfigDir: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aishelf-claude-mcp-"));
    savedConfigDir = process.env["CLAUDE_CONFIG_DIR"];
  });

  afterEach(() => {
    if (savedConfigDir === undefined) delete process.env["CLAUDE_CONFIG_DIR"];
    else process.env["CLAUDE_CONFIG_DIR"] = savedConfigDir;
  });

  it("collects user, local and project scoped servers", () => {
    const projA = join(root, "proj-a");
    const projB = join(root, "proj-b");
    mkdirSync(projA);
    mkdirSync(projB);
    writeJsonFile(join(projA, ".mcp.json"), { mcpServers: { shared: { command: "x" } } });

    const claudeJson = join(root, ".claude.json");
    writeJsonFile(claudeJson, {
      mcpServers: { github: { command: "gh-mcp" } },
      projects: {
        [projA]: { mcpServers: { "local-a": { command: "a" } } },
        [projB]: { mcpServers: {} },
      },
    });

    const info = scanClaudeMcp({ claudeJson, projectRoots: [] });

    assert.deepEqual(info.servers.sort(), ["github", "local-a", "shared"]);
    assert.deepEqual(info.configPaths, [claudeJson, join(projA, ".mcp.json")]);
    const byName = Object.fromEntries((info.serverDetails ?? []).map((d) => [d.name, d]));
    assert.equal(byName["github"]?.scope, "user");
    assert.equal(byName["local-a"]?.scope, "local");
    assert.equal(byName["local-a"]?.project, projA);
    assert.equal(byName["shared"]?.scope, "project");
    assert.equal(byName["shared"]?.source, join(projA, ".mcp.json"));
  });

  it("scans .mcp.json in extra project roots without a claude.json", () => {
    const proj = join(root, "cwd-proj");
    mkdirSync(proj);
    writeJsonFile(join(proj, ".mcp.json"), { mcpServers: { playwright: {} } });

    const info = scanClaudeMcp({
      claudeJson: join(root, "missing.json"),
      projectRoots: [proj, proj],
    });

    assert.deepEqual(info.servers, ["playwright"]);
    assert.deepEqual(info.configPaths, [join(proj, ".mcp.json")]);
    assert.equal(info.serverDetails?.length, 1);
  });

  it("reads .claude.json from CLAUDE_CONFIG_DIR by default", () => {
    const configDir = join(root, "claude-config");
    mkdirSync(configDir);
    writeJsonFile(join(configDir, ".claude.json"), { mcpServers: { fromEnv: {} } });
    process.env["CLAUDE_CONFIG_DIR"] = configDir;

    const info = scanClaudeMcp({ projectRoots: [] });

    assert.deepEqual(info.servers, ["fromEnv"]);
    assert.deepEqual(info.configPaths, [join(configDir, ".claude.json")]);
  });
});
