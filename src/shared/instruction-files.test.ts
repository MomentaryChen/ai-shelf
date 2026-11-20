import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INSTRUCTION_KINDS,
  buildSyncedContent,
  contentFingerprint,
  cursorRuleFileName,
  cursorRuleNameForSource,
  joinPath,
  normalizeRulePath,
  planInstructionSync,
  resolveInstructionRef,
  resolveKindPath,
  splitFrontMatter,
  type InstructionRoots,
} from "./instruction-files.js";

const posixRoots: InstructionRoots = {
  claudeDir: "/home/u/.claude",
  geminiDir: "/home/u/.gemini",
  copilotDir: "/home/u/.copilot",
  opencodeDir: "/home/u/.config/opencode",
  projectDir: "/work/proj",
  sep: "/",
};

const winRoots: InstructionRoots = {
  claudeDir: "C:\\Users\\u\\.claude",
  geminiDir: "C:\\Users\\u\\.gemini",
  copilotDir: "C:\\Users\\u\\.copilot",
  opencodeDir: "C:\\Users\\u\\.config\\opencode",
  projectDir: "D:\\proj\\",
  sep: "\\",
};

describe("instruction catalogue", () => {
  it("has unique ids and covers the task's file kinds", () => {
    const ids = INSTRUCTION_KINDS.map((k) => k.id);
    assert.equal(new Set(ids).size, ids.length);
    const labels = INSTRUCTION_KINDS.map((k) => k.label);
    for (const l of [
      "~/.claude/CLAUDE.md",
      "CLAUDE.md",
      ".claude/CLAUDE.md",
      "AGENTS.md",
      ".cursor/rules/*.mdc",
      "GEMINI.md",
      "~/.gemini/GEMINI.md",
      ".github/copilot-instructions.md",
    ]) {
      assert.ok(labels.includes(l), l);
    }
  });

  it("lists every tool that reads AGENTS.md", () => {
    const agents = INSTRUCTION_KINDS.find((k) => k.id === "agents-project")!;
    for (const tool of ["codex", "cursor", "gemini", "copilot", "aider", "opencode"]) {
      assert.ok(agents.readers.includes(tool), tool);
    }
  });

  it("resolves global and project paths", () => {
    assert.equal(resolveKindPath("claude-global", posixRoots), "/home/u/.claude/CLAUDE.md");
    assert.equal(resolveKindPath("claude-dir-project", posixRoots), "/work/proj/.claude/CLAUDE.md");
    assert.equal(
      resolveKindPath("copilot-project", winRoots),
      "D:\\proj\\.github\\copilot-instructions.md",
    );
    assert.equal(resolveKindPath("cursor-rule", posixRoots), null);
  });

  it("returns null for project kinds without a project", () => {
    const roots = { ...posixRoots, projectDir: null };
    assert.equal(resolveKindPath("agents-project", roots), null);
    assert.equal(resolveKindPath("gemini-global", roots), "/home/u/.gemini/GEMINI.md");
  });

  it("joinPath collapses duplicate separators", () => {
    assert.equal(joinPath("/", "/a/", "/b", "c"), "/a/b/c");
    assert.equal(joinPath("\\", "D:\\x\\", "y/z"), "D:\\x\\y\\z");
  });
});

describe("ref validation", () => {
  it("accepts nested .mdc/.md rule paths", () => {
    assert.equal(normalizeRulePath("a.mdc"), "a.mdc");
    assert.equal(normalizeRulePath("sub\\b.md"), "sub/b.md");
  });

  it("rejects traversal, absolute paths and other extensions", () => {
    for (const bad of [
      "../x.mdc",
      "a/../../x.mdc",
      "/etc/x.mdc",
      "C:/x.mdc",
      "x.txt",
      "x.mdc.bak",
      ".mdc",
      "a//b.mdc",
      "./a.mdc",
      "a:b.mdc",
      "",
    ]) {
      assert.equal(normalizeRulePath(bad), null, bad);
    }
  });

  it("resolves refs only from the catalogue", () => {
    assert.equal(
      resolveInstructionRef({ kindId: "cursor-rule", rulePath: "x/y.mdc" }, posixRoots),
      "/work/proj/.cursor/rules/x/y.mdc",
    );
    assert.equal(resolveInstructionRef({ kindId: "cursor-rule", rulePath: "../a.mdc" }, posixRoots), null);
    assert.equal(resolveInstructionRef({ kindId: "nope" }, posixRoots), null);
    assert.equal(resolveInstructionRef("/etc/passwd", posixRoots), null);
    assert.equal(resolveInstructionRef(null, posixRoots), null);
    assert.equal(resolveInstructionRef({ kindId: "agents-project" }, posixRoots), "/work/proj/AGENTS.md");
  });
});

describe("cursor rule names", () => {
  it("derives safe .mdc names", () => {
    assert.equal(cursorRuleFileName("My Rules!"), "my-rules.mdc");
    assert.equal(cursorRuleFileName("x.mdc"), "x.mdc");
    assert.equal(cursorRuleFileName("../.."), "rules.mdc");
    assert.equal(cursorRuleNameForSource({ kindId: "claude-project" }), "claude.mdc");
    assert.equal(cursorRuleNameForSource({ kindId: "claude-global" }), "claude-global.mdc");
    assert.equal(cursorRuleNameForSource({ kindId: "copilot-project" }), "copilot-instructions.mdc");
    assert.equal(cursorRuleNameForSource({ kindId: "cursor-rule", rulePath: "a/b.mdc" }), "a/b.mdc");
  });
});

describe("front-matter", () => {
  it("splits byte-preservingly", () => {
    const text = "---\r\ndescription: x\r\nglobs: *.ts\r\n---\r\nBody\r\n";
    const s = splitFrontMatter(text);
    assert.equal(s.frontMatter, "---\r\ndescription: x\r\nglobs: *.ts\r\n---\r\n");
    assert.equal(s.frontMatter! + s.body, text);
  });

  it("keeps a BOM with the front-matter", () => {
    const s = splitFrontMatter("\uFEFF---\na: 1\n---\nB");
    assert.equal(s.frontMatter, "\uFEFF---\na: 1\n---\n");
    assert.equal(s.body, "B");
  });

  it("ignores text without a leading block", () => {
    assert.deepEqual(splitFrontMatter("# Title\n---\n"), { frontMatter: null, body: "# Title\n---\n" });
  });

  it("copies verbatim into non-rule targets, front-matter included", () => {
    const src = "---\nalwaysApply: false\n---\nhello\n";
    assert.equal(
      buildSyncedContent({
        sourceContent: src,
        sourceLabel: ".cursor/rules/a.mdc",
        target: { kindId: "claude-project" },
        targetContent: "old",
      }),
      src,
    );
  });

  it("keeps an existing rule's front-matter when the source has none", () => {
    const out = buildSyncedContent({
      sourceContent: "new body\n",
      sourceLabel: "CLAUDE.md",
      target: { kindId: "cursor-rule", rulePath: "a.mdc" },
      targetContent: "---\nglobs: src/**\n---\nold body\n",
    });
    assert.equal(out, "---\nglobs: src/**\n---\nnew body\n");
  });

  it("adds a default front-matter to a new rule", () => {
    const out = buildSyncedContent({
      sourceContent: "body\r\n",
      sourceLabel: "CLAUDE.md",
      target: { kindId: "cursor-rule", rulePath: "claude.mdc" },
      targetContent: null,
    });
    assert.equal(out, "---\r\ndescription: Synced from CLAUDE.md\r\nalwaysApply: true\r\n---\r\nbody\r\n");
  });

  it("source front-matter wins over the target's", () => {
    const src = "---\nalwaysApply: true\n---\nX\n";
    const out = buildSyncedContent({
      sourceContent: src,
      sourceLabel: "a.mdc",
      target: { kindId: "cursor-rule", rulePath: "b.mdc" },
      targetContent: "---\nglobs: x\n---\nY\n",
    });
    assert.equal(out, src);
  });
});

describe("planInstructionSync", () => {
  const base = {
    source: { kindId: "claude-project" as const },
    sourcePath: "/p/CLAUDE.md",
    sourceContent: "same\n",
    sourceLabel: "CLAUDE.md",
  };

  it("classifies create / overwrite / unchanged / blocked", () => {
    const plan = planInstructionSync({
      ...base,
      targets: [
        { ref: { kindId: "agents-project" }, path: "/p/AGENTS.md", content: null },
        { ref: { kindId: "gemini-project" }, path: "/p/GEMINI.md", content: "other\n" },
        { ref: { kindId: "codex-project" }, path: "/p/CODEX.md", content: "same\n" },
        { ref: { kindId: "claude-project" }, path: "/p/CLAUDE.md", content: "same\n" },
        { ref: { kindId: "codex-project" }, path: "/p/CODEX.md", content: "same\n" },
      ],
    });
    assert.deepEqual(
      plan.map((p) => [p.action, p.reason]),
      [
        ["create", undefined],
        ["overwrite", undefined],
        ["unchanged", undefined],
        ["blocked", "same-as-source"],
        ["blocked", "duplicate-target"],
      ],
    );
    assert.equal(plan[0]!.nextContent, "same\n");
    assert.equal(plan[1]!.currentContent, "other\n");
  });

  it("treats a CRLF-only difference as a change", () => {
    const plan = planInstructionSync({
      ...base,
      targets: [{ ref: { kindId: "agents-project" }, path: "/p/AGENTS.md", content: "same\r\n" }],
    });
    assert.equal(plan[0]!.action, "overwrite");
  });

  it("compares paths case-insensitively when asked", () => {
    const plan = planInstructionSync({
      ...base,
      caseInsensitive: true,
      targets: [{ ref: { kindId: "claude-project" }, path: "/P/claude.md", content: "x" }],
    });
    assert.equal(plan[0]!.action, "blocked");
  });
});

describe("contentFingerprint", () => {
  it("distinguishes missing, empty and different content", () => {
    assert.equal(contentFingerprint(null), "missing");
    assert.notEqual(contentFingerprint(""), contentFingerprint(null));
    assert.notEqual(contentFingerprint("a\n"), contentFingerprint("a\r\n"));
    assert.equal(contentFingerprint("abc"), contentFingerprint("abc"));
  });
});
