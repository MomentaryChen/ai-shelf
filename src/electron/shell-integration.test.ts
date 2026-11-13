import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { ensureShellIntegrationScripts } from "./shell-integration.js";

const ESC = "\x1b";
const BEL = "\x07";

function hasCommand(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { stdio: "pipe", timeout: 15000 });
  return !r.error && r.status === 0;
}

const hasBash = hasCommand("bash", ["-c", "true"]);
const hasPwsh = hasCommand("pwsh", ["-NoProfile", "-NonInteractive", "-Command", "exit 0"]);

/** OSC 133 mark payloads (`A`, `D;1`, …) in output order. */
function osc133Marks(output: string): string[] {
  const re = new RegExp(`${ESC}\\]133;([^${BEL}${ESC}]*)(?:${BEL}|${ESC}\\\\)`, "g");
  return [...output.matchAll(re)].map((m) => m[1]!);
}

describe("ensureShellIntegrationScripts", () => {
  it("writes a bash script that bash -n accepts", { skip: !hasBash }, () => {
    const dir = mkdtempSync(join(tmpdir(), "aishelf-osc7-"));
    const { bash } = ensureShellIntegrationScripts(dir);
    const body = readFileSync(bash, "utf8");
    assert.match(body, /\*";__aishelf_precmd;"\*\)/);
    assert.doesNotMatch(body, /\*;__aishelf_precmd;\*/);
    execFileSync("bash", ["-n", bash], { stdio: "pipe" });
  });

  it("bash emits OSC 133 A/B/C/D with exit codes", { skip: !hasBash }, () => {
    const dir = mkdtempSync(join(tmpdir(), "aishelf-osc133-"));
    const home = mkdtempSync(join(tmpdir(), "aishelf-home-"));
    const { bash } = ensureShellIntegrationScripts(dir);
    // Interactive bash reading stdin: prompts go to stderr, merged so marks stay in order.
    const r = spawnSync("bash", ["-c", 'exec bash --init-file "$0" -i 2>&1', bash], {
      input: "false\n\n(exit 3)\ntrue\nexit\n",
      env: { ...process.env, HOME: home, PROMPT_COMMAND: "", PS1: "$ " },
      encoding: "utf8",
      timeout: 15000,
    });
    const marks = osc133Marks(`${r.stdout}${r.stderr}`);
    // The first prompt has no D; an empty line closes nothing.
    assert.deepEqual(marks.slice(0, 13), [
      "A",
      "B",
      "C",
      "D;1",
      "A",
      "B",
      "A",
      "B",
      "C",
      "D;3",
      "A",
      "B",
      "C",
    ]);
    assert.ok(marks.includes("D;0"), marks.join(" "));
  });

  it("bash keeps a user PROMPT_COMMAND that ends with ';'", { skip: !hasBash }, () => {
    const dir = mkdtempSync(join(tmpdir(), "aishelf-osc133-"));
    const home = mkdtempSync(join(tmpdir(), "aishelf-home-"));
    const { bash } = ensureShellIntegrationScripts(dir);
    const r = spawnSync("bash", ["-c", 'exec bash --init-file "$0" -i 2>&1', bash], {
      input: "true\nexit\n",
      env: { ...process.env, HOME: home, PROMPT_COMMAND: "echo USERPC;", PS1: "$ " },
      encoding: "utf8",
      timeout: 15000,
    });
    const out = `${r.stdout}${r.stderr}`;
    assert.doesNotMatch(out, /syntax error/);
    assert.match(out, /USERPC/);
    assert.ok(osc133Marks(out).includes("D;0"));
  });

  it("writes a pwsh script that parses cleanly", { skip: !hasPwsh }, () => {
    const dir = mkdtempSync(join(tmpdir(), "aishelf-osc7-"));
    const { pwsh } = ensureShellIntegrationScripts(dir);
    const body = readFileSync(pwsh, "utf8");
    assert.match(body, /133;C/);
    assert.match(body, /PSConsoleHostReadLine/);
    const check = [
      "$errs = $null",
      "$tokens = $null",
      `[void][System.Management.Automation.Language.Parser]::ParseFile('${pwsh.replace(/'/g, "''")}', [ref]$tokens, [ref]$errs)`,
      "if ($errs.Count -gt 0) { $errs | ForEach-Object { $_.Message }; exit 1 }",
    ].join("; ");
    const r = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", check], {
      encoding: "utf8",
      timeout: 30000,
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it("pwsh prompt emits D/A/B and keeps the user's prompt", { skip: !hasPwsh }, () => {
    const dir = mkdtempSync(join(tmpdir(), "aishelf-osc7-"));
    const { pwsh } = ensureShellIntegrationScripts(dir);
    // Simulate prompts without a console host: first prompt (no D), then a failing command.
    const script = [
      "function Global:prompt { 'MYPROMPT> ' }",
      `. '${pwsh.replace(/'/g, "''")}'`,
      "$a = prompt",
      "[Console]::Write('|' + $a + '|')",
      "Add-History -InputObject ([pscustomobject]@{ CommandLine = 'x'; ExecutionStatus = 'Failed'; StartExecutionTime = (Get-Date); EndExecutionTime = (Get-Date) })",
      // A failed native command leaves $? false and $LASTEXITCODE set.
      "$global:LASTEXITCODE = 7",
      "Write-Error 'x' -ErrorAction SilentlyContinue",
      "$b = prompt",
      "[Console]::Write('|' + $b + '|')",
    ].join("\n");
    const r = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      timeout: 30000,
    });
    const out = r.stdout;
    assert.equal(r.status, 0, out + r.stderr);
    assert.match(out, /MYPROMPT> /);
    assert.deepEqual(osc133Marks(out), ["A", "B", "D;7", "A", "B"]);
  });
});
