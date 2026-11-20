import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectKeptTerminals } from "./terminal-keep-alive.js";
import type { PaneInfo } from "./split-tree.js";

const pane = (id: string, sessionId = `s-${id}`): PaneInfo => ({
  id,
  tool: "claude",
  sessionId,
  cwd: "",
});

const ids = (panes: PaneInfo[]) => panes.map((p) => p.id);

describe("selectKeptTerminals", () => {
  it("keeps on-screen panes and records when they were shown", () => {
    const r = selectKeptTerminals({
      livePanes: [pane("a"), pane("b")],
      shownSessionIds: new Set(["s-a"]),
      excludedPaneIds: new Set(),
      lastShown: new Map(),
      tick: 1,
    });
    assert.deepEqual(ids(r.panes), ["a"]);
    assert.deepEqual([...r.lastShown], [["s-a", 1]]);
  });

  it("keeps a pane off screen once it has been shown", () => {
    const r = selectKeptTerminals({
      livePanes: [pane("a"), pane("b")],
      shownSessionIds: new Set(["s-b"]),
      excludedPaneIds: new Set(),
      lastShown: new Map([["s-a", 1]]),
      tick: 2,
    });
    assert.deepEqual(ids(r.panes), ["a", "b"]);
    assert.equal(r.lastShown.get("s-a"), 1);
    assert.equal(r.lastShown.get("s-b"), 2);
  });

  it("drops sessions that are no longer live", () => {
    const r = selectKeptTerminals({
      livePanes: [pane("b")],
      shownSessionIds: new Set(["s-b"]),
      excludedPaneIds: new Set(),
      lastShown: new Map([["s-a", 1]]),
      tick: 2,
    });
    assert.deepEqual(ids(r.panes), ["b"]);
    assert.equal(r.lastShown.has("s-a"), false);
  });

  it("never keeps a pane shown in a view window", () => {
    const r = selectKeptTerminals({
      livePanes: [pane("a"), pane("b")],
      shownSessionIds: new Set(["s-b"]),
      excludedPaneIds: new Set(["a"]),
      lastShown: new Map([["s-a", 1]]),
      tick: 2,
    });
    assert.deepEqual(ids(r.panes), ["b"]);
  });

  it("evicts the least recently shown parked panes past the cap", () => {
    const r = selectKeptTerminals({
      livePanes: [pane("a"), pane("b"), pane("c"), pane("d")],
      shownSessionIds: new Set(["s-d"]),
      excludedPaneIds: new Set(),
      lastShown: new Map([
        ["s-a", 3],
        ["s-b", 1],
        ["s-c", 2],
      ]),
      tick: 4,
      maxParked: 2,
    });
    assert.deepEqual(ids(r.panes), ["a", "c", "d"]);
  });

  it("dedupes a session listed twice (layout + live cache)", () => {
    const r = selectKeptTerminals({
      livePanes: [pane("a"), pane("a")],
      shownSessionIds: new Set(["s-a"]),
      excludedPaneIds: new Set(),
      lastShown: new Map(),
      tick: 1,
    });
    assert.deepEqual(ids(r.panes), ["a"]);
  });
});
