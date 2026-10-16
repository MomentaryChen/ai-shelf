import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFlowWebhookRequest,
  renderWebhookTemplate,
  sendFlowWebhooks,
} from "./flow-webhook.js";
import {
  FLOW_DEFINITION_SCHEMA,
  FLOW_RUN_STATE_SCHEMA,
  type FlowDefinition,
  type FlowRunState,
  type FlowWebhookDef,
} from "../shared/flow-types.js";

function flow(webhooks: FlowWebhookDef[] = []): FlowDefinition {
  return {
    schema: FLOW_DEFINITION_SCHEMA,
    id: "digest",
    fileName: "digest.flow.md",
    filePath: "",
    enabled: true,
    runner: "claude",
    httpMethod: "HEAD",
    timeoutSec: 600,
    onFail: "none",
    onSuccess: "none",
    notify: "all",
    webhooks,
    agentTool: "claude",
    profileInheritsTool: true,
    phases: [],
    body: "",
  };
}

function state(status: FlowRunState["status"], error: string | null = null): FlowRunState {
  return {
    schema: FLOW_RUN_STATE_SCHEMA,
    runId: "20260701-090000-ab12-digest",
    flowId: "digest",
    status,
    startedAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:01:30.000Z",
    completedAt: "2026-07-01T09:01:30.000Z",
    currentPhaseId: null,
    progress: { completed: 1, total: 1, percent: 100 },
    phases: [],
    outputPath: "C:\\out\\report.md",
    error,
    logPath: "",
  };
}

describe("flow-webhook", () => {
  it("fires only for configured outcomes", () => {
    const hook: FlowWebhookDef = { url: "https://x.test/h", method: "POST", on: ["failure"] };
    assert.equal(buildFlowWebhookRequest(hook, flow(), state("completed"), {}), null);
    assert.ok(buildFlowWebhookRequest(hook, flow(), state("failed", "boom"), {}));
    assert.equal(buildFlowWebhookRequest(hook, flow(), state("cancelled"), {}), null);
  });

  it("sends a default JSON body", () => {
    const req = buildFlowWebhookRequest(
      { url: "https://x.test/h", method: "POST", on: ["success"] },
      flow(),
      state("completed"),
      {},
    );
    assert.ok(req);
    assert.equal(req.init.method, "POST");
    assert.equal(req.init.headers["Content-Type"], "application/json");
    const body = JSON.parse(req.init.body!);
    assert.equal(body.flowId, "digest");
    assert.equal(body.status, "completed");
    assert.equal(body.durationSec, 90);
    assert.equal(body.outputPath, "C:\\out\\report.md");
  });

  it("renders payload templates with JSON escaping and ${ENV} expansion", () => {
    const req = buildFlowWebhookRequest(
      {
        url: "https://x.test/${HOOK_ID}",
        method: "PUT",
        on: ["failure"],
        payload: '{"text": "{flow_id} failed: {error}", "path": "{output_path}"}',
        authorization: "Bearer ${TOKEN}",
      },
      flow(),
      state("failed", 'said "no"\nline2'),
      { HOOK_ID: "abc", TOKEN: "s3cret" },
    );
    assert.ok(req);
    assert.equal(req.url, "https://x.test/abc");
    assert.equal(req.init.method, "PUT");
    assert.equal(req.init.headers.Authorization, "Bearer s3cret");
    const body = JSON.parse(req.init.body!);
    assert.equal(body.text, 'digest failed: said "no"\nline2');
    assert.equal(body.path, "C:\\out\\report.md");
  });

  it("does not JSON-escape non-JSON payloads and URL-encodes GET placeholders", () => {
    assert.equal(
      renderWebhookTemplate("status={status}", { status: "a b" }, { json: false }),
      "status=a b",
    );
    const req = buildFlowWebhookRequest(
      { url: "https://x.test/ping?flow={flow_id}&err={error}", method: "GET", on: ["failure"] },
      flow(),
      state("failed", "a&b"),
      {},
    );
    assert.ok(req);
    assert.equal(req.url, "https://x.test/ping?flow=digest&err=a%26b");
    assert.equal(req.init.body, undefined);
  });

  it("sendFlowWebhooks reports failures without throwing", async () => {
    const calls: string[] = [];
    const results = await sendFlowWebhooks(
      flow([
        { url: "https://ok.test", method: "POST", on: ["success"] },
        { url: "https://down.test", method: "POST", on: ["success", "failure"] },
        { url: "https://skip.test", method: "POST", on: ["failure"] },
      ]),
      state("completed"),
      async (url) => {
        calls.push(url);
        if (url.includes("down")) throw new Error("ECONNREFUSED");
        return { ok: true, status: 204 };
      },
    );
    assert.deepEqual(calls, ["https://ok.test", "https://down.test"]);
    assert.deepEqual(
      results.map((r) => r.ok),
      [true, false],
    );
  });
});
