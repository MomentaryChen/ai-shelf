import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { emptyDraft, parseClaudeSettingsText } from "../shared/claude-settings.js";
import {
  claudeSettingsPath,
  listClaudeSettingsFiles,
  listKnownClaudeProjects,
  readClaudeSettings,
  writeClaudeSettings,
} from "./claude-settings-files.js";

const root = mkdtempSync(join(tmpdir(), "aishelf-claude-settings-"));
const userDir = join(root, "user-claude");
const project = join(root, "proj");
mkdirSync(userDir, { recursive: true });
mkdirSync(project, { recursive: true });
const opts = { userConfigDir: userDir };

after(() => rmSync(root, { recursive: true, force: true }));

describe("claudeSettingsPath", () => {
  it("maps scopes to the three known files", () => {
    assert.equal(claudeSettingsPath("user", undefined, opts), join(userDir, "settings.json"));
    assert.equal(
      claudeSettingsPath("project", project, opts),
      join(project, ".claude", "settings.json"),
    );
    assert.equal(
      claudeSettingsPath("local", project, opts),
      join(project, ".claude", "settings.local.json"),
    );
  });

  it("rejects unknown scopes and bad project dirs", () => {
    assert.throws(() => claudeSettingsPath("other", project, opts));
    assert.throws(() => claudeSettingsPath("project", undefined, opts));
    assert.throws(() => claudeSettingsPath("project", "relative/dir", opts));
    assert.throws(() => claudeSettingsPath("project", join(root, "missing"), opts));
    const file = join(root, "a-file");
    writeFileSync(file, "x");
    assert.throws(() => claudeSettingsPath("local", file, opts));
  });
});

describe("listClaudeSettingsFiles", () => {
  it("lists only user scope without a project", () => {
    assert.deepEqual(
      listClaudeSettingsFiles(undefined, opts).map((f) => f.scope),
      ["user"],
    );
    assert.deepEqual(
      listClaudeSettingsFiles(project, opts).map((f) => [f.scope, f.exists]),
      [
        ["user", false],
        ["project", false],
        ["local", false],
      ],
    );
  });
});

describe("listKnownClaudeProjects", () => {
  it("returns existing project roots from .claude.json", () => {
    const json = join(root, ".claude.json");
    writeFileSync(json, JSON.stringify({ projects: { [project]: {}, [join(root, "gone")]: {} } }));
    assert.deepEqual(listKnownClaudeProjects(json), [project]);
  });
});

describe("read/writeClaudeSettings", () => {
  it("creates a missing file", () => {
    const draft = emptyDraft();
    draft.permissions.allow.push("Bash(ls)");
    const res = writeClaudeSettings("local", project, "", draft, opts);
    assert.equal(res.ok, true, res.error);
    const path = join(project, ".claude", "settings.local.json");
    assert.equal(
      readFileSync(path, "utf-8"),
      '{\n  "permissions": {\n    "allow": [\n      "Bash(ls)"\n    ]\n  }\n}\n',
    );
    assert.equal(res.backupPath, null);
  });

  it("only rewrites permissions/hooks, backs up, and detects conflicts", () => {
    const path = join(userDir, "settings.json");
    const original = `${JSON.stringify({ model: "opus", permissions: { deny: ["Read(./.env)"] }, env: { A: "1" } }, null, 2)}\n`;
    writeFileSync(path, original);

    const read = readClaudeSettings("user", undefined, opts);
    assert.equal(read.ok && read.exists, true);
    const parsed = parseClaudeSettingsText(read.content);
    assert.ok(parsed.ok);
    const draft = parsed.draft;
    draft.permissions.ask.push("Bash(git push:*)");

    const stale = writeClaudeSettings("user", undefined, `${original} `, draft, opts);
    assert.equal(stale.ok, false);
    assert.equal(stale.conflict, true);
    assert.equal(readFileSync(path, "utf-8"), original);

    const res = writeClaudeSettings("user", undefined, read.content, draft, opts);
    assert.equal(res.ok, true, res.error);
    assert.equal(readFileSync(`${path}.bak`, "utf-8"), original);
    const written = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(written), ["model", "permissions", "env"]);
    assert.deepEqual(written["permissions"], { ask: ["Bash(git push:*)"], deny: ["Read(./.env)"] });
  });

  it("refuses to write when the file is not valid JSON", () => {
    const path = join(project, ".claude", "settings.json");
    writeFileSync(path, "{ // comment\n}");
    const res = writeClaudeSettings("project", project, "{ // comment\n}", emptyDraft(), opts);
    assert.equal(res.ok, false);
    assert.equal(readFileSync(path, "utf-8"), "{ // comment\n}");
    assert.equal(existsSync(`${path}.bak`), false);
  });

  it("rejects malformed draft payloads", () => {
    const res = writeClaudeSettings("user", undefined, "", { hooks: "x" }, opts);
    assert.equal(res.ok, false);
  });
});
