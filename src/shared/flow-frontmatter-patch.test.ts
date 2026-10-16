import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureFlowDefaultsInContent,
  patchFlowNotifyInContent,
  patchFlowRunnerInContent,
} from "./flow-frontmatter-patch.js";
import { parseFlowDocument } from "./flow-parse.js";

const BASE = `---
schema: ai-shelf.flow/definition/v1
id: demo
enabled: true
phases:
  - id: a
  - id: b
---

# Body
`;

function parse(content: string) {
  const res = parseFlowDocument(content, "demo.flow.md", "");
  if ("error" in res) throw new Error(res.error);
  return res;
}

function unwrap(res: { content: string } | { error: string }): string {
  if ("error" in res) throw new Error(res.error);
  return res.content;
}

describe("flow-frontmatter-patch (phase 2b)", () => {
  it("writes and removes the env block without touching phases", () => {
    const withEnv = unwrap(
      patchFlowRunnerInContent(BASE, { env: { API_BASE: "https://x.test", NAME: "a b" } }),
    );
    const flow = parse(withEnv);
    assert.deepEqual(flow.env, { API_BASE: "https://x.test", NAME: "a b" });
    assert.deepEqual(
      flow.phases.map((p) => p.id),
      ["a", "b"],
    );

    const replaced = unwrap(patchFlowRunnerInContent(withEnv, { env: { ONLY: "1" } }));
    assert.deepEqual(parse(replaced).env, { ONLY: "1" });

    const removed = unwrap(patchFlowRunnerInContent(replaced, { env: null }));
    assert.equal(parse(removed).env, undefined);
    assert.ok(!removed.includes("env:"));
  });

  it("round-trips notifications and webhooks", () => {
    const patched = unwrap(
      patchFlowNotifyInContent(BASE, {
        notify: "failure",
        onSuccess: "slack",
        onFail: "slack",
        historyMaxRuns: 10,
        historyMaxDays: 3,
        webhooks: [
          {
            url: "https://hooks.test/a?x=1",
            method: "POST",
            on: ["success", "failure"],
            payload: `{"text": "it's {status}"}`,
          },
          { url: "https://hooks.test/b", method: "GET", on: ["failure"] },
        ],
      }),
    );
    const flow = parse(patched);
    assert.equal(flow.notify, "failure");
    assert.equal(flow.onSuccess, "slack");
    assert.equal(flow.onFail, "slack");
    assert.equal(flow.historyMaxRuns, 10);
    assert.equal(flow.historyMaxDays, 3);
    assert.deepEqual(flow.webhooks, [
      {
        url: "https://hooks.test/a?x=1",
        method: "POST",
        on: ["success", "failure"],
        payload: `{"text": "it's {status}"}`,
      },
      { url: "https://hooks.test/b", method: "GET", on: ["failure"] },
    ]);

    const cleared = unwrap(
      patchFlowNotifyInContent(patched, {
        notify: "all",
        onSuccess: "none",
        webhooks: null,
        historyMaxRuns: null,
      }),
    );
    const flow2 = parse(cleared);
    assert.equal(flow2.notify, "all");
    assert.equal(flow2.onSuccess, "none");
    assert.equal(flow2.onFail, "slack");
    assert.equal(flow2.webhooks, undefined);
    assert.equal(flow2.historyMaxRuns, undefined);
    assert.equal(flow2.historyMaxDays, 3);
  });

  it("ensureFlowDefaultsInContent rejects invalid graphs on save", () => {
    const looped = BASE.replace("  - id: b", "  - id: b\n    next: a");
    const res = ensureFlowDefaultsInContent(looped);
    assert.ok("error" in res);
    assert.match(res.error, /Phase loop/);
  });
});
