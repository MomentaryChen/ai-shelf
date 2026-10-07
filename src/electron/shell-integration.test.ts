import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { ensureShellIntegrationScripts } from "./shell-integration.js";

describe("ensureShellIntegrationScripts", () => {
  it("writes a bash script that bash -n accepts", () => {
    const dir = mkdtempSync(join(tmpdir(), "aishelf-osc7-"));
    const { bash } = ensureShellIntegrationScripts(dir);
    const body = readFileSync(bash, "utf8");
    assert.match(body, /\*";__aishelf_emit_osc7;"\*\)/);
    assert.doesNotMatch(body, /\*;__aishelf_emit_osc7;\*/);
    execFileSync("bash", ["-n", bash], { stdio: "pipe" });
  });
});
