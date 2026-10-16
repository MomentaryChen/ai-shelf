import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectBackgroundProfilePanes,
  LayoutChangeNotifyingMap,
  parseProfileCacheKey,
} from "./background-profile-panes.js";
import type { LayoutNode, PaneInfo } from "./split-tree.js";

const pane = (id: string): PaneInfo => ({ id, tool: "claude", sessionId: id, cwd: "" });
const leaf = (id: string): LayoutNode => ({ kind: "pane", pane: pane(id) });
const split = (a: string, b: string): LayoutNode => ({
  kind: "split",
  id: `s-${a}-${b}`,
  direction: "horizontal",
  ratio: 0.5,
  first: leaf(a),
  second: leaf(b),
});

describe("background-profile-panes", () => {
  it("parses cache keys", () => {
    assert.deepEqual(parseProfileCacheKey("ws:prof"), { workspaceId: "ws", profileId: "prof" });
    assert.deepEqual(parseProfileCacheKey("prof"), { workspaceId: "", profileId: "prof" });
  });

  it("collects panes from every profile except the active one", () => {
    const entries: [string, { layout: LayoutNode }][] = [
      ["w:a", { layout: split("a1", "a2") }],
      ["w:b", { layout: leaf("b1") }],
    ];
    const bg = collectBackgroundProfilePanes(entries, "w:b");
    assert.deepEqual(
      bg.map((b) => [b.profileId, b.pane.id]),
      [
        ["a", "a1"],
        ["a", "a2"],
      ],
    );
    assert.equal(collectBackgroundProfilePanes(entries, null).length, 3);
  });

  it("notifies only on key or layout changes", () => {
    let calls = 0;
    const map = new LayoutChangeNotifyingMap<{ layout: LayoutNode; focused: string | null }>(
      () => {
        calls += 1;
      },
    );
    const layout = leaf("x");
    map.set("w:a", { layout, focused: null });
    assert.equal(calls, 1);
    map.set("w:a", { layout, focused: "x" });
    assert.equal(calls, 1);
    map.set("w:a", { layout: leaf("y"), focused: "y" });
    assert.equal(calls, 2);
    assert.equal(map.delete("missing"), false);
    assert.equal(calls, 2);
    map.delete("w:a");
    assert.equal(calls, 3);
    map.clear();
    assert.equal(calls, 3);
  });
});
