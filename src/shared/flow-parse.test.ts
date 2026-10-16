import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFlowDocument } from "./flow-parse.js";
import type { FlowDefinition } from "./flow-types.js";

function parse(frontmatter: string): FlowDefinition {
  const res = parseFlowDocument(
    `---\nschema: ai-shelf.flow/definition/v1\nid: demo\n${frontmatter}\n---\n\n# Body\n`,
    "demo.flow.md",
    "/tmp/demo.flow.md",
  );
  if ("error" in res) throw new Error(res.error);
  return res;
}

describe("flow-parse (phase 2b fields)", () => {
  it("parses depends_on in inline, comma and nested list forms", () => {
    const flow = parse(
      [
        "phases:",
        "  - id: a",
        "    depends_on: []",
        "  - id: b",
        "    depends_on: a",
        "  - id: c",
        "    depends_on:",
        "      - a",
        "      - b",
        "    label: Collect",
        "  - id: d",
        '    depends_on: [a, "c"]',
        "    profile: work",
        "  - id: e",
      ].join("\n"),
    );
    assert.deepEqual(
      flow.phases.map((p) => p.dependsOn),
      [[], ["a"], ["a", "b"], ["a", "c"], undefined],
    );
    assert.equal(flow.phases[2]!.label, "Collect");
    assert.equal(flow.phases[3]!.profileId, "work");
  });

  it("keeps legacy phase fields and an empty nested key unset", () => {
    const flow = parse(
      'phases:\n  - id: a\n    retry: 2\n    on_fail: skip\n    require_approval: true\n    tool_args:\n  - id: b\n    next: ""',
    );
    assert.equal(flow.phases[0]!.retry, 2);
    assert.equal(flow.phases[0]!.onFail, "skip");
    assert.equal(flow.phases[0]!.requireApproval, true);
    assert.equal(flow.phases[0]!.toolArgs, undefined);
    assert.equal(flow.phases[1]!.next, "");
  });

  it("parses env map and rejects invalid variable names", () => {
    const flow = parse('env:\n  API_BASE: https://example.com\n  QUOTED: "a b"\nprofile: work');
    assert.deepEqual(flow.env, { API_BASE: "https://example.com", QUOTED: "a b" });
    assert.equal(flow.profileId, "work");

    const bad = parseFlowDocument(
      "---\nid: demo\nenv:\n  1BAD: x\n---\n\nbody",
      "demo.flow.md",
      "",
    );
    assert.ok("error" in bad);
  });

  it("parses notifications, webhooks and retention fields", () => {
    const flow = parse(
      [
        "on_success: slack",
        "notify: failure",
        "history_max_runs: 20",
        "history_max_days: 7",
        "max_parallel: 2",
        "webhooks:",
        "  - url: https://hooks.example.com/a",
        '  - url: "https://hooks.example.com/b"',
        "    method: put",
        "    on: failure",
        "    content_type: text/plain",
        "    authorization: Bearer ${TOKEN}",
        '    payload: \'{"text": "{flow_id} {status}"}\'',
      ].join("\n"),
    );
    assert.equal(flow.onSuccess, "slack");
    assert.equal(flow.onFail, "none");
    assert.equal(flow.notify, "failure");
    assert.equal(flow.historyMaxRuns, 20);
    assert.equal(flow.historyMaxDays, 7);
    assert.equal(flow.maxParallel, 2);
    assert.equal(flow.webhooks?.length, 2);
    assert.deepEqual(flow.webhooks![0], {
      url: "https://hooks.example.com/a",
      method: "POST",
      on: ["success", "failure"],
    });
    assert.deepEqual(flow.webhooks![1], {
      url: "https://hooks.example.com/b",
      method: "PUT",
      on: ["failure"],
      contentType: "text/plain",
      authorization: "Bearer ${TOKEN}",
      payload: '{"text": "{flow_id} {status}"}',
    });
  });

  it("rejects webhooks without url or with an unsupported method", () => {
    const noUrl = parseFlowDocument("---\nid: d\nwebhooks:\n  - method: POST\n---\n\nb", "d", "");
    assert.ok("error" in noUrl);
    const badMethod = parseFlowDocument(
      "---\nid: d\nwebhooks:\n  - url: https://x.test\n    method: DELETE\n---\n\nb",
      "d",
      "",
    );
    assert.ok("error" in badMethod);
  });

  it("defaults notify to all and leaves optional fields unset", () => {
    const flow = parse("enabled: true");
    assert.equal(flow.notify, "all");
    assert.equal(flow.onSuccess, "none");
    assert.equal(flow.webhooks, undefined);
    assert.equal(flow.env, undefined);
    assert.equal(flow.historyMaxRuns, undefined);
  });
});
