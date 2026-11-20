import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lastMeaningfulLine,
  nextAttentionPaneId,
  reduceAttentionInbox,
  sortAttentionInbox,
  waitDuration,
  type AttentionInboxMap,
} from "./attention-inbox.js";

const status = (
  paneId: string,
  next: "idle" | "running" | "waiting_input" | "stalled",
  at = 1,
  extra: { line?: string; viewing?: boolean } = {},
) => ({ type: "status", paneId, next, at, ...extra }) as const;

describe("attention-inbox reducer", () => {
  it("queues waiting_input and clears it when the pane gets busy again", () => {
    let m: AttentionInboxMap = {};
    m = reduceAttentionInbox(m, status("a", "waiting_input", 10, { line: "Allow this?" }));
    assert.deepEqual(m.a, { kind: "waiting_input", since: 10, line: "Allow this?" });
    m = reduceAttentionInbox(m, status("a", "running", 20));
    assert.equal(m.a, undefined);
  });

  it("keeps the original wait start when the same kind repeats", () => {
    let m: AttentionInboxMap = {};
    m = reduceAttentionInbox(m, status("a", "waiting_input", 10, { line: "one" }));
    const same = reduceAttentionInbox(m, status("a", "waiting_input", 50));
    assert.equal(same, m);
    m = reduceAttentionInbox(m, status("a", "waiting_input", 60, { line: "two" }));
    assert.equal(m.a?.since, 10);
    assert.equal(m.a?.line, "two");
  });

  it("does not queue a pane the user is looking at, and clears it", () => {
    let m: AttentionInboxMap = {};
    m = reduceAttentionInbox(m, status("a", "waiting_input", 1, { viewing: true }));
    assert.equal(m.a, undefined);
    m = reduceAttentionInbox(m, status("a", "stalled", 2));
    assert.equal(m.a?.kind, "error");
    m = reduceAttentionInbox(m, status("a", "waiting_input", 3, { viewing: true }));
    assert.equal(m.a, undefined);
    m = reduceAttentionInbox(m, { type: "finished", paneId: "b", at: 4, viewing: true });
    assert.equal(m.b, undefined);
    m = reduceAttentionInbox(m, {
      type: "exited",
      paneId: "c",
      exitCode: 1,
      at: 5,
      viewing: true,
    });
    assert.equal(m.c, undefined);
  });

  it("idle clears waiting/stall but keeps finished and exit errors", () => {
    let m: AttentionInboxMap = {};
    m = reduceAttentionInbox(m, status("a", "waiting_input"));
    m = reduceAttentionInbox(m, status("a", "idle"));
    assert.equal(m.a, undefined);

    m = reduceAttentionInbox(m, status("b", "stalled"));
    m = reduceAttentionInbox(m, status("b", "idle"));
    assert.equal(m.b, undefined);

    m = reduceAttentionInbox(m, { type: "finished", paneId: "c", at: 2 });
    m = reduceAttentionInbox(m, status("c", "idle"));
    assert.equal(m.c?.kind, "finished");

    m = reduceAttentionInbox(m, { type: "exited", paneId: "d", exitCode: 1, at: 3 });
    m = reduceAttentionInbox(m, status("d", "idle"));
    assert.equal(m.d?.exitCode, 1);
  });

  it("exit errors are sticky against a later finished; exit 0 is ignored", () => {
    let m: AttentionInboxMap = {};
    m = reduceAttentionInbox(m, { type: "exited", paneId: "a", exitCode: 2, at: 1 });
    m = reduceAttentionInbox(m, { type: "finished", paneId: "a", at: 2 });
    assert.equal(m.a?.kind, "error");
    const before = m;
    m = reduceAttentionInbox(m, { type: "exited", paneId: "b", exitCode: 0, at: 3 });
    assert.equal(m, before);
  });

  it("seen and retain remove entries; unchanged maps keep their reference", () => {
    let m: AttentionInboxMap = {};
    m = reduceAttentionInbox(m, status("a", "waiting_input"));
    m = reduceAttentionInbox(m, status("b", "waiting_input"));
    assert.equal(reduceAttentionInbox(m, { type: "seen", paneId: "zzz" }), m);
    m = reduceAttentionInbox(m, { type: "seen", paneId: "a" });
    assert.deepEqual(Object.keys(m), ["b"]);
    assert.equal(reduceAttentionInbox(m, { type: "retain", paneIds: new Set(["b"]) }), m);
    m = reduceAttentionInbox(m, { type: "retain", paneIds: new Set() });
    assert.deepEqual(m, {});
  });
});

describe("attention-inbox ordering", () => {
  it("sorts waiting before errors before finished, oldest first", () => {
    let m: AttentionInboxMap = {};
    m = reduceAttentionInbox(m, { type: "finished", paneId: "f", at: 1 });
    m = reduceAttentionInbox(m, status("w2", "waiting_input", 30));
    m = reduceAttentionInbox(m, status("e", "stalled", 5));
    m = reduceAttentionInbox(m, status("w1", "waiting_input", 20));
    assert.deepEqual(
      sortAttentionInbox(m).map((i) => i.paneId),
      ["w1", "w2", "e", "f"],
    );
  });

  it("next pane skips the one already focused", () => {
    const items = [{ paneId: "a" }, { paneId: "b" }];
    assert.equal(nextAttentionPaneId(items, null), "a");
    assert.equal(nextAttentionPaneId(items, "a"), "b");
    assert.equal(nextAttentionPaneId([{ paneId: "a" }], "a"), null);
    assert.equal(nextAttentionPaneId([], null), null);
  });
});

describe("lastMeaningfulLine", () => {
  it("skips prompt chrome, box drawing and blank lines", () => {
    const tail = [
      "Reading files",
      "Do you want to make this edit to app.ts?",
      "╭──────────────╮",
      "│ ❯ 1. Yes     │",
      "╰──────────────╯",
      "  ",
      "❯ ",
    ].join("\n");
    assert.equal(lastMeaningfulLine(tail), "❯ 1. Yes");
  });

  it("returns empty when nothing meaningful remains", () => {
    assert.equal(lastMeaningfulLine(""), "");
    assert.equal(lastMeaningfulLine("\n⠋\n───\n$ \n"), "");
  });

  it("truncates long lines and collapses whitespace", () => {
    assert.equal(lastMeaningfulLine("a    b\r\n"), "a b");
    const long = "x".repeat(300);
    const line = lastMeaningfulLine(long, 20);
    assert.equal(line.length, 20);
    assert.ok(line.endsWith("…"));
  });
});

describe("waitDuration", () => {
  it("buckets into now / seconds / minutes / hours", () => {
    assert.deepEqual(waitDuration(1_000), { unit: "now", value: 0 });
    assert.deepEqual(waitDuration(42_000), { unit: "s", value: 42 });
    assert.deepEqual(waitDuration(3 * 60_000 + 5_000), { unit: "m", value: 3 });
    assert.deepEqual(waitDuration(2 * 3_600_000 + 1), { unit: "h", value: 2 });
    assert.deepEqual(waitDuration(-5), { unit: "now", value: 0 });
  });
});
