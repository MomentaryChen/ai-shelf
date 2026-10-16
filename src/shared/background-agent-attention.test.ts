import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enqueuePaneNotice,
  reduceBackgroundAttention,
  strongestAttention,
  summarizeBackgroundAttention,
  type BackgroundAttentionMap,
} from "./background-agent-attention.js";

const status = (
  paneId: string,
  next: "idle" | "running" | "waiting_input" | "stalled",
  profileId = "p1",
) => ({ type: "status", paneId, profileId, next, at: 1 }) as const;

describe("background-agent-attention", () => {
  it("marks waiting_input and clears it when the agent resumes", () => {
    let m: BackgroundAttentionMap = {};
    m = reduceBackgroundAttention(m, status("a", "waiting_input"));
    assert.equal(m.a?.kind, "waiting_input");
    m = reduceBackgroundAttention(m, status("a", "running"));
    assert.equal(m.a, undefined);
  });

  it("idle clears waiting/stall but keeps finished and exit errors", () => {
    let m: BackgroundAttentionMap = {};
    m = reduceBackgroundAttention(m, status("a", "waiting_input"));
    m = reduceBackgroundAttention(m, status("a", "idle"));
    assert.equal(m.a, undefined);

    m = reduceBackgroundAttention(m, status("b", "stalled"));
    assert.equal(m.b?.kind, "error");
    m = reduceBackgroundAttention(m, status("b", "idle"));
    assert.equal(m.b, undefined);

    m = reduceBackgroundAttention(m, { type: "finished", paneId: "c", profileId: "p1", at: 2 });
    m = reduceBackgroundAttention(m, status("c", "idle"));
    assert.equal(m.c?.kind, "finished");

    m = reduceBackgroundAttention(m, {
      type: "exited",
      paneId: "d",
      profileId: "p1",
      exitCode: 1,
      at: 3,
    });
    m = reduceBackgroundAttention(m, status("d", "idle"));
    assert.equal(m.d?.kind, "error");
    assert.equal(m.d?.exitCode, 1);
  });

  it("ignores clean exits and keeps exit errors over a later ready", () => {
    let m: BackgroundAttentionMap = {};
    m = reduceBackgroundAttention(m, {
      type: "exited",
      paneId: "a",
      profileId: "p1",
      exitCode: 0,
      at: 1,
    });
    assert.deepEqual(m, {});
    m = reduceBackgroundAttention(m, {
      type: "exited",
      paneId: "a",
      profileId: "p1",
      exitCode: 2,
      at: 1,
    });
    m = reduceBackgroundAttention(m, { type: "finished", paneId: "a", profileId: "p1", at: 2 });
    assert.equal(m.a?.kind, "error");
  });

  it("returns the same reference when nothing changes", () => {
    const m0: BackgroundAttentionMap = {};
    assert.equal(reduceBackgroundAttention(m0, status("a", "idle")), m0);
    assert.equal(reduceBackgroundAttention(m0, status("a", "running")), m0);
    const m1 = reduceBackgroundAttention(m0, status("a", "waiting_input"));
    assert.equal(reduceBackgroundAttention(m1, status("a", "waiting_input")), m1);
    assert.equal(reduceBackgroundAttention(m1, { type: "retain", paneIds: new Set(["a"]) }), m1);
  });

  it("retain drops panes that left the background set", () => {
    let m: BackgroundAttentionMap = {};
    m = reduceBackgroundAttention(m, status("a", "waiting_input", "p1"));
    m = reduceBackgroundAttention(m, status("b", "waiting_input", "p2"));
    m = reduceBackgroundAttention(m, { type: "retain", paneIds: new Set(["b"]) });
    assert.deepEqual(Object.keys(m), ["b"]);
  });

  it("enqueues notices deduped by pane and capped", () => {
    let list: { paneId: string; n: number }[] = [];
    list = enqueuePaneNotice(list, { paneId: "a", n: 1 });
    list = enqueuePaneNotice(list, { paneId: "b", n: 2 });
    list = enqueuePaneNotice(list, { paneId: "a", n: 3 });
    assert.deepEqual(list, [
      { paneId: "b", n: 2 },
      { paneId: "a", n: 3 },
    ]);
    list = enqueuePaneNotice(list, { paneId: "c", n: 4 }, 2);
    assert.deepEqual(
      list.map((x) => x.paneId),
      ["a", "c"],
    );
  });

  it("picks the strongest attention kind", () => {
    assert.equal(strongestAttention([]), null);
    assert.equal(strongestAttention([null, undefined]), null);
    assert.equal(strongestAttention(["finished", "waiting_input", null]), "waiting_input");
    assert.equal(strongestAttention(["error", "finished"]), "error");
  });

  it("summarizes per profile with highest-priority kind", () => {
    let m: BackgroundAttentionMap = {};
    m = reduceBackgroundAttention(m, { type: "finished", paneId: "a", profileId: "p1", at: 1 });
    m = reduceBackgroundAttention(m, status("b", "waiting_input", "p1"));
    m = reduceBackgroundAttention(m, { type: "finished", paneId: "c", profileId: "p2", at: 1 });
    m = reduceBackgroundAttention(m, status("d", "stalled", "p2"));
    m = reduceBackgroundAttention(m, { type: "finished", paneId: "e", profileId: "p3", at: 1 });
    assert.deepEqual(summarizeBackgroundAttention(m), {
      p1: { kind: "waiting_input", count: 2 },
      p2: { kind: "error", count: 2 },
      p3: { kind: "finished", count: 1 },
    });
  });
});
