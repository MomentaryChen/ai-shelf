import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateFlowContent } from "./flow-validate.js";

function doc(frontmatter: string, body = "# Body\n"): string {
  return `---\nschema: ai-shelf.flow/definition/v1\nid: demo\n${frontmatter}\n---\n\n${body}`;
}

function codes(content: string): string[] {
  const res = validateFlowContent(content);
  return res.ok ? [] : res.issues.map((i) => i.code);
}

describe("flow-validate", () => {
  it("accepts a plain sequential flow and a valid DAG", () => {
    assert.deepEqual(codes(doc("phases:\n  - id: a\n  - id: b\n    on_fail: skip")), []);
    assert.deepEqual(
      codes(
        doc(
          "phases:\n  - id: fetch-a\n  - id: fetch-b\n    depends_on: []\n  - id: report\n    depends_on: [fetch-a, fetch-b]",
        ),
      ),
      [],
    );
  });

  it("rejects branch targets that do not exist", () => {
    const res = validateFlowContent(
      doc("phases:\n  - id: a\n    on_fail: nope\n  - id: b\n    next: ghost"),
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.deepEqual(
      res.issues.map((i) => i.code),
      ["unknown-branch-target", "unknown-branch-target"],
    );
    assert.match(res.error, /on_fail target "nope"/);
  });

  it("detects branch loops (on_fail jumping back)", () => {
    assert.deepEqual(codes(doc("phases:\n  - id: a\n  - id: b\n  - id: c\n    on_fail: a")), [
      "branch-loop",
    ]);
    // next pointing backwards is a loop even without failures.
    assert.deepEqual(codes(doc("phases:\n  - id: a\n  - id: b\n    next: a")), ["branch-loop"]);
    // A phase retrying itself via on_fail loops forever; unreachable phases are checked too.
    assert.deepEqual(codes(doc('phases:\n  - id: a\n    next: ""\n  - id: b\n    on_fail: b')), [
      "branch-loop",
    ]);
  });

  it("detects dependency cycles, unknown and self dependencies", () => {
    assert.deepEqual(
      codes(doc("phases:\n  - id: a\n    depends_on: [b]\n  - id: b\n    depends_on: [a]")),
      ["dependency-cycle"],
    );
    assert.deepEqual(codes(doc("phases:\n  - id: a\n    depends_on: [ghost]")), [
      "unknown-dependency",
    ]);
    assert.deepEqual(codes(doc("phases:\n  - id: a\n    depends_on: [a]")), ["self-dependency"]);
  });

  it("rejects jump branches in DAG mode and duplicate ids", () => {
    assert.deepEqual(
      codes(doc("phases:\n  - id: a\n    depends_on: []\n  - id: b\n    on_fail: a")),
      ["dag-branch-unsupported"],
    );
    assert.deepEqual(codes(doc("phases:\n  - id: a\n  - id: a")), [
      "duplicate-phase",
      "branch-loop",
    ]);
  });

  it("checks literal webhook URLs but not ${ENV} templates", () => {
    assert.deepEqual(codes(doc("webhooks:\n  - url: not-a-url")), ["invalid-webhook-url"]);
    assert.deepEqual(codes(doc("webhooks:\n  - url: ${HOOK_URL}")), []);
  });

  it("returns parse errors without issues", () => {
    const res = validateFlowContent("no frontmatter");
    assert.equal(res.ok, false);
    if (!res.ok) assert.deepEqual(res.issues, []);
  });
});
