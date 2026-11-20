import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { after, describe, it } from "node:test";
import type { InstructionRoots } from "../shared/instruction-files.js";
import {
  applyInstructionSync,
  checkProjectDir,
  listCursorRules,
  previewInstructionSync,
  readInstructionFile,
  scanInstructionFiles,
  writeInstructionFile,
} from "./instruction-files-service.js";

const tmp = mkdtempSync(join(tmpdir(), "aishelf-instr-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function makeRoots(name: string): InstructionRoots {
  const root = join(tmp, name);
  const home = join(root, "home");
  const project = join(root, "proj");
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(project, { recursive: true });
  return {
    claudeDir: join(home, ".claude"),
    geminiDir: join(home, ".gemini"),
    copilotDir: join(home, ".copilot"),
    opencodeDir: join(home, ".config", "opencode"),
    projectDir: project,
    sep,
  };
}

describe("instruction files service", () => {
  it("checks the project folder", () => {
    assert.equal(checkProjectDir(null).projectDir, null);
    assert.ok(checkProjectDir("relative/path").error);
    assert.ok(checkProjectDir(join(tmp, "missing")).error);
    assert.equal(checkProjectDir(tmp).projectDir, tmp);
  });

  it("scans existing and missing files, including cursor rules", () => {
    const roots = makeRoots("scan");
    writeFileSync(join(roots.claudeDir, "CLAUDE.md"), "global\n");
    writeFileSync(join(roots.projectDir!, "AGENTS.md"), "agents\n");
    mkdirSync(join(roots.projectDir!, ".cursor", "rules", "sub"), { recursive: true });
    writeFileSync(join(roots.projectDir!, ".cursor", "rules", "a.mdc"), "---\nx: 1\n---\nA\n");
    writeFileSync(join(roots.projectDir!, ".cursor", "rules", "sub", "b.md"), "B\n");
    writeFileSync(join(roots.projectDir!, ".cursor", "rules", "a.mdc.bak"), "old\n");

    assert.deepEqual(listCursorRules(join(roots.projectDir!, ".cursor", "rules")), ["a.mdc", "sub/b.md"]);

    const scan = scanInstructionFiles(roots);
    const claude = scan.files.find((f) => f.kindId === "claude-global")!;
    assert.equal(claude.exists, true);
    assert.equal(claude.size, 7);
    assert.ok(claude.mtimeMs);
    assert.equal(scan.files.find((f) => f.kindId === "gemini-project")!.exists, false);
    assert.deepEqual(
      scan.files.filter((f) => f.kindId === "cursor-rule").map((f) => f.ref.rulePath),
      ["a.mdc", "sub/b.md"],
    );
  });

  it("omits project kinds without a project", () => {
    const roots = { ...makeRoots("noproj"), projectDir: null };
    const scan = scanInstructionFiles(roots);
    assert.ok(scan.files.every((f) => f.scope === "global"));
  });

  it("refuses refs outside the catalogue", () => {
    const roots = makeRoots("refuse");
    assert.equal(readInstructionFile("/etc/passwd", roots).success, false);
    assert.equal(
      writeInstructionFile({ kindId: "cursor-rule", rulePath: "../../evil.mdc" }, "x", roots).success,
      false,
    );
    assert.equal(writeInstructionFile({ kindId: "nope" }, "x", roots).success, false);
  });

  it("creates, then backs up on overwrite", () => {
    const roots = makeRoots("write");
    const ref = { kindId: "copilot-project" as const };
    const first = writeInstructionFile(ref, "one\n", roots);
    assert.equal(first.success, true);
    assert.equal(first.backupPath, null);
    const path = join(roots.projectDir!, ".github", "copilot-instructions.md");
    assert.equal(readFileSync(path, "utf-8"), "one\n");
    const second = writeInstructionFile(ref, "two\n", roots);
    assert.equal(second.backupPath, `${path}.bak`);
    assert.equal(readFileSync(`${path}.bak`, "utf-8"), "one\n");
    assert.equal(readInstructionFile(ref, roots).content, "two\n");
  });

  it("previews then applies a sync, refusing stale targets", () => {
    const roots = makeRoots("sync");
    const p = roots.projectDir!;
    writeFileSync(join(p, "CLAUDE.md"), "rules\n");
    writeFileSync(join(p, "GEMINI.md"), "old\n");
    const source = { kindId: "claude-project" as const };
    const targets = [
      { kindId: "agents-project" as const },
      { kindId: "gemini-project" as const },
      { kindId: "cursor-rule" as const, rulePath: "claude.mdc" },
    ];
    const preview = previewInstructionSync({ source, targets }, roots);
    assert.equal(preview.ok, true);
    assert.deepEqual(
      preview.items.map((i) => i.action),
      ["create", "overwrite", "create"],
    );
    // Preview never writes.
    assert.equal(existsSync(join(p, "AGENTS.md")), false);

    // GEMINI.md changes after the preview → stale, left alone.
    writeFileSync(join(p, "GEMINI.md"), "edited meanwhile\n");
    const res = applyInstructionSync(
      {
        source,
        sourceFingerprint: preview.sourceFingerprint,
        targets: preview.items.map((i) => ({ ref: i.ref, fingerprint: i.fingerprint })),
      },
      roots,
    );
    assert.equal(res.ok, true);
    assert.deepEqual(
      res.results.map((r) => r.status),
      ["written", "stale", "written"],
    );
    assert.equal(readFileSync(join(p, "AGENTS.md"), "utf-8"), "rules\n");
    assert.equal(readFileSync(join(p, "GEMINI.md"), "utf-8"), "edited meanwhile\n");
    assert.match(readFileSync(join(p, ".cursor", "rules", "claude.mdc"), "utf-8"), /^---\n.*alwaysApply: true/s);
  });

  it("rejects apply when the source changed since preview", () => {
    const roots = makeRoots("srcstale");
    const p = roots.projectDir!;
    writeFileSync(join(p, "CLAUDE.md"), "v1\n");
    const source = { kindId: "claude-project" as const };
    const preview = previewInstructionSync({ source, targets: [{ kindId: "agents-project" }] }, roots);
    writeFileSync(join(p, "CLAUDE.md"), "v2\n");
    const res = applyInstructionSync(
      {
        source,
        sourceFingerprint: preview.sourceFingerprint,
        targets: preview.items.map((i) => ({ ref: i.ref, fingerprint: i.fingerprint })),
      },
      roots,
    );
    assert.equal(res.ok, false);
    assert.equal(existsSync(join(p, "AGENTS.md")), false);
  });

  it("fails preview for a missing source", () => {
    const roots = makeRoots("nosrc");
    const preview = previewInstructionSync(
      { source: { kindId: "claude-project" }, targets: [{ kindId: "agents-project" }] },
      roots,
    );
    assert.equal(preview.ok, false);
  });
});
