import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  duplicateTaskName,
  filterTasks,
  precheckTaskRun,
  promptPreview,
  resolveTaskProfile,
} from "./task-utils.js";
import { TASK_TEMPLATES, localizeTemplate } from "./task-templates.js";

const backend = { id: "p1", name: "Backend", defaultTool: "claude" };
const shellOnly = { id: "p2", name: "Shell only", defaultTool: "shell" };

const groups = [
  {
    id: "g1",
    name: "Work",
    profiles: [
      backend,
      shellOnly,
    ],
  },
  {
    id: "g2",
    name: "Personal",
    // A profile whose name equals another profile's id: id must win.
    profiles: [{ id: "p3", name: "p1", defaultTool: "codex" }],
  },
];

describe("resolveTaskProfile", () => {
  it("treats empty / whitespace as the active profile", () => {
    assert.deepEqual(resolveTaskProfile(undefined, groups), { kind: "active" });
    assert.deepEqual(resolveTaskProfile("  ", groups), { kind: "active" });
  });

  it("resolves by id first, then by name", () => {
    const byId = resolveTaskProfile("p1", groups);
    assert.equal(byId.kind, "found");
    assert.equal(byId.kind === "found" && byId.profile.name, "Backend");
    const byName = resolveTaskProfile(" Backend ", groups);
    assert.equal(byName.kind === "found" && byName.profile.id, "p1");
    assert.equal(byName.kind === "found" && byName.groupName, "Work");
  });

  it("reports missing profiles (name match is case-sensitive like the runner)", () => {
    assert.deepEqual(resolveTaskProfile("backend", groups), { kind: "missing", ref: "backend" });
  });
});

describe("precheckTaskRun", () => {
  const active = backend;
  it("flags an unknown profile", () => {
    assert.equal(precheckTaskRun({ profileId: "nope" }, groups, active), "profile-not-found");
  });
  it("flags a shell-only profile without a tool override", () => {
    assert.equal(precheckTaskRun({ profileId: "p2" }, groups, active), "no-agent-tool");
    assert.equal(precheckTaskRun({ profileId: "p2", tool: "claude" }, groups, active), null);
  });
  it("uses the active profile when none is set, and defers when unknown", () => {
    assert.equal(precheckTaskRun({}, groups, active), null);
    assert.equal(precheckTaskRun({}, groups, shellOnly), "no-agent-tool");
    assert.equal(precheckTaskRun({}, groups, null), null);
  });
});

describe("filterTasks", () => {
  const tasks = [
    { name: "Review", description: "PR review", prompt: "look at diff", tool: "claude", profileId: "p1" },
    { name: "Standup", prompt: "git log summary" },
  ];
  it("returns everything for an empty query", () => {
    assert.equal(filterTasks(tasks, "  ").length, 2);
  });
  it("matches all words case-insensitively across fields", () => {
    assert.deepEqual(filterTasks(tasks, "GIT summary").map((t) => t.name), ["Standup"]);
    assert.deepEqual(filterTasks(tasks, "review claude").map((t) => t.name), ["Review"]);
    assert.equal(filterTasks(tasks, "review standup").length, 0);
  });
  it("matches the resolved profile label", () => {
    const label = (t: (typeof tasks)[number]) => ("profileId" in t ? "Backend" : undefined);
    assert.deepEqual(filterTasks(tasks, "backend", label).map((t) => t.name), ["Review"]);
  });
});

describe("duplicateTaskName", () => {
  it("adds a copy suffix and counts up past taken names", () => {
    assert.equal(duplicateTaskName("Review", ["Review"]), "Review (copy)");
    assert.equal(duplicateTaskName("Review", ["Review", "review (COPY)"]), "Review (copy 2)");
  });
  it("does not stack suffixes when copying a copy", () => {
    assert.equal(duplicateTaskName("Review (copy)", ["Review", "Review (copy)"]), "Review (copy 2)");
    assert.equal(
      duplicateTaskName("Review (copy 2)", ["Review", "Review (copy)", "Review (copy 2)"]),
      "Review (copy 3)",
    );
  });
  it("supports a localized copy word", () => {
    assert.equal(duplicateTaskName("審查", ["審查"], "副本"), "審查 (副本)");
  });
});

describe("promptPreview", () => {
  it("keeps the first lines and flags truncation", () => {
    assert.deepEqual(promptPreview("a\r\nb\nc\nd", 3), { text: "a\nb\nc", truncated: true });
    assert.deepEqual(promptPreview("  one line \n", 3), { text: "one line", truncated: false });
  });
});

describe("TASK_TEMPLATES", () => {
  it("has unique ids and non-empty copy in both locales", () => {
    assert.equal(new Set(TASK_TEMPLATES.map((t) => t.id)).size, TASK_TEMPLATES.length);
    for (const tpl of TASK_TEMPLATES) {
      for (const locale of ["en", "zh"] as const) {
        const l = localizeTemplate(tpl, locale);
        assert.ok(l.name.trim(), `${tpl.id} ${locale} name`);
        assert.ok(l.description.trim(), `${tpl.id} ${locale} description`);
        assert.ok(l.prompt.trim(), `${tpl.id} ${locale} prompt`);
      }
    }
  });
});
