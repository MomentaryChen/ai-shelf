import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copilotPathCandidates } from "./copilot.js";
import { cursorUserSettingsPath } from "./cursor.js";

function allCopilot(c: ReturnType<typeof copilotPathCandidates>): string[] {
  return [c.settings, ...c.config, ...c.instructions, ...c.mcp];
}

describe("copilotPathCandidates", () => {
  it("keeps Windows candidates and order", () => {
    const c = copilotPathCandidates({
      platform: "win32",
      env: {},
      homeDir: "C:\\Users\\me",
      cwd: "D:\\proj",
    });
    assert.equal(c.settings, "C:\\Users\\me\\.copilot\\settings.json");
    assert.deepEqual(c.config, [
      "C:\\Users\\me\\.copilot\\config.json",
      "C:\\Users\\me\\.copilot\\settings.json",
    ]);
    assert.deepEqual(c.instructions, [
      "C:\\Users\\me\\.copilot\\copilot-instructions.md",
      "D:\\proj\\.github\\copilot-instructions.md",
      "D:\\proj\\AGENTS.md",
      "D:\\proj\\CLAUDE.md",
      "D:\\proj\\GEMINI.md",
    ]);
    assert.deepEqual(c.mcp, ["C:\\Users\\me\\.copilot\\mcp-config.json", "D:\\proj\\.mcp.json"]);
  });

  for (const platform of ["darwin", "linux"] as const) {
    it(`uses forward slashes only on ${platform}`, () => {
      const c = copilotPathCandidates({
        platform,
        env: {},
        homeDir: "/Users/me",
        cwd: "/work/proj",
      });
      for (const p of allCopilot(c)) assert.ok(!p.includes("\\"), p);
      assert.equal(c.settings, "/Users/me/.copilot/settings.json");
      assert.deepEqual(c.config, [
        "/Users/me/.copilot/config.json",
        "/Users/me/.copilot/settings.json",
      ]);
      assert.equal(c.instructions[0], "/Users/me/.copilot/copilot-instructions.md");
      assert.deepEqual(c.mcp, ["/Users/me/.copilot/mcp-config.json", "/work/proj/.mcp.json"]);
    });
  }

  it("respects COPILOT_HOME override", () => {
    const c = copilotPathCandidates({
      platform: "linux",
      env: { COPILOT_HOME: "/opt/copilot" },
      homeDir: "/home/me",
      cwd: "/work",
    });
    assert.equal(c.settings, "/opt/copilot/settings.json");
    assert.deepEqual(c.config, ["/opt/copilot/config.json", "/opt/copilot/settings.json"]);
    assert.equal(c.instructions[0], "/opt/copilot/copilot-instructions.md");
    assert.equal(c.mcp[0], "/opt/copilot/mcp-config.json");
    for (const p of allCopilot(c)) assert.ok(!p.startsWith("/home/me"), p);

    const w = copilotPathCandidates({
      platform: "win32",
      env: { COPILOT_HOME: "E:\\cp" },
      homeDir: "C:\\Users\\me",
      cwd: "D:\\proj",
    });
    assert.equal(w.settings, "E:\\cp\\settings.json");
  });
});

describe("cursorUserSettingsPath", () => {
  it("uses APPDATA on Windows", () => {
    assert.equal(
      cursorUserSettingsPath({
        platform: "win32",
        env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
        homeDir: "C:\\Users\\me",
      }),
      "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\settings.json",
    );
    assert.equal(
      cursorUserSettingsPath({ platform: "win32", env: {}, homeDir: "C:\\Users\\me" }),
      "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\settings.json",
    );
  });

  it("uses Application Support on macOS", () => {
    assert.equal(
      cursorUserSettingsPath({ platform: "darwin", env: {}, homeDir: "/Users/me" }),
      "/Users/me/Library/Application Support/Cursor/User/settings.json",
    );
  });

  it("uses XDG config dir on Linux", () => {
    assert.equal(
      cursorUserSettingsPath({ platform: "linux", env: {}, homeDir: "/home/me" }),
      "/home/me/.config/Cursor/User/settings.json",
    );
    assert.equal(
      cursorUserSettingsPath({
        platform: "linux",
        env: { XDG_CONFIG_HOME: "/xdg" },
        homeDir: "/home/me",
      }),
      "/xdg/Cursor/User/settings.json",
    );
  });
});
